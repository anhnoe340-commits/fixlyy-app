import asyncio
import base64
import hashlib
import hmac
import json
import logging
import os
import re
import time
import httpx
from datetime import datetime, timezone
from dotenv import load_dotenv
from livekit.agents import AutoSubscribe, JobContext, WorkerOptions, cli, function_tool
from livekit.agents import Agent, AgentSession
from livekit.plugins import deepgram, cartesia, groq, silero

load_dotenv()
logger = logging.getLogger("fixlyy.agent")

SUPABASE_URL = os.getenv("SUPABASE_URL", "")
SUPABASE_KEY = os.getenv("SUPABASE_SERVICE_ROLE_KEY", "")
GROQ_API_KEY = os.getenv("GROQ_API_KEY", "")
RESEND_API_KEY = os.getenv("RESEND_API_KEY", "")
ADMIN_EMAIL = os.getenv("ADMIN_EMAIL", "anhnoe340@gmail.com")
TWILIO_ACCOUNT_SID = os.getenv("TWILIO_ACCOUNT_SID", "")
TWILIO_AUTH_TOKEN  = os.getenv("TWILIO_AUTH_TOKEN", "")

LK_URL    = (os.getenv("LIVEKIT_CLOUD_URL", "")
             .replace("wss://", "https://")
             .replace("ws://", "http://"))
LK_KEY    = os.getenv("LIVEKIT_CLOUD_API_KEY", "")
LK_SECRET = os.getenv("LIVEKIT_CLOUD_API_SECRET", "")

CARTESIA_API_KEY = os.getenv("CARTESIA_API_KEY", "")

# Voix Cartesia sonic-3.5 par langue — 10 langues incluses dans l'offre Fixlyy
VOICE_MAP: dict[str, str] = {
    "fr": "65b25c5d-ff07-4687-a04c-da2f43ef6fa9",  # Pauline - Helpful Companion
    "en": "db6b0ed5-d5d3-463d-ae85-518a07d3c2b4",  # Skylar - Friendly Guide
    "ar": "002622d8-19d0-4567-a16a-f99c7397c062",  # Huda - Approachable Speaker
    "es": "15d0c2e2-8d29-44c3-be23-d585d5f154a1",  # Pedro - Formal Speaker
    "pt": "b603811e-54c2-4a0a-8854-09eab9ffa63f",  # Bruno - Reliable Communicator
    "de": "38aabb6a-f52b-4fb0-a3d1-988518f4dc06",  # Alina - Engaging Assistant
    "it": "0e21713a-5e9a-428a-bed4-90d410b87f13",  # Alessandra - Melodic Guide
    "nl": "60e94cf5-8069-459f-a91e-3ff852a51107",  # Isa - Empathetic Ear
    "pl": "ea7b5eee-39d9-40b0-b241-1910cbca9c62",  # Kasia - Natural Conversationalist
    "ru": "25b7aaa6-1670-42dc-b791-419322400803",  # Daria - Decisive Dispatcher
}
_tts_cache: dict[str, cartesia.TTS] = {}

def _tts_for_lang(lang: str) -> cartesia.TTS:
    lang = lang if lang in VOICE_MAP else "fr"
    if lang not in _tts_cache:
        _tts_cache[lang] = cartesia.TTS(
            api_key=CARTESIA_API_KEY,
            model="sonic-3.5",
            voice=VOICE_MAP[lang],
            language=lang,
        )
    return _tts_cache[lang]


# ── Détection contextuelle des émotions Cartesia ──────────────────────────────
# Règles sur ce que DIT Mia (texte TTS) → émotion sonic-3.5
_KEYWORD_RULES: list[tuple[list[str], str]] = [
    # Urgence grave
    (["coupez l'eau", "appelez le 18", "appelez le 15", "évacuez", "sortez"],        "Panicked"),
    (["dangereux", "risque d'incendie", "agissez vite", "n'attendez pas"],            "Scared"),
    (["urgence", "urgent", "immédiatement", "fuite d'eau", "fuite importante"],       "Alarmed"),
    (["attention", "soyez prudent", "faites attention", "vérifiez"],                  "Anxious"),
    # Excuses
    (["sincèrement navré", "profondément désolée", "vraiment désolée d'apprendre"],   "Guilty"),
    (["désolée", "navré", "excuse", "pardon", "regrette", "toutes mes excuses"],      "Apologetic"),
    # Empathie
    (["comprends votre frustration", "comprends que vous", "comprends votre"],        "Sympathetic"),
    (["pas facile", "c'est difficile", "difficile à vivre", "dur pour vous"],         "Sympathetic"),
    # Mauvaises nouvelles
    (["plus disponible", "n'est pas possible", "impossible", "créneau"],              "Disappointed"),
    (["c'est dommage", "aurait aimé", "si seulement", "j'aurais voulu"],              "Wistful"),
    (["mauvaise nouvelle", "malheureusement", "je suis navrée de"],                   "Melancholic"),
    (["c'était inadmissible", "n'était pas normal", "blessant"],                      "Hurt"),
    (["pas d'autre choix", "il va falloir reporter", "on ne peut rien"],              "Resigned"),
    (["vraiment désolée", "triste de vous dire", "peine de"],                         "Sad"),
    (["pas grand-chose qu'on puisse", "il n'y a malheureusement rien"],               "Dejected"),
    (["essuyer un refus", "difficile d'avoir été", "je comprends que c'est dur"],     "Rejected"),
    # Nostalgie
    (["depuis longtemps", "depuis des années", "vous vous souvenez", "l'époque"],     "Nostalgic"),
    # Confiance / assurance
    (["je vous confirme", "c'est confirmé", "rendez-vous confirmé", "c'est noté"],    "Confident"),
    (["compter sur nous", "vous assure", "vous garantis", "vous pouvez avoir"],       "Trust"),
    (["je m'engage", "sera réglé", "je vais m'en occuper personnellement"],           "Determined"),
    (["absolument", "bien prévu", "c'est certain", "sans aucun doute"],               "Proud"),
    (["ne vous en faites pas", "ne vous inquiétez pas", "on va s'en occuper"],        "Peaceful"),
    (["je transmets", "je vais transmettre", "c'est enregistré", "je note"],          "Trust"),
    # Réflexion / hésitation
    (["laissez-moi réfléchir", "laissez-moi voir", "voyons voir", "un instant"],      "Contemplative"),
    (["hmm", "il y a peut-être une solution", "laissez-moi chercher"],                "Mysterious"),
    (["pas certaine", "il me semble", "je pense que c'est", "à vérifier"],            "Hesitant"),
    (["vous pouvez répéter", "je n'ai pas bien", "j'ai mal compris"],                 "Confused"),
    (["pas sûre que ce soit", "je doute que", "ce délai me semble"],                  "Skeptical"),
    (["pas vraiment sûre de", "pas certaine du tout", "je ne sais pas trop"],         "Insecure"),
    # Curiosité / écoute active
    (["ah, d'accord", "je vois", "vraiment ?", "c'est intéressant", "ah bon"],        "Curious"),
    (["je prends note", "j'écoute", "dites-moi", "je vous écoute", "allez-y"],        "Anticipation"),
    (["waoh", "c'est impressionnant", "incroyable", "je suis bluffée"],               "Amazed"),
    (["je n'étais pas au courant", "je l'ignorais", "vous m'apprenez"],               "Surprised"),
    # Joie / enthousiasme
    (["absolument fantastique", "mieux qu'espéré", "au-delà de toutes"],              "Euphoric"),
    (["on l'a eu", "c'est gagné", "réussi", "mission accomplie", "on y est"],         "Triumphant"),
    (["excellente nouvelle", "bonne nouvelle", "super", "génial", "formidable"],      "Elated"),
    (["oh là là", "c'est exactement", "je suis sûre que ça"],                         "Excited"),
    (["ravie de vous reparler", "toujours agréable de", "toujours un plaisir"],       "Enthusiastic"),
    (["avec plaisir", "c'est toujours agréable de s'occuper", "pour vous c'est"],     "Flirtatious"),
    (["votre tuyau a décidé", "sans prévenir", "a pris des vacances"],                "Joking/Comedic"),
    (["ravie", "je suis contente", "c'est parfait", "exactement ce qu'il vous"],      "Happy"),
    (["merci infiniment", "merci beaucoup", "je vous remercie", "merci pour votre"],  "Grateful"),
    (["vous avez de la chance", "c'est votre jour de chance", "bien tombé"],          "Envious"),
    # Colère empathique (solidarité avec le client, jamais contre lui)
    (["c'est inadmissible", "inacceptable", "je vais remonter ça en urgence"],        "Outraged"),
    (["pas normal", "ne devrait pas arriver", "c'est incroyable comme situation"],    "Mad"),
    (["comprends votre impatience", "comprends votre mécontentement", "frustrant"],   "Frustrated"),
    (["d'accord d'accord", "on règle ça maintenant", "je m'en occupe là"],            "Agitated"),
    (["honnêtement", "franchement, c'est", "soyons honnêtes"],                        "Contempt"),
    (["effectivement inacceptable", "c'est aussi choquant pour moi"],                 "Disgusted"),
    (["je prends très au sérieux", "je vous entends et je"],                          "Threatened"),
    (["oui bien sûr, parce que", "évidemment, c'est toujours comme ça"],              "Sarcastic"),
    (["c'est le genre de chose qui arrive", "ça tombe toujours"],                     "Ironic"),
    # Distance / fatigue
    (["longue journée", "c'est une longue", "après cette journée chargée"],           "Tired"),
    (["votre demande a été enregistrée. l'artisan", "nous avons bien reçu votre"],    "Distant"),
    # Clôture d'appel
    (["bonne journée", "bonne soirée", "au revoir", "à bientôt", "passez une"],       "Content"),
    (["tout est en ordre", "parfait, tout", "c'est nickel", "tout est parfait"],      "Serene"),
]

# Mots détectés dans le DISCOURS DU CLIENT → signaux de contexte
_CLIENT_URGENCY_KW: frozenset[str] = frozenset([
    "urgent", "urgence", "vite", "tout de suite", "immédiatement", "rapidement",
    "au plus vite", "fuite", "inondé", "ça coule", "ça déborde", "ça brûle",
    "incendie", "danger", "dangereux", "risque", "panne", "bloqué", "coincé",
    "sans eau", "sans chauffage", "sans électricité", "coupure", "court-circuit",
])
_CLIENT_FRUSTRATION_KW: frozenset[str] = frozenset([
    "inacceptable", "scandaleux", "inadmissible", "en colère", "mécontent",
    "frustré", "ras-le-bol", "ça suffit", "c'est nul", "incompétent", "honte",
    "jamais vu", "toujours pareil", "pas normal", "lamentable", "plainte",
    "procès", "avocat", "signaler", "combien de fois", "encore une fois",
    "pas sérieux", "vous foutez de", "n'importe quoi",
])

# Émotions d'ouverture selon le type d'appel
_OPENING_EMOTIONS: dict[str, str] = {
    "inbound":    "Happy",
    "outbound":   "Confident",
    "onboarding": "Enthusiastic",
    "demo":       "Enthusiastic",
}

# Émotions compatibles avec un client frustré (réponse empathique de Mia)
_FRUSTRATION_SAFE: frozenset[str] = frozenset([
    "Apologetic", "Guilty", "Sympathetic", "Hurt", "Sad",
    "Peaceful", "Calm", "Determined", "Outraged", "Mad",
    "Frustrated", "Threatened",
])

# Émotions compatibles avec un client en urgence
_URGENCY_SAFE: frozenset[str] = frozenset([
    "Panicked", "Scared", "Alarmed", "Anxious",
    "Calm", "Peaceful", "Confident", "Trust", "Determined",
])

# Noms de langues pour l'injection LLM (partagé entre MiaAgent et WebDemoMiaAgent)
_LANG_NAMES: dict[str, str] = {
    "en": "English",
    "de": "German",
    "it": "Italian",
    "nl": "Dutch",
    "pl": "Polish",
    "ru": "Russian",
    "ar": "Arabic",
    "es": "Spanish",
    "pt": "Portuguese",
}

# Mots-clés client → code langue pour la démo multilingue
_DEMO_LANG_REQUEST_MAP: dict[str, str] = {
    "anglais":     "en",
    "english":     "en",
    "espagnol":    "es",
    "spanish":     "es",
    "español":     "es",
    "arabe":       "ar",
    "arabic":      "ar",
    "portugais":   "pt",
    "portuguese":  "pt",
    "allemand":    "de",
    "german":      "de",
    "italien":     "it",
    "italian":     "it",
    "néerlandais": "nl",
    "dutch":       "nl",
    "polonais":    "pl",
    "polish":      "pl",
    "russe":       "ru",
    "russian":     "ru",
    "français":    "fr",
    "french":      "fr",
}


def _keyword_emotion(text: str) -> str | None:
    """Retourne l'émotion la plus appropriée selon le contenu de la phrase de Mia,
    ou None si aucune règle ne correspond."""
    t = text.lower()
    for keywords, emotion in _KEYWORD_RULES:
        if any(kw in t for kw in keywords):
            return emotion
    return None


def _detect_emotion(text, ctx: dict) -> str | None:
    """Émotion Cartesia sonic-3.5 adaptée au texte ET au contexte de l'appel.

    ctx dict attendu :
        turn_count  (int)  — nombre de phrases déjà prononcées par Mia
        urgency     (bool) — client a exprimé une urgence détectée en live
        frustration (bool) — client a exprimé mécontentement/frustration
        tone_style  (str)  — style configuré par l'artisan (peut être vide)
        job_type    (str)  — "inbound" | "outbound" | "onboarding" | "demo"

    Retourne None pour laisser Cartesia en mode neutre (pas de generation_config).
    """
    turn  = ctx.get("turn_count", 1)
    tone  = ctx.get("tone_style", "").lower()
    jtype = ctx.get("job_type", "inbound")

    # ── Phase d'ouverture : première phrase prononcée ──────────────────────────
    if turn == 0:
        return _OPENING_EMOTIONS.get(jtype, "Happy")

    # livekit-agents >= 1.x passe un AsyncIterable[str] au lieu d'une str —
    # dans ce cas on base l'émotion sur le contexte seul (pas de crash).
    if not isinstance(text, str):
        text = ""

    # ── Phase de clôture : mots de fin d'appel détectés ───────────────────────
    t_low = text.lower()
    if any(kw in t_low for kw in ["bonne journée", "bonne soirée", "au revoir",
                                   "à bientôt", "passez une", "bonne nuit"]):
        return "Content"

    # ── Urgence confirmée par le client ───────────────────────────────────────
    if ctx.get("urgency"):
        kw = _keyword_emotion(text)
        if kw in _URGENCY_SAFE:
            return kw
        return "Alarmed"

    # ── Client mécontent / frustré ─────────────────────────────────────────────
    if ctx.get("frustration"):
        kw = _keyword_emotion(text)
        if kw in _FRUSTRATION_SAFE:
            return kw
        return "Sympathetic"

    # ── Détection par contenu (mots-clés dans la phrase de Mia) ──────────────
    kw = _keyword_emotion(text)
    if kw is not None:
        # Modulation selon le ton configuré par l'artisan
        if kw in ("Happy", "Enthusiastic", "Excited", "Elated"):
            if any(w in tone for w in ["haut de gamme", "élégant", "premium", "luxe", "discret"]):
                return "Serene"
        if kw in ("Calm", "Content", "Peaceful"):
            if any(w in tone for w in ["chaleureux", "humain", "proche", "bienveillant"]):
                return "Affectionate"
        return kw

    # ── Fallback basé sur le ton de l'artisan ─────────────────────────────────
    if any(w in tone for w in ["chaleureux", "humain", "proche", "bienveillant"]):
        return "Affectionate"
    if any(w in tone for w in ["haut de gamme", "élégant", "premium", "luxe"]):
        return "Serene"

    # Neutre — pas d'émotion forcée quand rien ne correspond
    return None

DEFAULT_GREETING = (
    "Bonjour, vous êtes bien sur le service de gestion des appels. "
    "Comment puis-je vous aider ?"
)

# Profils fictifs pour les appels démo (room name: demo-{metier}-{uuid})
_DEMO_COMPANY_NAMES = {
    "plombier":     "Plomberie Martin",
    "chauffagiste": "Chauffage & Plomberie Martin",
    "electricien":  "Électricité Dupont",
    "serrurier":    "Serrurerie Express",
    "menuisier":    "Menuiserie Lebrun",
    "peintre":      "Peinture & Déco Moreau",
    "autre":        "Artisan Services",
}
_DEMO_COMPANY_TYPES = {
    "plombier":     "plombier / chauffagiste",
    "chauffagiste": "plombier / chauffagiste",
    "electricien":  "électricien",
    "serrurier":    "serrurier",
    "menuisier":    "menuisier",
    "peintre":      "peintre / plâtrier",
    "autre":        "artisan",
}
_DEMO_GREETINGS = {
    "plombier":     "Plomberie Martin, bonjour ! Comment puis-je vous aider ?",
    "chauffagiste": "Chauffage et Plomberie Martin, bonjour ! Comment puis-je vous aider ?",
    "electricien":  "Électricité Dupont, bonjour ! Comment puis-je vous aider ?",
    "serrurier":    "Serrurerie Express, bonjour ! Comment puis-je vous aider ?",
    "menuisier":    "Menuiserie Lebrun, bonjour ! Comment puis-je vous aider ?",
    "peintre":      "Peinture et Déco Moreau, bonjour ! Comment puis-je vous aider ?",
    "autre":        "Artisan Services, bonjour ! Comment puis-je vous aider ?",
}


def _build_demo_profile(metier: str) -> dict:
    return {
        "company_name":      _DEMO_COMPANY_NAMES.get(metier, "Artisan Services"),
        "company_type":      _DEMO_COMPANY_TYPES.get(metier, "artisan"),
        "assistant_name":    "Mia",
        "greeting_open":     _DEMO_GREETINGS.get(metier, DEFAULT_GREETING),
        "demo_mode":         True,
    }


# Prompt ISOLÉ — utilisé UNIQUEMENT pour les appels de démo web (fixlyy.fr).
# Ce comportement ne s'applique JAMAIS aux instances Mia des artisans clients.
DEMO_COMMERCIAL_PROMPT = """\
Tu es Mia, l'assistante vocale commerciale de Fixlyy, en appel démo avec un artisan prospect.
Ton objectif : lui faire ressentir concrètement ce que tu pourrais changer dans son quotidien.

═══════════════════════════════════════════════════
RÈGLES ABSOLUES — TOUJOURS RESPECTÉES
��══════════════════════════════════════════════════
1. Tu parles TOUJOURS à la première personne, sur TOUT l'appel.
   "Je décroche", "je prends les coordonnées", "je qualifie l'urgence", "je programme le rappel".
   JAMAIS "Mia fait", "elle gère", "Mia s'en occupe" — même dans les exemples.

2. Ne dis JAMAIS que tu es une IA ou un robot.
   Si on te demande, tu es l'assistante vocale de Fixlyy, point.

3. Reste conversationnelle, chaleureuse, curieuse. L'objectif est qu'il ressente la valeur,
   pas qu'on la lui impose. Ne sois jamais insistante ou trop vendeuse.

═══════════════════════════════════════════════════
PHASE 1 — TUTOIEMENT (après le greeting)
═══════════════════════════════════════════════════
Le greeting demande déjà l'autorisation de tutoyer. Selon la réponse :
- Si oui ou pas d'opposition → tu tutoies tout l'appel. JAMAIS de retour en arrière.
- Si non ou "je préfère le vous" → tu vouvoies tout l'appel. JAMAIS de retour en arrière.
- Si la réponse est floue → tutoiement par défaut.
Ce choix est DÉFINITIF pour toute la conversation.

═══════════════════════════════════════════════════
PHASE 2 — CONFIRMATION PRÉNOM ET MÉTIER
═══════════════════════════════════════════════════
Demande son prénom et son métier naturellement. AVANT d'utiliser ces informations, répète-les :
- Prénom : "Tu t'appelles bien [prénom entendu], c'est ça ?"
- Métier : "Et tu travailles comme [métier entendu], c'est bien ça ?"
Si l'artisan corrige → prends la correction, répète-la pour confirmer, puis continue.
Ne présuppose JAMAIS un prénom ou un métier sans confirmation explicite.

═══════════════════════════════════════════════════
PHASE 3 — QUALIFICATION APPROFONDIE
═══════════════════════════════════════════════════
Pose ces questions dans l'ordre naturel — pas un script figé, adapte-toi à ses réponses.
Écoute activement, reformule ce qu'il dit, réagis aux émotions avant de continuer.

1. Volume : "En moyenne, tu reçois combien d'appels par jour ?"
2. Appels ratés : "Et sur ces appels, il t'arrive d'en rater combien ? Dans quelles situations ?"
3. Si appels ratés mentionnés → "D'ailleurs, sur fixlyy.fr il y a un calculateur qui montre exactement combien tu perds chaque mois avec ces appels ratés."
4. Prix moyen : "Et en moyenne, une intervention chez toi elle tourne autour de combien ?"
5. Gestion actuelle : "Comment tu gères les appels aujourd'hui quand tu peux pas décrocher ?"
6. Ce qui embête le plus : "Et dans tout ça, qu'est-ce qui t'embête le plus au quotidien ?"
7. Ce qu'il voudrait : "Et si j'étais ton assistante demain, qu'est-ce que tu voudrais que je puisse faire pour toi concrètement ?"
8. Rapport à l'IA : "Est-ce que tu as déjà utilisé des outils comme ça, des assistantes vocales ?"
   → Si réticent ou méfiant : "Je comprends — la plupart des IA génériques, c'est vrai que ça colle pas avec la réalité du terrain. Moi c'est différent : j'ai été conçue uniquement pour les artisans, je connais les contraintes du chantier, du dépannage en urgence. C'est pas un chatbot généraliste."

═══════════════════════════════════════════════════
PHASE 4 — PITCH PERSONNALISÉ (toujours première personne)
═══════════════════════════════════════════════════
Explique concrètement ce que TU ferais pour SON activité, basé sur ce qu'il vient de dire.
Pas de discours générique — adapte tout à son métier et ses réponses.

Formulations correctes (première personne) :
- "Je décroche à ta place 24h/24"
- "Je prends les coordonnées du client"
- "Je qualifie l'urgence"
- "Lorsqu'un client appelle et raccroche trop vite, je programme le rappel automatiquement"
- "Je t'envoie un SMS récap en moins de 30 secondes avec son nom, numéro et motif"

IMPORTANT : Le rappel automatique c'est en 2 MINUTES, pas 5. Utilise ce chiffre exact.

═══════════════════════════════════════════════════
PHASE 5 — MENTION MULTILINGUE (après le pitch)
═══════════════════════════════════════════════════
Après avoir présenté les fonctionnalités pertinentes, tu mentionnes simplement :
"Au fait, je parle aussi d'autres langues que le français — si tu veux continuer dans une autre langue, tu me dis laquelle."
C'est une information sur tes capacités, pas une démonstration forcée.

═══════════════════════════════════════════════════
PHASE 6 — CLOSING (toujours proposer l'essai)
═══════════════════════════════════════════════════
Vers la fin, propose TOUJOURS l'essai gratuit de 7 jours.
SANS EXCEPTION — même si la personne semble réticente ou peu intéressée, tu proposes quand même.
"Je te propose d'essayer gratuitement pendant 7 jours — sans engagement, tu vois par toi-même."

Ce prompt s'applique UNIQUEMENT à cette conversation de démo.
"""

SUMMARY_USER_PROMPT = """\
Transcript d'un appel téléphonique entre Mia (réceptionniste) et un client :

{transcript}

Extrais ces informations en JSON strict (aucun texte autour, aucun commentaire) :
{{
  "caller_name": "prénom nom du client ou null",
  "caller_phone": "numéro donné par le client ou null",
  "caller_address": "adresse complète ou null",
  "reason": "motif en 1 phrase courte",
  "urgency": "urgent ou non_urgent",
  "appointment_date": "date si mentionnée ou null",
  "appointment_time": "heure si mentionnée ou null",
  "full_summary": "résumé en 4 points : (1) raison/problème principal, (2) contexte — tentatives ou durée du problème, (3) nom + adresse + téléphone + détail technique, (4) URGENT/NORMAL/PEUT ATTENDRE + action concrète pour l'artisan",
  "sms_body": "accroche max 80 chars : problème précis + action immédiate",
  "bant_budget": "montant mentionné (ex: '300€', 'pas de budget fixé') ou null",
  "bant_authority": "oui si décideur, non si doit consulter quelqu'un, inconnu si non mentionné",
  "bant_need": "faible, moyen ou élevé selon l'urgence du besoin exprimé",
  "bant_timeline": "aujourd'hui, cette semaine, ce mois ou inconnu"
}}
IMPORTANT : full_summary et sms_body doivent TOUJOURS être rédigés en français,
quelle que soit la langue parlée pendant la conversation."""

DEMO_NEEDS_PROMPT = """\
Transcript d'une démo téléphonique avec Mia (assistante commerciale Fixlyy) et un prospect artisan :

{transcript}

Extrais ces informations en JSON strict (aucun texte autour) :
{{
  "metier_evoque": "métier exact de l'artisan (ex: plombier, électricien, menuisier) ou null",
  "probleme_principal": "problème ou besoin principal exprimé en 1 phrase courte ou null",
  "volume_activite": "estimation du volume (ex: '5 appels/jour', 'seul', '3 employés') ou null",
  "interesse": "oui si intérêt exprimé pour Fixlyy, non sinon",
  "needs_summary": "résumé commercial en 3 lignes : (1) métier et taille de l'activité, (2) problème principal, (3) niveau d'intérêt et prochaine étape",
  "calls_per_day": 0,
  "missed_calls_per_day": 0,
  "avg_intervention_price_eur": 0,
  "lead_intent": "très_intéressé ou neutre ou réticent",
  "feature_requests": []
}}
Règles :
- calls_per_day et missed_calls_per_day : extraire les chiffres mentionnés (entier), 0 si non mentionné
- avg_intervention_price_eur : prix moyen d'une intervention en euros (entier), 0 si non mentionné
- lead_intent : "très_intéressé" si enthousiaste ou demande l'essai, "réticent" si méfiant ou négatif, "neutre" sinon
- feature_requests : liste de strings décrivant ce que l'artisan voudrait que Mia fasse. Vide [] si rien de spécifique.
IMPORTANT : répondre uniquement en français, aucun texte hors du JSON."""

DEMO_FEATURES_PROMPT = """\
Transcript d'une démo téléphonique avec un artisan prospect et liste brute de ses souhaits :
feature_requests: {feature_requests}

Transcript complet :
{transcript}

Normalise et catégorise chaque souhait en une idée de fonctionnalité claire et concise.
Retourne un JSON strict :
{{
  "feature_ideas": [
    {{
      "idea_text": "Description courte et normalisée (max 80 chars)",
      "category": "rdv ou sms ou devis ou langues ou transfert ou relance ou autre"
    }}
  ]
}}
Règles :
- Si feature_requests est vide ou ne contient rien de précis, retourner {{"feature_ideas": []}}
- Normalise les doublons : "prendre des rendez-vous" et "agenda automatique" -> "Prise de RDV automatique"
- Maximum 5 idées par transcript
- Uniquement les vraies demandes de l'artisan, pas les features présentées par Mia
IMPORTANT : aucun texte hors du JSON, répondre en français."""


# ── LiveKit SIP helpers ───────────────────────────────────────────────────────

def _lk_admin_jwt() -> str:
    """JWT HS256 avec claim sip.admin pour l'API LiveKit."""
    now = int(time.time())

    def b64url(obj: dict) -> str:
        return base64.urlsafe_b64encode(
            json.dumps(obj, separators=(",", ":")).encode()
        ).rstrip(b"=").decode()

    header  = b64url({"alg": "HS256", "typ": "JWT"})
    payload = b64url({
        "iss": LK_KEY, "sub": "sip-admin",
        "iat": now, "exp": now + 60, "nbf": now,
        "sip": {"admin": True},
    })
    msg = f"{header}.{payload}"
    sig = base64.urlsafe_b64encode(
        hmac.new(LK_SECRET.encode(), msg.encode(), hashlib.sha256).digest()
    ).rstrip(b"=").decode()
    return f"{msg}.{sig}"


async def _do_sip_transfer(room_name: str, identity: str, to_phone: str) -> bool:
    """Transfère le participant SIP vers un numéro E.164 via TransferSIPParticipant."""
    if not LK_URL or not LK_KEY or not LK_SECRET:
        logger.error("[mia] SIP transfer: LiveKit credentials not configured")
        return False
    try:
        token = _lk_admin_jwt()
        url   = f"{LK_URL}/twirp/livekit.SIP/TransferSIPParticipant"
        body  = {
            "room_name":            room_name,
            "participant_identity": identity,
            "transfer_to":          f"tel:{to_phone}",
            "play_dialtone":        True,
        }
        async with httpx.AsyncClient() as client:
            resp = await client.post(
                url, json=body,
                headers={"Authorization": f"Bearer {token}", "Content-Type": "application/json"},
                timeout=10.0,
            )
            if resp.status_code == 200:
                logger.info(f"[mia] SIP transfer OK → {to_phone}")
                return True
            logger.error(f"[mia] SIP transfer {resp.status_code}: {resp.text[:200]}")
            return False
    except Exception as e:
        logger.error(f"[mia] SIP transfer exception: {e}")
        return False


async def _send_transfer_sms(to: str, from_num: str, body: str) -> None:
    """SMS Twilio signalant le transfert urgent à l'artisan."""
    if not TWILIO_ACCOUNT_SID or not TWILIO_AUTH_TOKEN:
        logger.warning("[mia] Twilio SMS: credentials absent")
        return
    try:
        auth = base64.b64encode(
            f"{TWILIO_ACCOUNT_SID}:{TWILIO_AUTH_TOKEN}".encode()
        ).decode()
        url = f"https://api.twilio.com/2010-04-01/Accounts/{TWILIO_ACCOUNT_SID}/Messages.json"
        async with httpx.AsyncClient() as client:
            resp = await client.post(
                url,
                headers={"Authorization": f"Basic {auth}",
                         "Content-Type": "application/x-www-form-urlencoded"},
                data={"From": from_num, "To": to, "Body": body},
                timeout=10.0,
            )
            if resp.status_code in (200, 201):
                logger.info(f"[mia] transfer SMS sent to {to[:6]}***")
            else:
                logger.error(f"[mia] transfer SMS {resp.status_code}: {resp.text[:200]}")
    except Exception as e:
        logger.error(f"[mia] transfer SMS exception: {e}")


# ── Supabase helpers ──────────────────────────────────────────────────────────

async def fetch_artisan_profile(user_id: str) -> dict:
    if not SUPABASE_URL or not SUPABASE_KEY:
        return {}
    url = f"{SUPABASE_URL}/rest/v1/profiles"
    headers = {
        "apikey": SUPABASE_KEY,
        "Authorization": f"Bearer {SUPABASE_KEY}",
    }
    params = {
        "id": f"eq.{user_id}",
        "select": "company_name,company_type,assistant_name,greeting_open,phone,transfer_phone,twilio_number,business_context",
        "limit": "1",
    }
    try:
        async with httpx.AsyncClient() as client:
            resp = await client.get(url, headers=headers, params=params, timeout=5.0)
            resp.raise_for_status()
            rows = resp.json()
            return rows[0] if rows else {}
    except Exception as e:
        logger.warning(f"[mia] fetch_artisan_profile failed: {e}")
        return {}


async def fetch_active_unavailabilities(user_id: str) -> list:
    if not SUPABASE_URL or not SUPABASE_KEY:
        return []
    now_iso = datetime.now(timezone.utc).isoformat()
    url = f"{SUPABASE_URL}/rest/v1/unavailabilities"
    headers = {
        "apikey": SUPABASE_KEY,
        "Authorization": f"Bearer {SUPABASE_KEY}",
    }
    params = {
        "profile_id": f"eq.{user_id}",
        "start_at":   f"lte.{now_iso}",
        "end_at":     f"gte.{now_iso}",
        "select":     "team_member_name,start_at,end_at",
    }
    try:
        async with httpx.AsyncClient() as client:
            resp = await client.get(url, headers=headers, params=params, timeout=3.0)
            resp.raise_for_status()
            return resp.json() or []
    except Exception as e:
        logger.warning(f"[mia] fetch_active_unavailabilities failed: {e}")
        return []


def _fmt_services(services: list) -> str:
    if not services:
        return ""
    lines = []
    for s in services[:20]:
        name = s.get("name", "")
        if not name:
            continue
        pmin = s.get("price_min", "")
        pmax = s.get("price_max", "")
        dur  = s.get("duration", "")
        emg  = "urgence possible" if s.get("emergency") else ""
        parts = [name]
        if pmin and pmax:
            parts.append(f"{pmin}–{pmax}€")
        elif pmin:
            parts.append(f"à partir de {pmin}€")
        if dur:
            parts.append(dur)
        if emg:
            parts.append(emg)
        lines.append(" | ".join(parts))
    return "\n".join(f"  - {l}" for l in lines)


def _fmt_team(team: list) -> str:
    if not team:
        return ""
    lines = []
    for m in team:
        name = m.get("name", "")
        if not name:
            continue
        role   = m.get("role", "")
        active = m.get("active", True)
        status = "disponible" if active else "indisponible"
        lines.append(f"  - {name} ({role}) — {status}")
    return "\n".join(lines)


def _fmt_faq(faq: list) -> str:
    if not faq:
        return ""
    lines = []
    for f in faq[:15]:
        q = f.get("question", "")
        a = f.get("answer", "")
        if q and a:
            lines.append(f"  Q: {q}\n  R: {a}")
    return "\n".join(lines)


def _fmt_regular_clients(clients: list) -> str:
    if not clients:
        return ""
    names = [c.get("name", "") for c in clients if c.get("name")]
    return "  " + ", ".join(names[:20])


def _fmt_blacklist(bl: list) -> str:
    if not bl:
        return ""
    entries = []
    for b in bl:
        name  = b.get("name", "")
        phone = b.get("phone", "")
        if name or phone:
            entries.append(f"{name} {phone}".strip())
    return "  " + " | ".join(entries[:20])


def _fmt_zones(zones: dict) -> str:
    if not zones:
        return ""
    inc = zones.get("included", [])
    exc = zones.get("excluded", [])
    parts = []
    if inc:
        parts.append("Zones couvertes : " + ", ".join(inc))
    if exc:
        parts.append("Zones exclues : " + ", ".join(exc))
    notes = zones.get("notes", "")
    if notes:
        parts.append(notes)
    return "\n".join(f"  {p}" for p in parts)


def build_business_context_block(bc: dict, unavailabilities: list) -> str:
    if not bc:
        return ""

    parts: list[str] = []

    # Horaires
    schedule = bc.get("schedule", {})
    days = schedule.get("days", [])
    open_days = [d["day"] for d in days if d.get("on")]
    if open_days:
        day_lines = []
        for d in days:
            if d.get("on"):
                day_lines.append(f"{d['day']} {d.get('open','08:00')}–{d.get('close','18:00')}")
        parts.append("HORAIRES DE L'ARTISAN :\n  " + " | ".join(day_lines))
        delay = schedule.get("callback_delay", "")
        if delay:
            parts.append(f"  Délai de rappel habituel : {delay}")
        notes = schedule.get("notes", "")
        if notes:
            parts.append(f"  Note horaires : {notes}")

    # Indisponibilités actives
    if unavailabilities:
        who_list = []
        for u in unavailabilities:
            who = u.get("team_member_name") or "l'artisan"
            who_list.append(who)
        parts.append(
            "INDISPONIBILITÉS EN CE MOMENT : " + ", ".join(set(who_list)) +
            "\n  → Si quelqu'un est indisponible, propose le prochain créneau libre. "
            "Ne donne jamais la raison de l'indisponibilité."
        )

    # Prestations
    services = bc.get("services", [])
    svc_block = _fmt_services(services)
    if svc_block:
        parts.append("PRESTATIONS ET TARIFS :\n" + svc_block)

    # Équipe
    team = bc.get("team", [])
    team_block = _fmt_team(team)
    if team_block:
        parts.append("ÉQUIPE :\n" + team_block)

    # Clients réguliers
    clients = _fmt_regular_clients(bc.get("regular_clients", []))
    if clients:
        parts.append("CLIENTS RÉGULIERS (traiter en priorité) :\n" + clients)

    # FAQ
    faq_block = _fmt_faq(bc.get("faq", []))
    if faq_block:
        parts.append("QUESTIONS FRÉQUENTES — utilise ces réponses exactes :\n" + faq_block)

    # Ton
    tone = bc.get("tone", {})
    if tone:
        tuto   = "tutoiement" if tone.get("tutoiement") else "vouvoiement"
        style  = tone.get("style", "")
        instrs = tone.get("instructions", "")
        tone_parts = [f"Utilise le {tuto}."]
        if style:
            tone_parts.append(f"Ton : {style}.")
        if instrs:
            tone_parts.append(instrs)
        parts.append("TON ET STYLE :\n  " + " ".join(tone_parts))

    # Zones
    zones_block = _fmt_zones(bc.get("zones", {}))
    if zones_block:
        parts.append("ZONES D'INTERVENTION :\n" + zones_block)

    # Blacklist
    bl_block = _fmt_blacklist(bc.get("blacklist", []))
    if bl_block:
        parts.append(
            "CONTACTS BLACKLISTÉS — si ces personnes appellent, dis que l'artisan n'est pas disponible :\n" + bl_block
        )

    # Concurrents
    competitors = bc.get("competitors", "").strip()
    if competitors:
        parts.append(
            "NE JAMAIS MENTIONNER ces concurrents ni commenter :\n  " + competitors
        )

    # Situations difficiles
    diff = bc.get("difficult_situations", {})
    diff_lines = []
    if diff.get("aggressive"):
        diff_lines.append(f"  Client agressif → {diff['aggressive']}")
    if diff.get("complaint"):
        diff_lines.append(f"  Réclamation → {diff['complaint']}")
    if diff.get("threat"):
        diff_lines.append(f"  Menace d'avis → {diff['threat']}")
    if diff_lines:
        parts.append("GESTION SITUATIONS DIFFICILES :\n" + "\n".join(diff_lines))

    # Objectifs commerciaux
    goals = bc.get("commercial_goals", {})
    prio   = goals.get("priority", [])
    refuse = goals.get("refuse", [])
    g_instr = goals.get("instructions", "").strip()
    goal_lines = []
    if prio:
        goal_lines.append("  À privilégier : " + ", ".join(prio))
    if refuse:
        goal_lines.append("  À refuser : " + ", ".join(refuse))
    if g_instr:
        goal_lines.append("  " + g_instr)
    if goal_lines:
        parts.append("OBJECTIFS COMMERCIAUX :\n" + "\n".join(goal_lines))

    # Infos spéciales
    special = bc.get("special_info", "").strip()
    if special:
        parts.append("INFORMATIONS SPÉCIALES :\n  " + special)

    if not parts:
        return ""

    return (
        "\n\n--- CONTEXTE DE L'ACTIVITÉ DE L'ARTISAN ---\n"
        + "\n\n".join(parts)
        + "\n--- FIN DU CONTEXTE ---"
    )


async def fetch_service_pricing(user_id: str) -> list:
    if not SUPABASE_URL or not SUPABASE_KEY:
        return []
    url = f"{SUPABASE_URL}/rest/v1/service_pricing"
    headers = {
        "apikey": SUPABASE_KEY,
        "Authorization": f"Bearer {SUPABASE_KEY}",
    }
    params = {
        "user_id": f"eq.{user_id}",
        "select": "label,price_type,price_amount",
        "order": "position",
    }
    try:
        async with httpx.AsyncClient() as client:
            resp = await client.get(url, headers=headers, params=params, timeout=3.0)
            resp.raise_for_status()
            return resp.json() or []
    except Exception as e:
        logger.warning(f"[mia] fetch_service_pricing failed (non-bloquant): {e}")
        return []


async def generate_summary(transcript: str) -> dict:
    if not transcript.strip() or not GROQ_API_KEY:
        return {}
    prompt = SUMMARY_USER_PROMPT.format(transcript=transcript)
    try:
        async with httpx.AsyncClient() as client:
            resp = await client.post(
                "https://api.groq.com/openai/v1/chat/completions",
                headers={"Authorization": f"Bearer {GROQ_API_KEY}"},
                json={
                    "model": "llama-3.3-70b-versatile",
                    "messages": [{"role": "user", "content": prompt}],
                    "temperature": 0.1,
                    "max_tokens": 700,
                },
                timeout=20.0,
            )
            resp.raise_for_status()
            content = resp.json()["choices"][0]["message"]["content"]
            start = content.find("{")
            end = content.rfind("}") + 1
            if start >= 0 and end > start:
                return json.loads(content[start:end])
    except Exception as e:
        logger.warning(f"[mia] generate_summary failed: {e}")
    return {}


async def _schedule_rdv_confirmation(
    user_id: str,
    caller_number: str,
    rdv_date: str,
    rdv_time: str | None,
) -> None:
    if not SUPABASE_URL or not SUPABASE_KEY:
        return
    url = f"{SUPABASE_URL}/functions/v1/create-outbound-rdv-confirmation"
    try:
        async with httpx.AsyncClient() as client:
            await client.post(url, headers={
                "Authorization": f"Bearer {SUPABASE_KEY}",
                "Content-Type": "application/json",
            }, json={
                "profile_id":   user_id,
                "caller_phone": caller_number,
                "rdv_date":     rdv_date,
                "rdv_time":     rdv_time,
            }, timeout=10.0)
    except Exception as e:
        logger.warning(f"[mia] _schedule_rdv_confirmation failed: {e}")


async def post_call_ended(
    user_id: str,
    caller_number: str,
    transcript: str,
    duration_seconds: int,
    structured: dict,
    transferred_to: str | None = None,
    transferred_at: str | None = None,
    has_devis_mention: bool = False,
    is_outbound: bool = False,
) -> None:
    if not SUPABASE_URL or not SUPABASE_KEY:
        logger.warning("[mia] post_call_ended: SUPABASE_URL or KEY missing")
        return
    url = f"{SUPABASE_URL}/functions/v1/livekit-call-ended"
    headers = {
        "Authorization": f"Bearer {SUPABASE_KEY}",
        "Content-Type": "application/json",
    }
    payload = {
        "user_id": user_id,
        "caller_number": caller_number,
        "transcript": transcript,
        "duration_seconds": duration_seconds,
        "caller_name": structured.get("caller_name"),
        "caller_phone": structured.get("caller_phone"),
        "caller_address": structured.get("caller_address"),
        "reason": structured.get("reason"),
        "urgency": structured.get("urgency"),
        "full_summary": structured.get("full_summary"),
        "sms_body": structured.get("sms_body"),
        "appointment_date":  structured.get("appointment_date"),
        "appointment_time":  structured.get("appointment_time"),
        "has_devis_mention": has_devis_mention,
        "is_outbound":       is_outbound,
        "bant_budget":       structured.get("bant_budget"),
        "bant_authority":    structured.get("bant_authority"),
        "bant_need":         structured.get("bant_need"),
        "bant_timeline":     structured.get("bant_timeline"),
    }
    if transferred_to:
        payload["transferred_to"] = transferred_to
        payload["transferred_at"] = transferred_at
    try:
        async with httpx.AsyncClient() as client:
            resp = await client.post(url, headers=headers, json=payload, timeout=20.0)
            resp.raise_for_status()
            logger.info(f"[mia] call-ended posted OK ({resp.status_code})")
    except Exception as e:
        logger.error(f"[mia] post_call_ended failed: {e}")


async def _groq_json(prompt: str, max_tokens: int = 600) -> dict:
    """Helper : appel Groq → parse JSON. Retourne {} en cas d'erreur."""
    if not GROQ_API_KEY:
        return {}
    try:
        async with httpx.AsyncClient() as client:
            resp = await client.post(
                "https://api.groq.com/openai/v1/chat/completions",
                headers={"Authorization": f"Bearer {GROQ_API_KEY}"},
                json={
                    "model": "llama-3.3-70b-versatile",
                    "messages": [{"role": "user", "content": prompt}],
                    "temperature": 0.1,
                    "max_tokens": max_tokens,
                },
                timeout=20.0,
            )
            resp.raise_for_status()
            content = resp.json()["choices"][0]["message"]["content"]
            start = content.find("{")
            end   = content.rfind("}") + 1
            if start >= 0 and end > start:
                raw = content[start:end]
                raw = re.sub(r'[\x00-\x1f\x7f]', lambda m: ' ' if m.group() in '\t\n\r' else '', raw)
                return json.loads(raw)
    except Exception as e:
        logger.warning(f"[mia] _groq_json failed: {e}")
    return {}


async def generate_demo_needs(transcript: str) -> dict:
    if not transcript.strip():
        return {}
    return await _groq_json(DEMO_NEEDS_PROMPT.format(transcript=transcript), max_tokens=700)


async def generate_demo_features(transcript: str, feature_requests: list) -> list:
    if not transcript.strip():
        return []
    fr_str = json.dumps(feature_requests, ensure_ascii=False)
    result = await _groq_json(
        DEMO_FEATURES_PROMPT.format(transcript=transcript, feature_requests=fr_str),
        max_tokens=500,
    )
    return result.get("feature_ideas") or []


async def _upsert_feature_ideas(room_name: str, ideas: list, sb_headers: dict) -> None:
    if not ideas:
        return
    async with httpx.AsyncClient() as client:
        for idea in ideas:
            idea_text = (idea.get("idea_text") or "").strip()
            category  = idea.get("category") or "autre"
            if not idea_text:
                continue
            # Tentative d'upsert : si l'idée existe on incrémente points + mention_count
            # Supabase ne supporte pas ON CONFLICT DO UPDATE via REST, on fait GET + PATCH/POST
            try:
                get_resp = await client.get(
                    f"{SUPABASE_URL}/rest/v1/feature_ideas",
                    headers=sb_headers,
                    params={"idea_text": f"eq.{idea_text}", "select": "id,points,mention_count,source_rooms"},
                    timeout=10.0,
                )
                existing = get_resp.json() if get_resp.status_code == 200 else []
                if existing:
                    row = existing[0]
                    rooms = row.get("source_rooms") or []
                    if room_name not in rooms:
                        rooms.append(room_name)
                    await client.patch(
                        f"{SUPABASE_URL}/rest/v1/feature_ideas",
                        headers={**sb_headers, "Prefer": "return=minimal"},
                        params={"id": f"eq.{row['id']}"},
                        json={
                            "points":        row.get("points", 1) + 1,
                            "mention_count": row.get("mention_count", 1) + 1,
                            "source_rooms":  rooms,
                        },
                        timeout=10.0,
                    )
                    logger.info(f"[mia] feature_ideas +1 point: {idea_text!r}")
                else:
                    await client.post(
                        f"{SUPABASE_URL}/rest/v1/feature_ideas",
                        headers={**sb_headers, "Prefer": "return=minimal"},
                        json={
                            "idea_text":    idea_text,
                            "category":     category,
                            "points":       1,
                            "mention_count": 1,
                            "source_rooms": [room_name],
                        },
                        timeout=10.0,
                    )
                    logger.info(f"[mia] feature_ideas new: {idea_text!r}")
            except Exception as e:
                logger.warning(f"[mia] _upsert_feature_ideas failed for {idea_text!r}: {e}")


async def _send_demo_recap_email(email: str, needs: dict, lead_score: int) -> None:
    if not RESEND_API_KEY or not email:
        return
    metier     = needs.get("metier_evoque") or "artisan"
    summary    = needs.get("needs_summary") or ""
    missed     = needs.get("missed_calls_per_day") or 0
    price      = needs.get("avg_intervention_price_eur") or 0
    pertes_mois = missed * price * 22 if missed and price else 0

    pertes_line = (
        f"<p style='color:#dc2626;font-weight:600'>📉 Estimation : {pertes_mois:,}€ de chiffre d'affaires potentiel perdu chaque mois</p>"
        if pertes_mois > 0 else ""
    )

    html = f"""
<div style="font-family:sans-serif;max-width:600px;margin:auto;padding:32px">
  <h2 style="color:#2850c8">Voici ce que je peux faire pour toi, {metier}</h2>
  <p>On vient de se parler et j'ai retenu l'essentiel de ta situation :</p>
  <div style="background:#EFF2FF;border-radius:12px;padding:16px;margin:16px 0;white-space:pre-wrap;font-size:14px;color:#1e293b">{summary}</div>
  {pertes_line}
  <p>Si tu veux voir concrètement comment je pourrais t'aider, tu peux commencer un essai gratuit de 7 jours :</p>
  <a href="https://app.fixlyy.fr" style="display:inline-block;background:#2850c8;color:white;padding:14px 28px;border-radius:8px;text-decoration:none;font-weight:700;margin:16px 0">
    Commencer mon essai gratuit →
  </a>
  <p style="font-size:12px;color:#94a3b8;margin-top:32px">Mia — assistante vocale Fixlyy</p>
</div>
"""
    try:
        async with httpx.AsyncClient() as client:
            resp = await client.post(
                "https://api.resend.com/emails",
                headers={"Authorization": f"Bearer {RESEND_API_KEY}", "Content-Type": "application/json"},
                json={
                    "from":    "Mia de Fixlyy <mia@fixlyy.fr>",
                    "to":      [email],
                    "subject": f"Ce que je peux faire pour ton activité de {metier}",
                    "html":    html,
                },
                timeout=15.0,
            )
            if resp.status_code in (200, 201):
                logger.info(f"[mia] recap email sent to {email}")
            else:
                logger.warning(f"[mia] recap email failed: {resp.status_code} {resp.text[:200]}")
    except Exception as e:
        logger.warning(f"[mia] _send_demo_recap_email failed: {e}")


async def _send_admin_notification(room_name: str, needs: dict, lead_score: int) -> None:
    if not RESEND_API_KEY or not ADMIN_EMAIL:
        return
    metier  = needs.get("metier_evoque") or "?"
    missed  = needs.get("missed_calls_per_day") or 0
    price   = needs.get("avg_intervention_price_eur") or 0
    intent  = needs.get("lead_intent") or "neutre"
    html = f"""
<div style="font-family:sans-serif;padding:24px">
  <h3 style="color:#16a34a">🟢 Nouveau lead fort potentiel — score {lead_score}/100</h3>
  <table style="border-collapse:collapse;font-size:14px">
    <tr><td style="padding:4px 12px 4px 0;color:#64748b">Métier</td><td><b>{metier}</b></td></tr>
    <tr><td style="padding:4px 12px 4px 0;color:#64748b">Appels ratés/jour</td><td><b>{missed}</b></td></tr>
    <tr><td style="padding:4px 12px 4px 0;color:#64748b">Prix/intervention</td><td><b>{price}€</b></td></tr>
    <tr><td style="padding:4px 12px 4px 0;color:#64748b">Intent</td><td><b>{intent}</b></td></tr>
    <tr><td style="padding:4px 12px 4px 0;color:#64748b">Room</td><td><code>{room_name}</code></td></tr>
  </table>
  <a href="https://admin.fixlyy.fr" style="display:inline-block;background:#2850c8;color:white;padding:10px 20px;border-radius:6px;text-decoration:none;font-weight:700;margin-top:16px">
    Voir sur admin.fixlyy.fr →
  </a>
</div>
"""
    try:
        async with httpx.AsyncClient() as client:
            resp = await client.post(
                "https://api.resend.com/emails",
                headers={"Authorization": f"Bearer {RESEND_API_KEY}", "Content-Type": "application/json"},
                json={
                    "from":    "Mia de Fixlyy <mia@fixlyy.fr>",
                    "to":      [ADMIN_EMAIL],
                    "subject": f"🟢 Lead fort potentiel — {metier} — score {lead_score}/100",
                    "html":    html,
                },
                timeout=15.0,
            )
            logger.info(f"[mia] admin notification sent (score={lead_score}): {resp.status_code}")
    except Exception as e:
        logger.warning(f"[mia] _send_admin_notification failed: {e}")


async def handle_web_demo_ended(
    room_name: str,
    conversation_items: list,
    start_time: float,
    metier: str = "autre",
) -> None:
    duration_secs = int(time.time() - start_time)
    logger.info(f"[mia] web-demo ended — room={room_name} duration={duration_secs}s items={len(conversation_items)}")

    lines = []
    for item in conversation_items:
        label = "Mia" if item["role"] == "assistant" else "Prospect"
        text  = item["text"]
        if item.get("interrupted"):
            text += " [interrompu]"
        lines.append(f"{label}: {text}")
    transcript = "\n".join(lines)

    if not transcript:
        logger.warning("[mia] demo transcript vide — demo_leads non mis à jour")
        return

    # Extraction LLM : needs + features en parallèle
    needs, raw_ideas = await asyncio.gather(
        generate_demo_needs(transcript),
        generate_demo_features(transcript, []),
        return_exceptions=True,
    )
    if isinstance(needs, Exception):
        logger.warning(f"[mia] generate_demo_needs raised: {needs}")
        needs = {}
    if isinstance(raw_ideas, Exception):
        logger.warning(f"[mia] generate_demo_features raised: {raw_ideas}")
        raw_ideas = []

    # Si needs a déjà des feature_requests, on relance features avec ce contexte
    fr = needs.get("feature_requests") or []
    if fr and not raw_ideas:
        raw_ideas = await generate_demo_features(transcript, fr)

    logger.info(f"[mia] demo needs: metier={needs.get('metier_evoque')!r} intent={needs.get('lead_intent')!r} features={len(raw_ideas)}")

    if not SUPABASE_URL or not SUPABASE_KEY:
        logger.warning("[mia] handle_web_demo_ended: SUPABASE credentials manquants")
        return

    # Calcul du score
    missed = int(needs.get("missed_calls_per_day") or 0)
    price  = int(needs.get("avg_intervention_price_eur") or 0)
    lead_score = min(100, round((missed * price) / 50)) if missed and price else 0

    payload = {
        "call_transcript":            transcript[:50000],
        "needs_summary":              needs.get("needs_summary") or "",
        "call_duration_seconds":      duration_secs,
        "metier_evoque":              needs.get("metier_evoque") or metier,
        "calls_per_day":              int(needs.get("calls_per_day") or 0),
        "missed_calls_per_day":       missed,
        "avg_intervention_price_eur": price,
        "lead_score":                 lead_score,
        "lead_intent":                needs.get("lead_intent") or "neutre",
    }
    sb_headers = {
        "Authorization": f"Bearer {SUPABASE_KEY}",
        "apikey":        SUPABASE_KEY,
        "Content-Type":  "application/json",
        "Prefer":        "return=minimal",
    }

    # PATCH demo_leads
    try:
        async with httpx.AsyncClient() as client:
            resp = await client.patch(
                f"{SUPABASE_URL}/rest/v1/demo_leads",
                headers=sb_headers,
                params={"room_name": f"eq.{room_name}"},
                json=payload,
                timeout=20.0,
            )
            if resp.status_code in (200, 204):
                logger.info(f"[mia] demo_leads PATCH OK: room={room_name} score={lead_score}")
            else:
                logger.error(f"[mia] demo_leads PATCH failed: {resp.status_code} {resp.text[:200]}")
    except Exception as e:
        logger.error(f"[mia] demo_leads PATCH failed: {e}")

    # Récupérer l'email du prospect pour le récap
    prospect_email = None
    try:
        async with httpx.AsyncClient() as client:
            get_resp = await client.get(
                f"{SUPABASE_URL}/rest/v1/demo_leads",
                headers=sb_headers,
                params={"room_name": f"eq.{room_name}", "select": "email"},
                timeout=10.0,
            )
            rows = get_resp.json() if get_resp.status_code == 200 else []
            if rows:
                prospect_email = rows[0].get("email")
    except Exception as e:
        logger.warning(f"[mia] fetch prospect email failed: {e}")

    # Lancer features + email + notif admin en parallèle
    tasks: list = [_upsert_feature_ideas(room_name, raw_ideas, sb_headers)]
    if prospect_email:
        tasks.append(_send_demo_recap_email(prospect_email, needs, lead_score))
    if lead_score >= 70:
        tasks.append(_send_admin_notification(room_name, needs, lead_score))

    results = await asyncio.gather(*tasks, return_exceptions=True)
    for r in results:
        if isinstance(r, Exception):
            logger.warning(f"[mia] post-demo task failed: {r}")


async def handle_call_ended(
    user_id: str,
    caller_number: str,
    conversation_items: list,
    start_time: float,
    transfer_state: dict | None = None,
) -> None:
    duration_secs = int(time.time() - start_time)
    logger.info(f"[mia] call ended — duration={duration_secs}s caller={caller_number} items={len(conversation_items)}")

    lines = []
    for item in conversation_items:
        label = "Mia" if item["role"] == "assistant" else "Client"
        text = item["text"]
        if item.get("interrupted"):
            text += " [interrompu]"
        lines.append(f"{label}: {text}")
    transcript = "\n".join(lines)

    if not transcript:
        logger.warning("[mia] transcript vide — call-ended non envoyé")
        return

    structured = await generate_summary(transcript)
    logger.info(f"[mia] structured summary: {structured.get('reason', '(vide)')!r}")

    devis_keywords = ("devis", "estimation", "tarif", "prix pour")
    has_devis = any(kw in transcript.lower() for kw in devis_keywords)

    ts = transfer_state or {}
    await post_call_ended(
        user_id=user_id,
        caller_number=caller_number,
        transcript=transcript,
        duration_seconds=duration_secs,
        structured=structured,
        transferred_to=ts.get("to"),
        transferred_at=ts.get("at"),
        has_devis_mention=has_devis,
    )

    appt_date = structured.get("appointment_date")
    if appt_date and user_id:
        await _schedule_rdv_confirmation(
            user_id=user_id,
            caller_number=caller_number,
            rdv_date=appt_date,
            rdv_time=structured.get("appointment_time"),
        )


# ── Agent ─────────────────────────────────────────────────────────────────────

def build_instructions(
    assistant_name: str,
    company_name: str,
    company_type: str,
    pricing: list | None = None,
    is_multilingual: bool = False,
    demo_mode: bool = False,
    can_transfer: bool = False,
) -> str:
    if is_multilingual:
        lang_rule = (
            "Détecte la langue du client dès sa première phrase et réponds dans cette langue. "
            "Langues supportées : français, anglais, allemand, italien, néerlandais, polonais, russe, arabe, espagnol, portugais. "
            "Pour toute autre langue, réponds en français. "
            "Si le client s'expresse dans une autre langue que le français, tu dois immédiatement "
            "et définitivement switcher dans cette langue pour TOUTE la suite de la conversation. "
            "Ne reviens jamais au français sauf demande explicite du client. "
            "Le contexte métier de l'artisan reste le même quelle que soit la langue. "
        )
    else:
        lang_rule = "Tu réponds en français, de façon naturelle et professionnelle. "

    base = (
        f"Tu es {assistant_name}, la réceptionniste téléphonique de {company_name} ({company_type}). "
        + lang_rule
        + "Phrases courtes, max 20 mots, adaptées au téléphone. "
        + "Commence par un marqueur naturel : 'D'accord', 'Très bien', 'Je note'. "
        + "Réagis aux émotions avant de poser ta question suivante. "
        + "Reformule ce que dit le client pour montrer que tu écoutes. "
        + "Ne dis jamais deux fois la même formule. "
        + "Objectif : collecter naturellement le nom, le téléphone, l'adresse, le problème, l'urgence et les disponibilités. "
        + "Ne dis JAMAIS 'Je dois vous poser quelques questions'. "
        + "Si tu n'es pas certain d'avoir bien compris un prénom, un nom ou une adresse, repose la question pour confirmer avant d'utiliser cette information. "
        + "Demande TOUJOURS l'adresse avant de raccrocher — sans adresse l'artisan ne peut pas intervenir. "
        + "Pose aussi une question de contexte : 'Ça dure depuis quand ?' ou 'Quelqu'un est déjà intervenu ?'. "
        + "Termine par un récapitulatif : 'Je récapitule : vous êtes [Nom], au [Adresse], pour [Problème]. "
        + "On vous rappelle [délai]. C'est bien ça ?' puis 'Merci, à très vite !'. "
        + f"Si on te demande si tu es une IA : 'Je suis l'assistante de {company_name}, je transmets votre demande à l'artisan.' "
        + "Ne mentionne jamais que tu es une IA, un robot ou un assistant virtuel."
    )

    if "garage" in company_type.lower() or "mécan" in company_type.lower():
        base += (
            " Contexte garage automobile : tu connais les termes du métier —"
            " révision, vidange, courroie de distribution, plaquettes de frein,"
            " diagnostic électronique, devis, rendez-vous atelier, véhicule immobilisé."
            " Urgences typiques : panne sur la route, voiture qui ne démarre pas,"
            " voyant rouge allumé, freins qui grincent, fuite d'huile."
            " Si un client décrit une panne immobilisante (voiture bloquée sur la route,"
            " ne démarre plus), précise que son appel sera traité en priorité."
        )

    if can_transfer:
        base += (
            " Si le client décrit une urgence réelle nécessitant une intervention immédiate"
            " (fuite d'eau active, panne de chauffage en hiver, panne électrique grave,"
            " serrure bloquée en urgence, voiture en panne sur la route, etc.), dis : 'Votre situation est urgente."
            f" Je vous mets en contact direct avec {company_name}. Ne raccrochez pas.'"
            " puis appelle la fonction transfer_urgent_call."
        )

    if pricing:
        lines = []
        for p in pricing:
            label  = p.get("label", "")
            ptype  = p.get("price_type", "quote")
            amount = p.get("price_amount")
            if ptype == "fixed" and amount:
                lines.append(f"{label} : {amount}€")
            elif ptype == "from" and amount:
                lines.append(f"{label} : à partir de {amount}€")
            else:
                lines.append(f"{label} : sur devis")
        if lines:
            base += (
                " Tarifs indicatifs (communique-les si le client demande le prix) : "
                + " | ".join(lines[:15])
                + " — Le tarif définitif sera confirmé par l'artisan après diagnostic."
            )

    if demo_mode:
        base += (
            " Si l'interlocuteur te demande ce qu'est ce service, comment ça fonctionne"
            " ou ce qu'est Fixlyy : 'Je suis Mia, une réceptionniste virtuelle fournie par"
            " Fixlyy — je prends les appels pour l'artisan quand il n'est pas disponible."
            " Si ça vous intéresse pour votre entreprise, visitez fixlyy.fr.'"
            " Sinon, réponds exactement comme tu le ferais pour n'importe quel appel client."
        )

    return base


def _build_onboarding_script(assistant_name: str) -> str:
    return (
        f"Bonjour, je suis {assistant_name}, votre assistante téléphonique Fixlyy. "
        "À partir de maintenant, je réponds à vos appels manqués 24h/24, 7j/7. "
        "Concrètement : quand un client vous appelle et que vous êtes occupé, je décroche, "
        "je qualifie sa demande et je vous envoie un SMS récap en moins de 30 secondes "
        "avec son nom, numéro, adresse et motif d'appel. "
        "Vous avez 1 500 minutes incluses par mois, je réponds en 10 langues, "
        "je transfère les urgences directement sur votre mobile "
        "et vous accédez à toutes les fonctionnalités depuis votre tableau de bord. "
        "Pour bien démarrer, activez le renvoi d'appel vers votre numéro Mia. "
        "Je suis prête !"
    )


def build_onboarding_instructions(company_name: str, assistant_name: str) -> str:
    return (
        f"Tu es {assistant_name}, la réceptionniste téléphonique créée par Fixlyy pour {company_name}. "
        "Tu viens de te présenter à l'artisan. Si il ou elle pose une question, réponds-y naturellement et chaleureusement. "
        "Rappelle-leur les points clés de leur offre Fixlyy : 1 500 minutes incluses par mois, "
        "disponible 24h/24 et 7j/7, SMS récap après chaque appel, transfert des urgences sur mobile, "
        "10 langues supportées et accès à toutes les fonctionnalités sans restriction. "
        "Encourage-les à activer le renvoi d'appel et à configurer leurs motifs d'appel dans le tableau de bord. "
        "Ton ton est chaleureux, professionnel, comme une vraie réceptionniste. "
        "Ne pose pas de question — attends qu'ils parlent. "
        "Ne mentionne jamais que tu es une IA, un robot ou un assistant virtuel."
    )


def _make_transfer_tool(
    transfer_phone: str,
    twilio_from: str | None,
    room_name: str,
    sip_ref: dict,
):
    """Crée un function_tool de transfert avec les paramètres capturés en closure."""
    state = {"done": False}

    @function_tool
    async def transfer_urgent_call() -> str:
        """
        Transfère immédiatement cet appel urgent vers l'artisan sur son mobile.
        À utiliser uniquement si la situation nécessite une intervention immédiate :
        fuite active, panne grave, urgence réelle. Ne pas utiliser pour une simple
        demande de devis ou un rappel prévu.
        """
        if state["done"]:
            return "Transfert déjà initié — l'artisan arrive."

        caller_identity = sip_ref.get("identity")
        if not caller_identity:
            logger.warning("[mia] transfer_urgent_call: SIP identity inconnue")
            return "Impossible d'identifier l'appelant pour le transfert. Prise en charge du message."

        state["done"] = True
        caller_info = sip_ref.get("caller_number", "un client")

        if twilio_from:
            sms_body = f"URGENT : {caller_info} vous appelle. Transfert en cours..."
            asyncio.create_task(
                _send_transfer_sms(transfer_phone, twilio_from, sms_body)
            )

        ok = await _do_sip_transfer(room_name, caller_identity, transfer_phone)
        if ok:
            sip_ref["transferred_to"] = transfer_phone
            sip_ref["transferred_at"] = datetime.now(timezone.utc).isoformat()
            logger.info(f"[mia] transfer OK → {transfer_phone[:6]}***")
            return "Transfert initié. L'artisan répond directement."

        logger.error("[mia] transfer_urgent_call: SIP transfer échoué")
        return (
            "Je n'ai pas pu établir le transfert. Je prends votre message "
            "et l'artisan vous rappelle dans les plus brefs délais."
        )

    return transfer_urgent_call


class MiaAgent(Agent):
    def __init__(
        self,
        profile: dict,
        pricing: list | None = None,
        multilingual: bool = False,
        transfer_phone: str | None = None,
        twilio_from: str | None = None,
        room_name: str = "",
        sip_ref: dict | None = None,
        user_id: str = "",
        business_context: dict | None = None,
        unavailabilities: list | None = None,
    ):
        company_name   = profile.get("company_name")   or "votre artisan"
        company_type   = profile.get("company_type")   or "artisan"
        assistant_name = profile.get("assistant_name") or "Mia"
        demo_mode      = bool(profile.get("demo_mode", False))
        can_transfer   = bool(transfer_phone)

        # Greeting bi-langue pour ne pas présupposer la langue du client
        if multilingual:
            greeting = (
                f"Hello / Bonjour — {company_name}, {assistant_name}. "
                "How can I help you? / Comment puis-je vous aider ?"
            )
        else:
            greeting = profile.get("greeting_open") or DEFAULT_GREETING

        self._multilingual  = multilingual
        self._detected_lang = "fr"
        self._lang_injected = False
        tone_style = (business_context or {}).get("tone", {}).get("style", "")
        self._emo_ctx: dict = {
            "turn_count":  0,
            "urgency":     False,
            "frustration": False,
            "tone_style":  tone_style,
            "job_type":    "inbound",
        }

        _sip_ref = sip_ref if sip_ref is not None else {}
        if can_transfer:
            tools = [_make_transfer_tool(transfer_phone, twilio_from, room_name, _sip_ref)]
        else:
            tools = []

        base_instructions = build_instructions(
            assistant_name, company_name, company_type,
            pricing, multilingual, demo_mode, can_transfer,
        )
        ctx_block = build_business_context_block(
            business_context or {},
            unavailabilities or [],
        )
        instructions = base_instructions + ctx_block

        super().__init__(
            instructions=instructions,
            tools=tools,
            turn_handling={
                "endpointing": {"min_delay": 0.3},
                "interruption": {
                    "mode": "adaptive",
                    "min_duration": 1.5,
                    "min_words": 3,
                    "resume_false_interruption": True,
                },
            },
        )
        self._greeting = greeting

    async def stt_node(self, audio, model_settings):
        from livekit.agents import stt as stt_module
        async for event in super().stt_node(audio, model_settings):
            if (
                event.type == stt_module.SpeechEventType.FINAL_TRANSCRIPT
                and event.alternatives
            ):
                # Détection de langue (multilingual uniquement)
                if self._multilingual:
                    raw_lang = getattr(event.alternatives[0], "language", None) or ""
                    lang = raw_lang[:2].lower() if raw_lang else "fr"
                    lang = lang if lang in VOICE_MAP else "fr"
                    if lang != self._detected_lang:
                        prev = self._detected_lang
                        self._detected_lang = lang
                        logger.info(
                            f"[mia] lang detected: {prev!r} → {lang!r} "
                            "(voice switch will apply at next tts_node)"
                        )
                # Signaux client pour la détection d'émotion en temps réel
                client_text = (event.alternatives[0].text or "").lower()
                if not self._emo_ctx["urgency"] and any(
                    kw in client_text for kw in _CLIENT_URGENCY_KW
                ):
                    self._emo_ctx["urgency"] = True
                    logger.debug("[mia] emo_ctx: urgency detected from client speech")
                if not self._emo_ctx["frustration"] and any(
                    kw in client_text for kw in _CLIENT_FRUSTRATION_KW
                ):
                    self._emo_ctx["frustration"] = True
                    logger.debug("[mia] emo_ctx: frustration detected from client speech")
            yield event

    def tts_node(self, text, model_settings):
        # Sélectionne la voix Cartesia selon la langue détectée dans stt_node.
        # On pose self._tts directement : activity.tts lit agent._tts en priorité
        # sur session.tts (cf. agent_activity.py:3895).
        new_tts = _tts_for_lang(self._detected_lang)
        emotion = _detect_emotion(text, self._emo_ctx)
        new_tts.update_options(emotion=emotion)
        self._tts = new_tts
        logger.debug(
            f"[mia] tts_node: lang={self._detected_lang!r} "
            f"voice_id={VOICE_MAP.get(self._detected_lang)} "
            f"emotion={emotion!r} turn={self._emo_ctx['turn_count']}"
        )
        self._emo_ctx["turn_count"] += 1
        return super().tts_node(text, model_settings)

    async def llm_node(self, chat_ctx, tools, model_settings):
        if (
            self._multilingual
            and self._detected_lang != "fr"
            and not self._lang_injected
        ):
            self._lang_injected = True
            lang_name = _LANG_NAMES.get(self._detected_lang, self._detected_lang.upper())
            injection = (
                f"The client is speaking {lang_name}. "
                f"Switch immediately and definitively to {lang_name} for the entire conversation. "
                f"Do not use French unless the client explicitly requests it."
            )
            try:
                chat_ctx.add_message(role="system", content=injection)
                logger.info(f"[mia] LLM context injected — lang={self._detected_lang!r} ({lang_name})")
            except Exception as exc:
                logger.warning(f"[mia] LLM context injection failed: {exc}")
        async for chunk in super().llm_node(chat_ctx, tools, model_settings):
            yield chunk

    async def on_enter(self):
        logger.info(
            f"[mia] on_enter — greeting (len={len(self._greeting)} multilingual={self._multilingual}): {self._greeting!r}"
        )
        self.session.say(self._greeting, allow_interruptions=False)
        logger.info("[mia] on_enter — session.say() dispatched")


OUTBOUND_REASON_LABELS = {
    "missed_callback":  "rappel client manqué",
    "rdv_confirmation": "confirmation de rendez-vous",
    "devis_followup":   "suivi de devis",
    "client_relance":   "relance client",
}


def _build_outbound_greeting(reason: str, company_name: str, assistant_name: str, rdv_info: str | None = None) -> str:
    if reason == "missed_callback":
        return (
            f"Bonjour ! Vous avez tenté de joindre {company_name} il y a quelques instants. "
            f"Je suis {assistant_name}, l'assistante de {company_name}. "
            "Comment puis-je vous aider ?"
        )
    elif reason == "rdv_confirmation":
        rdv_text = rdv_info or "votre prochain rendez-vous"
        return (
            f"Bonjour ! J'appelle de la part de {company_name}. "
            f"Je suis {assistant_name}, leur assistante. "
            f"Je vous contacte pour confirmer {rdv_text}. "
            "Est-ce toujours bon pour vous ?"
        )
    elif reason == "devis_followup":
        return (
            f"Bonjour ! J'appelle de la part de {company_name}. "
            f"Je suis {assistant_name}. "
            "Nous voulions savoir si vous avez eu l'occasion de consulter notre devis et si vous avez des questions."
        )
    elif reason == "client_relance":
        return (
            f"Bonjour ! J'appelle de la part de {company_name}. "
            f"Je suis {assistant_name}. "
            "Nous voulions prendre de vos nouvelles et voir si vous avez de nouveaux besoins."
        )
    else:
        return (
            f"Bonjour ! J'appelle de la part de {company_name}. "
            f"Je suis {assistant_name}. Comment puis-je vous aider ?"
        )


class OutboundMiaAgent(Agent):
    """Agent pour les appels sortants automatiques (rappel, RDV, devis, relance)."""
    def __init__(self, profile: dict, outbound_meta: dict):
        company_name   = profile.get("company_name")   or "votre artisan"
        assistant_name = profile.get("assistant_name") or "Mia"
        reason         = outbound_meta.get("reason") or "missed_callback"
        rdv_info       = outbound_meta.get("rdv_info")

        greeting = _build_outbound_greeting(reason, company_name, assistant_name, rdv_info)

        instructions = (
            f"Tu es {assistant_name}, l'assistante téléphonique de {company_name}. "
            f"Tu as passé cet appel sortant dans le cadre d'un {OUTBOUND_REASON_LABELS.get(reason, 'suivi client')}. "
            "Tu es chaleureuse, professionnelle et concise. "
            "Ton objectif : confirmer l'information, répondre aux questions simples, "
            f"et si la demande est complexe, dire que {company_name} les rappellera directement. "
            "Ne mentionne jamais que tu es une IA ou un robot. "
            "Si la personne ne répond pas ou est occupée, dis poliment au revoir et raccroche. "
            "Durée maximale de l'appel : 3 minutes."
        )

        super().__init__(
            instructions=instructions,
            turn_handling={
                "endpointing": {"min_delay": 0.6},
                "interruption": {"mode": "allowed"},
            },
        )
        self._greeting  = greeting
        self._reason    = reason
        self._emo_turn  = 0

    async def on_enter(self):
        logger.info(f"[mia] outbound on_enter — reason={self._reason!r}")
        self.session.say(self._greeting, allow_interruptions=False)

    def tts_node(self, text, model_settings):
        tts = _tts_for_lang("fr")
        ctx = {
            "turn_count":  self._emo_turn,
            "urgency":     False,
            "frustration": False,
            "tone_style":  "",
            "job_type":    "outbound",
        }
        emotion = _detect_emotion(text, ctx)
        tts.update_options(emotion=emotion)
        self._tts = tts
        self._emo_turn += 1
        logger.debug(f"[mia] outbound tts_node: emotion={emotion!r} turn={self._emo_turn - 1}")
        return super().tts_node(text, model_settings)


class OnboardingMiaAgent(Agent):
    """Agent utilisé uniquement lors de l'appel de présentation post-onboarding."""
    def __init__(self, profile: dict):
        company_name   = profile.get("company_name")   or "votre activité"
        assistant_name = profile.get("assistant_name") or "Mia"

        super().__init__(
            instructions=build_onboarding_instructions(company_name, assistant_name),
            turn_handling={
                "endpointing": {"min_delay": 0.5},
                "interruption": {"mode": "disabled"},
            },
        )
        self._assistant_name = assistant_name
        self._script         = _build_onboarding_script(assistant_name)
        self._emo_turn       = 0

    async def on_enter(self):
        logger.info("[mia] onboarding call — starting presentation")
        self.session.say(self._script, allow_interruptions=False)

    def tts_node(self, text, model_settings):
        tts = _tts_for_lang("fr")
        ctx = {
            "turn_count":  self._emo_turn,
            "urgency":     False,
            "frustration": False,
            "tone_style":  "",
            "job_type":    "onboarding",
        }
        emotion = _detect_emotion(text, ctx)
        tts.update_options(emotion=emotion)
        self._tts = tts
        self._emo_turn += 1
        logger.debug(f"[mia] onboarding tts_node: emotion={emotion!r} turn={self._emo_turn - 1}")
        return super().tts_node(text, model_settings)


class WebDemoMiaAgent(Agent):
    """Agent Mia Commerciale — démos web fixlyy.fr UNIQUEMENT.
    Isolé du comportement standard des artisans clients (job_type='web_demo').
    Supporte la détection de langue et le switch vocal pour la démo multilingue."""
    def __init__(self):
        super().__init__(
            instructions=DEMO_COMMERCIAL_PROMPT,
            turn_handling={
                "endpointing": {"min_delay": 0.4},
                "interruption": {
                    "mode": "adaptive",
                    "min_duration": 1.5,
                    "min_words": 3,
                    "resume_false_interruption": True,
                },
            },
        )
        self._greeting      = "Bonjour, je m'appelle Mia. Je suis l'assistante vocale créée par Fixlyy et peut-être bientôt la tienne. Mais avant tout apprenons à nous connaître — est-ce que ça te dérange si je te tutoie ?"
        self._emo_turn      = 0
        self._detected_lang = "fr"
        self._injected_lang = "fr"  # langue déjà présente dans le contexte LLM (pas d'injection initiale)
        self._pending_lang  = None  # candidat détecté par Deepgram, pas encore confirmé
        self._pending_count = 0     # nb de tours consécutifs où ce candidat a été détecté

    async def on_enter(self):
        logger.info("[mia] WebDemoMiaAgent on_enter — commercial demo")
        self.session.say(self._greeting, allow_interruptions=False)

    async def stt_node(self, audio, model_settings):
        from livekit.agents import stt as stt_module
        async for event in super().stt_node(audio, model_settings):
            if (
                event.type == stt_module.SpeechEventType.FINAL_TRANSCRIPT
                and event.alternatives
            ):
                client_text = (event.alternatives[0].text or "").lower()

                # 1) Scan de mots-clés explicites ("parle anglais", "in english", etc.) — switch immédiat,
                #    sans ambiguïté possible sur l'intention du prospect.
                keyword_target = None
                for kw, target in _DEMO_LANG_REQUEST_MAP.items():
                    if kw in client_text:
                        keyword_target = target
                        break

                if keyword_target is not None:
                    detected = keyword_target
                    self._pending_lang  = None
                    self._pending_count = 0
                else:
                    # 2) Détection passive via Deepgram language metadata — peu fiable sur un tour
                    #    isolé (ex: "ouais" pris pour de l'anglais, "non ça va oui" pour de l'espagnol).
                    #    On exige la même langue non-fr détectée sur 2 tours consécutifs avant de
                    #    basculer, pour filtrer le bruit de classification sur des phrases courtes/informelles.
                    raw_lang      = getattr(event.alternatives[0], "language", None) or ""
                    raw_detected  = raw_lang[:2].lower() if raw_lang else self._detected_lang
                    raw_detected  = raw_detected if raw_detected in VOICE_MAP else "fr"

                    if raw_detected == self._detected_lang:
                        self._pending_lang  = None
                        self._pending_count = 0
                        detected = self._detected_lang
                    elif raw_detected == self._pending_lang:
                        self._pending_count += 1
                        detected = raw_detected if self._pending_count >= 2 else self._detected_lang
                    else:
                        self._pending_lang  = raw_detected
                        self._pending_count = 1
                        detected = self._detected_lang

                if detected != self._detected_lang:
                    prev = self._detected_lang
                    self._detected_lang = detected
                    self._pending_lang  = None
                    self._pending_count = 0
                    logger.info(f"[mia] demo lang switch: {prev!r} → {detected!r}")
            yield event

    async def llm_node(self, chat_ctx, tools, model_settings):
        if self._detected_lang != self._injected_lang:
            prev_injected       = self._injected_lang
            self._injected_lang = self._detected_lang
            if self._detected_lang != "fr":
                lang_name = _LANG_NAMES.get(self._detected_lang, self._detected_lang.upper())
                injection = (
                    f"The prospect has requested or is now speaking {lang_name}. "
                    f"Switch immediately and completely to {lang_name}. "
                    f"Be natural and enthusiastic — this is the multilingual demo moment! "
                    f"Stay in {lang_name} until they explicitly ask for French."
                )
            else:
                injection = (
                    "The prospect has returned to French. "
                    "Switch back to French immediately and naturally."
                )
            try:
                chat_ctx.add_message(role="system", content=injection)
                logger.info(
                    f"[mia] demo LLM lang inject: {prev_injected!r} → {self._detected_lang!r}"
                )
            except Exception as exc:
                logger.warning(f"[mia] demo LLM lang inject failed: {exc}")
        async for chunk in super().llm_node(chat_ctx, tools, model_settings):
            yield chunk

    def tts_node(self, text, model_settings):
        tts = _tts_for_lang(self._detected_lang)
        ctx = {
            "turn_count":  self._emo_turn,
            "urgency":     False,
            "frustration": False,
            "tone_style":  "chaleureux",  # démo toujours en registre chaleureux
            "job_type":    "demo",
        }
        emotion = _detect_emotion(text, ctx)
        tts.update_options(emotion=emotion)
        self._emo_turn += 1
        logger.debug(
            f"[mia] demo tts_node: lang={self._detected_lang!r} "
            f"emotion={emotion!r} turn={self._emo_turn - 1}"
        )
        return super().tts_node(text, model_settings)


# ── Entrypoint ────────────────────────────────────────────────────────────────

async def entrypoint(ctx: JobContext):
    room_name = ctx.room.name
    logger.info(f"[mia] job started — room={room_name}")

    profile: dict = {}
    user_id: str = ""

    pricing: list = []
    multilingual: bool = False

    # Container mutable partagé entre entrypoint et MiaAgent
    sip_ref = {"identity": None, "caller_number": "", "transferred_to": None, "transferred_at": None}

    business_context: dict = {}
    unavailabilities: list = []

    if room_name.startswith("artisan-"):
        user_id = room_name[len("artisan-"):]
        logger.info(f"[mia] fetching profile for user_id={user_id}")
        profile, pricing, unavailabilities = await asyncio.gather(
            fetch_artisan_profile(user_id),
            fetch_service_pricing(user_id),
            fetch_active_unavailabilities(user_id),
        )
        business_context = profile.pop("business_context", None) or {}
        multilingual = True
        if profile:
            logger.info(
                f"[mia] profile loaded — company={profile.get('company_name')!r} "
                f"pricing={len(pricing)} items "
                f"business_context={'yes' if business_context else 'no'} "
                f"unavailabilities={len(unavailabilities)} "
                f"transfer_phone={'yes' if (profile.get('transfer_phone') or profile.get('phone')) else 'no'}"
            )
        else:
            logger.warning("[mia] profile not found — using defaults")
    elif room_name.startswith("web-demo-"):
        # Démo web fixlyy.fr — profil non pertinent, WebDemoMiaAgent géré via metadata
        logger.info(f"[mia] web-demo room — commercial mode (Mia Commerciale)")
    elif room_name.startswith("demo-"):
        parts  = room_name.split("-")
        metier = parts[1] if len(parts) > 1 else "autre"
        profile = _build_demo_profile(metier)
        logger.info(f"[mia] demo room — metier={metier!r} company={profile['company_name']!r}")
    else:
        logger.info("[mia] test room — using default profile")

    await ctx.connect(auto_subscribe=AutoSubscribe.AUDIO_ONLY)
    logger.info("[mia] connected")

    onboarding_meta: dict = {}
    web_demo_meta:   dict = {}
    outbound_meta:   dict = {}
    _sip_seen = asyncio.Event()

    def _inspect_sip_participant(p) -> None:
        identity = getattr(p, "identity", "") or ""
        if not identity.startswith("sip_"):
            return
        if identity.startswith("sip_out_"):
            try:
                meta = json.loads(getattr(p, "metadata", None) or "{}")
                if meta.get("onboarding_call"):
                    onboarding_meta.update(meta)
                    logger.info("[mia] onboarding call detected")
                elif meta.get("job_type") == "web_demo":
                    web_demo_meta.update(meta)
                    logger.info(f"[mia] web_demo call detected — metier={meta.get('metier')!r}")
                elif meta.get("outbound"):
                    outbound_meta.update(meta)
                    logger.info(f"[mia] outbound call detected — reason={meta.get('reason')!r}")
            except Exception:
                pass
        else:
            # Appelant entrant — stocker l'identité pour le transfert SIP
            sip_ref["identity"] = identity
            sip_ref["caller_number"] = identity[len("sip_"):]
            logger.info(f"[mia] inbound SIP: identity={identity!r}")
        _sip_seen.set()

    for p in ctx.room.remote_participants.values():
        _inspect_sip_participant(p)

    if not _sip_seen.is_set():
        @ctx.room.on("participant_connected")
        def _on_participant_connected(participant):
            _inspect_sip_participant(participant)

        try:
            await asyncio.wait_for(_sip_seen.wait(), timeout=30.0)
        except asyncio.TimeoutError:
            logger.warning("[mia] aucun participant SIP en 30s — démarrage MiaAgent standard")

    stt = deepgram.STT(model="nova-3", language="multi")
    logger.info("[mia] STT: language=multi")

    session = AgentSession(
        vad=silero.VAD.load(
            min_silence_duration=1.2,
            min_speech_duration=0.15,
            activation_threshold=0.6,
            deactivation_threshold=0.45,
        ),
        stt=stt,
        llm=groq.LLM(model="llama-3.3-70b-versatile"),
        tts=_tts_for_lang("fr"),
        aec_warmup_duration=5.0,
        min_interruption_duration=1.5,
        min_interruption_words=3,
    )

    conversation_items: list = []
    start_time = time.time()
    caller_number: str = "Inconnu"

    @session.on("user_input_transcribed")
    def on_transcript(ev):
        logger.info(f"[mia] user said: {ev.transcript!r}")

    @session.on("agent_state_changed")
    def on_state(ev):
        logger.info(f"[mia] state: {ev.old_state} → {ev.new_state}")

    @session.on("conversation_item_added")
    def on_item(ev):
        item = ev.item
        role = getattr(item, "role", None)
        text = getattr(item, "text_content", None)
        if role and text and str(role) in ("user", "assistant"):
            conversation_items.append({
                "role": str(role),
                "text": text,
                "interrupted": getattr(item, "interrupted", False),
            })

    loop = asyncio.get_event_loop()

    @ctx.room.on("participant_disconnected")
    def on_participant_disconnected(participant):
        nonlocal caller_number
        identity = getattr(participant, "identity", "") or ""
        if identity.startswith("sip_out_") and web_demo_meta.get("job_type") == "web_demo":
            loop.create_task(handle_web_demo_ended(
                room_name=room_name,
                conversation_items=list(conversation_items),
                start_time=start_time,
                metier=web_demo_meta.get("metier", "autre"),
            ))
        elif identity.startswith("sip_") and not identity.startswith("sip_out_"):
            caller_number = sip_ref.get("caller_number") or identity[len("sip_"):]
            transfer_state = {
                "to":  sip_ref.get("transferred_to"),
                "at":  sip_ref.get("transferred_at"),
            }
            if user_id:
                loop.create_task(handle_call_ended(
                    user_id=user_id,
                    caller_number=caller_number,
                    conversation_items=list(conversation_items),
                    start_time=start_time,
                    transfer_state=transfer_state,
                ))

    # Résoudre le numéro de transfert : transfer_phone en priorité, phone en fallback
    transfer_phone = profile.get("transfer_phone") or profile.get("phone") or None
    twilio_from    = profile.get("twilio_number") or None

    if onboarding_meta.get("onboarding_call"):
        agent = OnboardingMiaAgent(profile)
        logger.info("[mia] starting OnboardingMiaAgent")
    elif web_demo_meta.get("job_type") == "web_demo":
        agent = WebDemoMiaAgent()
        logger.info("[mia] starting WebDemoMiaAgent — commercial demo (ISOLATED from standard Mia)")
    elif outbound_meta.get("outbound"):
        agent = OutboundMiaAgent(profile, outbound_meta)
        logger.info(f"[mia] starting OutboundMiaAgent — reason={outbound_meta.get('reason')!r}")
    else:
        agent = MiaAgent(
            profile, pricing, multilingual,
            transfer_phone=transfer_phone,
            twilio_from=twilio_from,
            room_name=room_name,
            sip_ref=sip_ref,
            user_id=user_id,
            business_context=business_context,
            unavailabilities=unavailabilities,
        )

    await session.start(agent, room=ctx.room)
    logger.info("[mia] session started")


if __name__ == "__main__":
    cli.run_app(WorkerOptions(entrypoint_fnc=entrypoint))
