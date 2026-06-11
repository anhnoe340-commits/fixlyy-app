import logging
import os
from dotenv import load_dotenv
from livekit.agents import AutoSubscribe, JobContext, WorkerOptions, cli
from livekit.agents import Agent, AgentSession
from livekit.plugins import deepgram, elevenlabs, groq, silero

load_dotenv()
logger = logging.getLogger("fixlyy.agent")

GREETING = (
    "Bonjour, vous êtes bien sur le service de gestion des appels. "
    "Comment puis-je vous aider ?"
)


class MiaAgent(Agent):
    def __init__(self):
        super().__init__(
            instructions=(
                "Tu es Mia, une assistante téléphonique pour un artisan. "
                "Tu réponds en français, de façon naturelle et professionnelle. "
                "Phrases courtes, adaptées au téléphone. "
                "Tu qualifies les demandes des clients et tu prends les "
                "informations nécessaires pour que l'artisan puisse les rappeler. "
                "Tu ne mentionnes jamais que tu es une IA, un robot ou "
                "un assistant virtuel."
            ),
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

    async def on_enter(self):
        logger.info("[mia] on_enter — greeting")
        self.session.say(GREETING, allow_interruptions=False)


async def entrypoint(ctx: JobContext):
    logger.info(f"[mia] job started — room={ctx.room.name}")

    await ctx.connect(auto_subscribe=AutoSubscribe.AUDIO_ONLY)
    logger.info("[mia] connected")

    session = AgentSession(
        # Silero VAD : min_silence_duration=0.8 pour réduire les faux positifs
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

    await session.start(MiaAgent(), room=ctx.room)
    logger.info("[mia] session started")


if __name__ == "__main__":
    cli.run_app(WorkerOptions(entrypoint_fnc=entrypoint))
