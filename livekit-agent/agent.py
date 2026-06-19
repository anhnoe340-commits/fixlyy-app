import asyncio
import base64
import hashlib
import hmac
import json
import logging
import os
import time
import httpx
from datetime import datetime, timezone
from dotenv import load_dotenv
from livekit.agents import AutoSubscribe, JobContext, WorkerOptions, cli, function_tool
from livekit.agents import Agent, AgentSession
from livekit.plugins import deepgram, elevenlabs, groq, silero

load_dotenv()
logger = logging.getLogger("fixlyy.agent")

SUPABASE_URL = os.getenv("SUPABASE_URL", "")
SUPABASE_KEY = os.getenv("SUPABASE_SERVICE_ROLE_KEY", "")
GROQ_API_KEY = os.getenv("GROQ_API_KEY", "")
TWILIO_ACCOUNT_SID = os.getenv("TWILIO_ACCOUNT_SID", "")
TWILIO_AUTH_TOKEN  = os.getenv("TWILIO_AUTH_TOKEN", "")

LK_URL    = (os.getenv("LIVEKIT_CLOUD_URL", "")
             .replace("wss://", "https://")
             .replace("ws://", "http://"))
LK_KEY    = os.getenv("LIVEKIT_CLOUD_API_KEY", "")
LK_SECRET = os.getenv("LIVEKIT_CLOUD_API_SECRET", "")

VOICE_MAP: dict[str, str] = {
    "fr": "FFXYdAYPzn8Tw8KiHZqg",
    "en": "OYTbf65OHHFELVut7v2H",
    "ar": "VwC51uc4PUblWEJSPzeo",
    "es": "nbcvT3C2tyOd2OsRAtUf",
    "pt": "RGymW84CSmfVugnA5tvA",
}
_tts_cache: dict[str, elevenlabs.TTS] = {}

def _tts_for_lang(lang: str) -> elevenlabs.TTS:
    lang = lang if lang in VOICE_MAP else "fr"
    if lang not in _tts_cache:
        _tts_cache[lang] = elevenlabs.TTS(
            voice_id=VOICE_MAP[lang],
            model="eleven_multilingual_v2",
        )
    return _tts_cache[lang]

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
        "subscription_plan": "pro",
        "demo_mode":         True,
    }

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
  "sms_body": "accroche max 80 chars : problème précis + action immédiate"
}}
IMPORTANT : full_summary et sms_body doivent TOUJOURS être rédigés en français,
quelle que soit la langue parlée pendant la conversation."""


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
        "select": "company_name,company_type,assistant_name,greeting_open,subscription_plan,phone,transfer_phone,twilio_number",
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


async def post_call_ended(
    user_id: str,
    caller_number: str,
    transcript: str,
    duration_seconds: int,
    structured: dict,
    transferred_to: str | None = None,
    transferred_at: str | None = None,
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
        "appointment_date": structured.get("appointment_date"),
        "appointment_time": structured.get("appointment_time"),
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

    ts = transfer_state or {}
    await post_call_ended(
        user_id=user_id,
        caller_number=caller_number,
        transcript=transcript,
        duration_seconds=duration_secs,
        structured=structured,
        transferred_to=ts.get("to"),
        transferred_at=ts.get("at"),
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
            "Langues supportées : français, anglais, arabe, espagnol, portugais. "
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


def is_max_plan(raw: str | None) -> bool:
    s = (raw or "").lower()
    return s in ("max",) or any(k in s for k in ("equipe", "équipe", "expert", "team"))


def _plan_label(plan: str) -> str:
    return {"solo": "la formule Solo", "pro": "la formule Pro", "max": "la formule Max"}.get(plan, "votre formule")


def _build_onboarding_script(plan: str, assistant_name: str) -> str:
    plan = plan.lower()
    label = _plan_label(plan)

    if plan == "solo":
        minutes = "300"
        features = ""
    elif plan == "pro":
        minutes = "500"
        features = (
            ", j'envoie un SMS de confirmation à vos clients, "
            "je peux prendre des rendez-vous et vous avez accès à un mini-CRM"
        )
    else:  # max
        minutes = "1000"
        features = (
            ", je réponds en plusieurs langues, "
            "je transfère les urgences directement sur votre mobile "
            "et jusqu'à 20 motifs d'appel personnalisables"
        )

    return (
        f"Bonjour, je suis {assistant_name}, votre assistante téléphonique Fixlyy. "
        "À partir de maintenant, je réponds à vos appels manqués 24h/24, 7j/7. "
        "Concrètement : quand un client vous appelle et que vous êtes occupé, je décroche, "
        "je qualifie sa demande et je vous envoie un SMS récap en moins de 30 secondes "
        "avec son nom, numéro, adresse et motif d'appel. "
        f"Avec votre formule {label}, vous avez {minutes} minutes incluses par mois{features}. "
        "Pour bien démarrer, activez le renvoi d'appel vers votre numéro Mia "
        "et configurez vos motifs d'appel dans le tableau de bord. "
        "Je suis prête !"
    )


def build_onboarding_instructions(plan: str, company_name: str, assistant_name: str) -> str:
    plan = plan.lower()
    label = _plan_label(plan)

    if plan == "solo":
        minutes = "300"
        extra = ""
    elif plan == "pro":
        minutes = "500"
        extra = (
            " J'envoie aussi un SMS de confirmation à vos clients, je peux prendre des rendez-vous, "
            "vous avez accès à un mini-CRM, des statistiques et jusqu'à 10 motifs d'appel personnalisés."
        )
    else:  # max
        minutes = "1000"
        extra = (
            " Je réponds aussi en plusieurs langues, je transfère automatiquement les urgences "
            "directement sur votre mobile, et jusqu'à 20 motifs d'appel personnalisables."
        )

    return (
        f"Tu es {assistant_name}, la réceptionniste téléphonique créée par Fixlyy pour {company_name}. "
        "Tu viens de te présenter à l'artisan. Si il ou elle pose une question, réponds-y naturellement et chaleureusement. "
        f"Rappelle-leur les points clés de leur formule {label} : {minutes} minutes incluses par mois.{extra} "
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
    ):
        company_name   = profile.get("company_name")   or "votre artisan"
        company_type   = profile.get("company_type")   or "artisan"
        assistant_name = profile.get("assistant_name") or "Mia"
        demo_mode      = bool(profile.get("demo_mode", False))
        can_transfer   = bool(transfer_phone and is_max_plan(profile.get("subscription_plan")))

        # Plan Max : greeting neutre bi-langue pour ne pas présupposer la langue
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

        _sip_ref = sip_ref if sip_ref is not None else {}
        if can_transfer:
            tools = [_make_transfer_tool(transfer_phone, twilio_from, room_name, _sip_ref)]
        else:
            tools = []

        super().__init__(
            instructions=build_instructions(
                assistant_name, company_name, company_type,
                pricing, multilingual, demo_mode, can_transfer,
            ),
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
                self._multilingual
                and event.type == stt_module.SpeechEventType.FINAL_TRANSCRIPT
                and event.alternatives
            ):
                raw_lang = getattr(event.alternatives[0], "language", None) or ""
                lang = raw_lang[:2].lower() if raw_lang else "fr"
                lang = lang if lang in VOICE_MAP else "fr"
                if lang != self._detected_lang:
                    prev = self._detected_lang
                    self._detected_lang = lang
                    logger.info(f"[mia] lang detected: {prev!r} → {lang!r} (voice switch will apply at next tts_node)")
            yield event

    def tts_node(self, text, model_settings):
        # Sélectionne la voix ElevenLabs selon la langue détectée dans stt_node.
        # On pose self._tts directement : activity.tts lit agent._tts en priorité
        # sur session.tts (cf. agent_activity.py:3895).
        new_tts = _tts_for_lang(self._detected_lang)
        self._tts = new_tts
        logger.info(
            f"[mia] tts_node: lang={self._detected_lang!r} voice_id={VOICE_MAP.get(self._detected_lang)}"
        )
        return super().tts_node(text, model_settings)

    _LANG_NAMES: dict[str, str] = {
        "en": "English",
        "ar": "Arabic",
        "es": "Spanish",
        "pt": "Portuguese",
    }

    async def llm_node(self, chat_ctx, tools, model_settings):
        if (
            self._multilingual
            and self._detected_lang != "fr"
            and not self._lang_injected
        ):
            self._lang_injected = True
            lang_name = self._LANG_NAMES.get(self._detected_lang, self._detected_lang.upper())
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


class OnboardingMiaAgent(Agent):
    """Agent utilisé uniquement lors de l'appel de présentation post-onboarding."""
    def __init__(self, profile: dict, plan: str):
        company_name   = profile.get("company_name")   or "votre activité"
        assistant_name = profile.get("assistant_name") or "Mia"

        super().__init__(
            instructions=build_onboarding_instructions(plan, company_name, assistant_name),
            turn_handling={
                "endpointing": {"min_delay": 0.5},
                "interruption": {"mode": "disabled"},
            },
        )
        self._assistant_name = assistant_name
        self._plan = plan
        self._script = _build_onboarding_script(plan, assistant_name)

    async def on_enter(self):
        logger.info(f"[mia] onboarding call — plan={self._plan!r}")
        self.session.say(self._script, allow_interruptions=False)


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

    if room_name.startswith("artisan-"):
        user_id = room_name[len("artisan-"):]
        logger.info(f"[mia] fetching profile for user_id={user_id}")
        profile, pricing = await asyncio.gather(
            fetch_artisan_profile(user_id),
            fetch_service_pricing(user_id),
        )
        multilingual = is_max_plan(profile.get("subscription_plan"))
        if profile:
            logger.info(
                f"[mia] profile loaded — company={profile.get('company_name')!r} "
                f"plan={profile.get('subscription_plan')!r} multilingual={multilingual} "
                f"pricing={len(pricing)} items "
                f"transfer_phone={'yes' if (profile.get('transfer_phone') or profile.get('phone')) else 'no'}"
            )
        else:
            logger.warning("[mia] profile not found — using defaults")
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
                    logger.info(f"[mia] onboarding call detected — plan={meta.get('plan_id')!r}")
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

    if multilingual:
        stt = deepgram.STT(model="nova-3", language="multi")
        logger.info("[mia] STT: language=multi (Max plan)")
    else:
        stt = deepgram.STT(model="nova-3", language="fr")

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
        if identity.startswith("sip_") and not identity.startswith("sip_out_"):
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
        plan = onboarding_meta.get("plan_id") or profile.get("subscription_plan") or "solo"
        agent = OnboardingMiaAgent(profile, plan)
        logger.info(f"[mia] starting OnboardingMiaAgent — plan={plan!r}")
    else:
        agent = MiaAgent(
            profile, pricing, multilingual,
            transfer_phone=transfer_phone,
            twilio_from=twilio_from,
            room_name=room_name,
            sip_ref=sip_ref,
            user_id=user_id,
        )

    await session.start(agent, room=ctx.room)
    logger.info("[mia] session started")


if __name__ == "__main__":
    cli.run_app(WorkerOptions(entrypoint_fnc=entrypoint))
