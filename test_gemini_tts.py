"""
Test Gemini TTS — Fixlyy
Génère "Bonjour, je suis Mia, votre assistante." en WAV et mesure la latence.
"""
import os
import sys
import time
import wave
import base64
from pathlib import Path

# Charger GEMINI_API_KEY depuis .env
env_path = Path(__file__).parent / ".env"
if env_path.exists():
    for line in env_path.read_text().splitlines():
        if "=" in line and not line.startswith("#"):
            k, _, v = line.partition("=")
            os.environ.setdefault(k.strip(), v.strip())

api_key = os.environ.get("GEMINI_API_KEY")
if not api_key:
    sys.exit("GEMINI_API_KEY manquante dans .env")

try:
    from google import genai
    from google.genai import types
except ImportError:
    sys.exit("SDK manquant — lance : python3 -m pip install google-genai")

TEXT = "Bonjour, je suis Mia, votre assistante."
MODEL = "gemini-2.5-flash-preview-tts"
VOICE = "Kore"          # voix claire / feminine
OUTPUT = "output.wav"
SAMPLE_RATE = 24000     # Hz — défaut Gemini TTS
CHANNELS = 1
SAMPLE_WIDTH = 2        # 16-bit PCM

def write_wav(filename: str, pcm_bytes: bytes) -> None:
    with wave.open(filename, "wb") as wf:
        wf.setnchannels(CHANNELS)
        wf.setsampwidth(SAMPLE_WIDTH)
        wf.setframerate(SAMPLE_RATE)
        wf.writeframes(pcm_bytes)

def estimate_tokens(text: str) -> int:
    # ~1.3 tokens / mot en moyenne pour du français
    return max(1, int(len(text.split()) * 1.3))

def main():
    client = genai.Client(api_key=api_key)

    print(f"Modèle  : {MODEL}")
    print(f"Voix    : {VOICE}")
    print(f"Texte   : {TEXT!r}")
    print(f"Tokens  ~ {estimate_tokens(TEXT)} tokens input")
    print()

    t0 = time.perf_counter()

    try:
        response = client.models.generate_content(
            model=MODEL,
            contents=TEXT,
            config=types.GenerateContentConfig(
                response_modalities=["AUDIO"],
                speech_config=types.SpeechConfig(
                    voice_config=types.VoiceConfig(
                        prebuilt_voice_config=types.PrebuiltVoiceConfig(
                            voice_name=VOICE
                        )
                    )
                ),
            ),
        )
    except Exception as exc:
        latency = (time.perf_counter() - t0) * 1000
        print(f"ERREUR ({latency:.0f} ms) : {exc}")
        sys.exit(1)

    latency_ms = (time.perf_counter() - t0) * 1000

    # Extraire l'audio
    part = response.candidates[0].content.parts[0]
    inline = part.inline_data
    mime = inline.mime_type       # ex: "audio/L16;rate=24000" ou "audio/wav"
    # Le SDK google-genai retourne déjà des bytes (pas base64)
    raw = inline.data if isinstance(inline.data, bytes) else base64.b64decode(inline.data)

    print(f"Latence      : {latency_ms:.0f} ms")
    print(f"MIME reçu    : {mime}")
    print(f"Bytes audio  : {len(raw):,} bytes")
    duration_s = len(raw) / (SAMPLE_RATE * CHANNELS * SAMPLE_WIDTH)
    print(f"Durée audio  : {duration_s:.2f} s")

    # Coût estimé — Gemini 2.5 Flash TTS : ~$0.50 / 1M chars output
    cost_usd = len(TEXT) * 0.50 / 1_000_000
    print(f"Coût estimé  : ${cost_usd:.6f} ({len(TEXT)} chars @ $0.50/1M chars)")

    # Si le MIME est déjà WAV on écrit directement, sinon on ajoute le header
    if "wav" in mime.lower():
        Path(OUTPUT).write_bytes(raw)
    else:
        write_wav(OUTPUT, raw)

    print(f"\nAudio sauvé  : {OUTPUT}")
    print("OK — teste l'audio avec : afplay output.wav")

if __name__ == "__main__":
    main()
