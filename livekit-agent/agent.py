import asyncio
import json
import logging
import os
import time
import httpx
from dotenv import load_dotenv
from livekit.agents import AutoSubscribe, JobContext, WorkerOptions, cli
from livekit.agents import Agent, AgentSession
from livekit.plugins import deepgram, elevenlabs, groq, silero

load_dotenv()
logger = logging.getLogger("fixlyy.agent")

SUPABASE_URL = os.getenv("SUPABASE_URL", "")
SUPABASE_KEY = os.getenv("SUPABASE_SERVICE_ROLE_KEY", "")
GROQ_API_KEY = os.getenv("GROQ_API_KEY", "")

DEFAULT_GREETING = (
    "Bonjour, vous êtes bien sur le service de gestion des appels. "
    "Comment puis-je vous aider ?"
)

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
        "select": "company_name,company_type,assistant_name,greeting_open,subscription_plan",
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
) -> None:
    duration_secs = int(time.time() - start_time)
    logger.info(f"[mia] call ended — duration={duration_secs}s caller={caller_number} items={len(conversation_items)}")

    # Construire le transcript texte
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

    # Générer le résumé structuré via Groq
    structured = await generate_summary(transcript)
    logger.info(f"[mia] structured summary: {structured.get('reason', '(vide)')!r}")

    # Envoyer à l'edge function
    await post_call_ended(
        user_id=user_id,
        caller_number=caller_number,
        transcript=transcript,
        duration_seconds=duration_secs,
        structured=structured,
    )


# ── Agent ─────────────────────────────────────────────────────────────────────

def build_instructions(
    assistant_name: str,
    company_name: str,
    company_type: str,
    pricing: list | None = None,
    is_multilingual: bool = False,
) -> str:
    if is_multilingual:
        lang_rule = (
            "Détecte la langue du client dès sa première phrase et réponds dans cette langue. "
            "Langues supportées : français, anglais, arabe, espagnol, portugais. "
            "Pour toute autre langue, réponds en français. "
            "Le contexte métier de l’artisan reste le même quelle que soit la langue. "
        )
    else:
        lang_rule = "Tu réponds en français, de façon naturelle et professionnelle. "

    base = (
        f"Tu es {assistant_name}, la réceptionniste téléphonique de {company_name} ({company_type}). "
        + lang_rule
        + "Phrases courtes, max 20 mots, adaptées au téléphone. "
        + "Commence par un marqueur naturel : ‘D’accord’, ‘Très bien’, ‘Je note’. "
        + "Réagis aux émotions avant de poser ta question suivante. "
        + "Reformule ce que dit le client pour montrer que tu écoutes. "
        + "Ne dis jamais deux fois la même formule. "
        + "Objectif : collecter naturellement le nom, le téléphone, l’adresse, le problème, l’urgence et les disponibilités. "
        + "Ne dis JAMAIS ‘Je dois vous poser quelques questions’. "
        + "Demande TOUJOURS l’adresse avant de raccrocher — sans adresse l’artisan ne peut pas intervenir. "
        + "Pose aussi une question de contexte : ‘Ça dure depuis quand ?’ ou ‘Quelqu’un est déjà intervenu ?’. "
        + "Termine par un récapitulatif : ‘Je récapitule : vous êtes [Nom], au [Adresse], pour [Problème]. "
        + "On vous rappelle [délai]. C’est bien ça ?’ puis ‘Merci, à très vite !’. "
        + f"Si on te demande si tu es une IA : ‘Je suis l’assistante de {company_name}, je transmets votre demande à l’artisan.’ "
        + "Ne mentionne jamais que tu es une IA, un robot ou un assistant virtuel."
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
                + " — Le tarif définitif sera confirmé par l’artisan après diagnostic."
            )

    return base


def is_max_plan(raw: str | None) -> bool:
    s = (raw or "").lower()
    return s in ("max",) or any(k in s for k in ("equipe", "équipe", "expert", "team"))


class MiaAgent(Agent):
    def __init__(self, profile: dict, pricing: list | None = None, multilingual: bool = False):
        company_name   = profile.get("company_name")   or "votre artisan"
        company_type   = profile.get("company_type")   or "artisan"
        assistant_name = profile.get("assistant_name") or "Mia"
        greeting       = profile.get("greeting_open")  or DEFAULT_GREETING

        super().__init__(
            instructions=build_instructions(assistant_name, company_name, company_type, pricing, multilingual),
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

    async def on_enter(self):
        logger.info("[mia] on_enter — greeting")
        self.session.say(self._greeting, allow_interruptions=False)


# ── Entrypoint ────────────────────────────────────────────────────────────────

async def entrypoint(ctx: JobContext):
    room_name = ctx.room.name
    logger.info(f"[mia] job started — room={room_name}")

    profile: dict = {}
    user_id: str = ""

    pricing: list = []
    multilingual: bool = False
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
                f"pricing={len(pricing)} items"
            )
        else:
            logger.warning("[mia] profile not found — using defaults")
    else:
        logger.info("[mia] test room — using default profile")

    await ctx.connect(auto_subscribe=AutoSubscribe.AUDIO_ONLY)
    logger.info("[mia] connected")

    # STT : détection auto de langue pour Max, français forcé pour Solo/Pro
    if multilingual:
        stt = deepgram.STT(model="nova-3", detect_language=True)
        logger.info("[mia] STT: detect_language=True (Max plan)")
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
        tts=elevenlabs.TTS(language="fr"),
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
        if identity.startswith("sip_"):
            caller_number = identity[len("sip_"):]
            if user_id:
                loop.create_task(handle_call_ended(
                    user_id=user_id,
                    caller_number=caller_number,
                    conversation_items=list(conversation_items),
                    start_time=start_time,
                ))

    await session.start(MiaAgent(profile, pricing, multilingual), room=ctx.room)
    logger.info("[mia] session started")


if __name__ == "__main__":
    cli.run_app(WorkerOptions(entrypoint_fnc=entrypoint))
