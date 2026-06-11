import logging
import os
import httpx
from dotenv import load_dotenv
from livekit.agents import AutoSubscribe, JobContext, WorkerOptions, cli
from livekit.agents import Agent, AgentSession
from livekit.plugins import deepgram, elevenlabs, groq, silero

load_dotenv()
logger = logging.getLogger("fixlyy.agent")

SUPABASE_URL = os.getenv("SUPABASE_URL", "")
SUPABASE_KEY = os.getenv("SUPABASE_SERVICE_ROLE_KEY", "")

DEFAULT_GREETING = (
    "Bonjour, vous êtes bien sur le service de gestion des appels. "
    "Comment puis-je vous aider ?"
)


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
        "select": "company_name,company_type,assistant_name,greeting_open",
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


def build_instructions(assistant_name: str, company_name: str, company_type: str) -> str:
    return (
        f"Tu es {assistant_name}, la réceptionniste téléphonique de {company_name} ({company_type}). "
        "Tu réponds en français, de façon naturelle et professionnelle. "
        "Phrases courtes, max 20 mots, adaptées au téléphone. "
        "Commence par un marqueur naturel : 'D'accord', 'Très bien', 'Je note'. "
        "Réagis aux émotions avant de poser ta question suivante. "
        "Reformule ce que dit le client pour montrer que tu écoutes. "
        "Ne dis jamais deux fois la même formule. "
        "Objectif : collecter naturellement le nom, le téléphone, l'adresse, le problème, l'urgence et les disponibilités. "
        "Ne dis JAMAIS 'Je dois vous poser quelques questions'. "
        "Demande TOUJOURS l'adresse avant de raccrocher — sans adresse l'artisan ne peut pas intervenir. "
        "Pose aussi une question de contexte : 'Ça dure depuis quand ?' ou 'Quelqu'un est déjà intervenu ?'. "
        "Termine par un récapitulatif : 'Je récapitule : vous êtes [Nom], au [Adresse], pour [Problème]. "
        "On vous rappelle [délai]. C'est bien ça ?' puis 'Merci, à très vite !'. "
        f"Si on te demande si tu es une IA : 'Je suis l'assistante de {company_name}, je transmets votre demande à l'artisan.' "
        "Ne mentionne jamais que tu es une IA, un robot ou un assistant virtuel."
    )


class MiaAgent(Agent):
    def __init__(self, profile: dict):
        company_name   = profile.get("company_name")   or "votre artisan"
        company_type   = profile.get("company_type")   or "artisan"
        assistant_name = profile.get("assistant_name") or "Mia"
        greeting       = profile.get("greeting_open")  or DEFAULT_GREETING

        super().__init__(
            instructions=build_instructions(assistant_name, company_name, company_type),
            turn_handling={
                "endpointing": {"min_delay": 0.3},
                "interruption": {
                    "mode": "adaptive",
                    "min_duration": 0.8,
                    "min_words": 2,
                    "resume_false_interruption": True,
                },
            },
        )
        self._greeting = greeting

    async def on_enter(self):
        logger.info("[mia] on_enter — greeting")
        self.session.say(self._greeting, allow_interruptions=False)


async def entrypoint(ctx: JobContext):
    room_name = ctx.room.name
    logger.info(f"[mia] job started — room={room_name}")

    # Extraire le userId depuis room name "artisan-{uuid}"
    profile: dict = {}
    if room_name.startswith("artisan-"):
        user_id = room_name[len("artisan-"):]
        logger.info(f"[mia] fetching profile for user_id={user_id}")
        profile = await fetch_artisan_profile(user_id)
        if profile:
            logger.info(f"[mia] profile loaded — company={profile.get('company_name')!r} type={profile.get('company_type')!r}")
        else:
            logger.warning("[mia] profile not found or empty — using defaults")
    else:
        logger.info("[mia] test room — using default profile")

    await ctx.connect(auto_subscribe=AutoSubscribe.AUDIO_ONLY)
    logger.info("[mia] connected")

    session = AgentSession(
        # Silero VAD : min_silence_duration=0.8 réduit les faux positifs
        # sur les pauses naturelles inter-phrases (défaut 0.55 trop court)
        vad=silero.VAD.load(
            min_silence_duration=0.8,
            activation_threshold=0.5,
        ),
        stt=deepgram.STT(
            model="nova-3",
            language="fr",
        ),
        llm=groq.LLM(model="llama-3.3-70b-versatile"),
        tts=elevenlabs.TTS(language="fr"),
        aec_warmup_duration=5.0,
    )

    @session.on("user_input_transcribed")
    def on_transcript(ev):
        logger.info(f"[mia] user said: {ev.transcript!r}")

    @session.on("agent_state_changed")
    def on_state(ev):
        logger.info(f"[mia] state: {ev.old_state} → {ev.new_state}")

    await session.start(MiaAgent(profile), room=ctx.room)
    logger.info("[mia] session started")


if __name__ == "__main__":
    cli.run_app(WorkerOptions(entrypoint_fnc=entrypoint))
