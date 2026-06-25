"""
Test Cartesia TTS — Fixlyy
Mesure TTFB streaming sur 4 voix françaises candidates pour Mia.
"""
import os, time, wave, base64
from pathlib import Path

for line in Path(__file__).parent.joinpath(".env").read_text().splitlines():
    if "=" in line and not line.startswith("#"):
        k, _, v = line.partition("=")
        os.environ.setdefault(k.strip(), v.strip())

from cartesia import Cartesia

client = Cartesia(api_key=os.environ["CARTESIA_API_KEY"])

TEXT    = "Bonjour, je suis Mia, votre assistante. Comment puis-je vous aider ?"
MODEL   = "sonic-2"          # sonic-2 = optimisé latence
SR      = 24000

VOICES = [
    ("Amélie - Decisive Agent",    "faa75703-00e3-4a57-9955-0703001e3231"),
    ("Inès - Poised Communicator", "7c58f4a4-a72c-42fa-a503-41b9408820f3"),
    ("Pauline - Helpful Companion","65b25c5d-ff07-4687-a04c-da2f43ef6fa9"),
    ("Calm French Woman",          "a8a1eb38-5f15-4c1d-8722-7ac0f329727d"),
]

def save_wav(path, pcm):
    with wave.open(path, "wb") as wf:
        wf.setnchannels(1); wf.setsampwidth(2); wf.setframerate(SR)
        wf.writeframes(pcm)

def test_voice(name, voice_id):
    chunks = []
    t_start = time.perf_counter()
    t_first = None

    stream = client.tts.generate_sse(
        model_id=MODEL,
        transcript=TEXT,
        voice={"mode": "id", "id": voice_id},
        output_format={"container": "raw", "encoding": "pcm_s16le", "sample_rate": SR},
        language="fr",
    )

    for event in stream:
        data = getattr(event, "data", None)
        if data:
            if t_first is None:
                t_first = time.perf_counter()
                ttfb_ms = (t_first - t_start) * 1000
            raw = data if isinstance(data, bytes) else base64.b64decode(data)
            chunks.append(raw)

    total_ms = (time.perf_counter() - t_start) * 1000
    pcm = b"".join(chunks)
    duration_s = len(pcm) / (SR * 1 * 2)

    fname = f"cartesia_{name.split()[0].lower()}.wav"
    save_wav(fname, pcm)

    print(f"  TTFB      : {ttfb_ms:.0f} ms  ← premier byte audio")
    print(f"  Total     : {total_ms:.0f} ms")
    print(f"  Durée     : {duration_s:.2f} s")
    print(f"  Fichier   : {fname}")
    return ttfb_ms

print(f"Modèle : {MODEL}")
print(f"Texte  : {TEXT!r}")
print()

results = []
for name, vid in VOICES:
    print(f"▶ {name}")
    try:
        ttfb = test_voice(name, vid)
        results.append((ttfb, name))
    except Exception as e:
        print(f"  ERREUR : {e}")
    print()

print("─" * 45)
print("Classement TTFB :")
for ttfb, name in sorted(results):
    bar = "█" * int(ttfb / 50)
    print(f"  {ttfb:>5.0f} ms  {name:<35} {bar}")

# Coût estimé — Sonic 2 : $0.0004 / 1000 chars (plan pay-as-you-go)
cost = len(TEXT) * 0.0004 / 1000
print(f"\nCoût/phrase ≈ ${cost:.6f}  ({len(TEXT)} chars @ $0.40/1k chars)")
print(f"vs ElevenLabs ≈ $0.003  → {0.003/cost:.0f}x plus cher")
print()
print("Écoute avec : afplay cartesia_amélie.wav  (ou le nom de ton choix)")
