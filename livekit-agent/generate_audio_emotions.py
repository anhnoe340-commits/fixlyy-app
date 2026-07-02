"""
Génération d'échantillons audio — Cartesia sonic-3.5, voix Pauline
25 phrases couvrant un large panel d'émotions pour écoute manuelle.

Usage : python3 generate_audio_emotions.py
Output : test_audio_emotions/[num]_[emotion].wav
"""

import asyncio
import json
import os
import wave
from typing import Optional, List
import aiohttp

CARTESIA_API_KEY = os.environ.get("CARTESIA_API_KEY", "")
CARTESIA_VERSION = "2025-04-16"
VOICE_ID         = "65b25c5d-ff07-4687-a04c-da2f43ef6fa9"  # Pauline - Helpful Companion
MODEL            = "sonic-3.5"
LANGUAGE         = "fr"
SAMPLE_RATE      = 24000
OUTPUT_DIR       = os.path.join(os.path.dirname(__file__), "test_audio_emotions")

# ── Toutes les émotions disponibles dans sonic-3 / sonic-3.5 ──────────────────
# Source : livekit-plugins-cartesia v1.3.12 / models.py (mis à jour 2025-10-24)
ALL_AVAILABLE_EMOTIONS: List[str] = [
    # Positives
    "Happy", "Excited", "Enthusiastic", "Elated", "Euphoric", "Triumphant",
    "Amazed", "Surprised", "Flirtatious", "Joking/Comedic",
    # Neutres / calmes
    "Curious", "Content", "Peaceful", "Serene", "Calm",
    "Grateful", "Affectionate", "Trust", "Sympathetic", "Anticipation",
    "Mysterious",
    # Négatives actives
    "Angry", "Mad", "Outraged", "Frustrated", "Agitated", "Threatened",
    "Disgusted", "Contempt", "Envious", "Sarcastic", "Ironic",
    # Tristes / basses
    "Sad", "Dejected", "Melancholic", "Disappointed", "Hurt", "Guilty",
    "Bored", "Tired", "Rejected", "Nostalgic", "Wistful",
    # Hésitations
    "Apologetic", "Hesitant", "Insecure", "Confused", "Resigned", "Anxious",
    "Panicked", "Alarmed", "Scared",
    # Assertives
    "Neutral", "Proud", "Confident", "Distant", "Skeptical",
    "Contemplative", "Determined",
]

# ── 25 échantillons de Mia avec mapping émotion ───────────────────────────────
# Convention filename :
#   exact match   → [num]_[emotion_lowercase].wav
#   non disponible → [num]_[requested]_notfound_used_[used].wav
SAMPLES = [
    {
        "num": 1,
        "requested": "Neutre",
        "emotion":   None,  # pas de generation_config
        "exact":     True,
        "filename":  "01_neutre.wav",
        "text": "Bonjour, je suis Mia, l'assistante de Jean Dupont Plomberie. Comment puis-je vous aider ?",
    },
    {
        "num": 2,
        "requested": "Alarmed",
        "emotion":   "Alarmed",
        "exact":     True,
        "filename":  "02_alarmed.wav",
        "text": "Je comprends, c'est une urgence — je transfère votre appel immédiatement.",
    },
    {
        "num": 3,
        "requested": "Sympathetic",
        "emotion":   "Sympathetic",
        "exact":     True,
        "filename":  "03_sympathetic.wav",
        "text": "Je suis vraiment désolée d'apprendre ça, je comprends votre frustration.",
    },
    {
        "num": 4,
        "requested": "Confident",
        "emotion":   "Confident",
        "exact":     True,
        "filename":  "04_confident.wav",
        "text": "Je vous confirme votre rendez-vous demain à 14h, c'est noté.",
    },
    {
        "num": 5,
        "requested": "Content",
        "emotion":   "Content",
        "exact":     True,
        "filename":  "05_content.wav",
        "text": "Merci beaucoup pour votre appel, passez une bonne journée !",
    },
    {
        "num": 6,
        "requested": "Curious",
        "emotion":   "Curious",
        "exact":     True,
        "filename":  "06_curious.wav",
        "text": "Ah, d'accord, je vois ce que vous voulez dire !",
    },
    {
        "num": 7,
        "requested": "Concerned",
        "emotion":   "Anxious",  # ← le plus proche disponible
        "exact":     False,
        "filename":  "07_concerned_notfound_used_Anxious.wav",
        "text": "Oh non, ça a dû être vraiment embêtant pour vous.",
    },
    {
        "num": 8,
        "requested": "Calm",
        "emotion":   "Calm",
        "exact":     True,
        "filename":  "08_calm.wav",
        "text": "C'est noté, je m'en occupe tout de suite.",
    },
    {
        "num": 9,
        "requested": "Happy",
        "emotion":   "Happy",
        "exact":     True,
        "filename":  "09_happy.wav",
        "text": "Ah ça c'est une excellente nouvelle, je suis ravie pour vous !",
    },
    {
        "num": 10,
        "requested": "Warm",
        "emotion":   "Affectionate",  # ← le plus proche disponible
        "exact":     False,
        "filename":  "10_warm_notfound_used_Affectionate.wav",
        "text": "Je vous en prie, c'est bien normal, c'est mon rôle de vous aider.",
    },
    {
        "num": 11,
        "requested": "Focused",
        "emotion":   "Determined",  # ← le plus proche disponible
        "exact":     False,
        "filename":  "11_focused_notfound_used_Determined.wav",
        "text": "Attendez, laissez-moi vérifier ça pour vous tout de suite.",
    },
    {
        "num": 12,
        "requested": "Surprised",
        "emotion":   "Surprised",
        "exact":     True,
        "filename":  "12_surprised.wav",
        "text": "Vraiment ? Je n'étais pas au courant, merci de me le préciser.",
    },
    {
        "num": 13,
        "requested": "Reassuring",
        "emotion":   "Peaceful",  # ← le plus proche disponible
        "exact":     False,
        "filename":  "13_reassuring_notfound_used_Peaceful.wav",
        "text": "Je comprends tout à fait votre impatience, on va régler ça rapidement.",
    },
    {
        "num": 14,
        "requested": "Apologetic",
        "emotion":   "Apologetic",
        "exact":     True,
        "filename":  "14_apologetic.wav",
        "text": "Non, je suis désolée, ce créneau n'est malheureusement plus disponible.",
    },
    {
        "num": 15,
        "requested": "Satisfied",
        "emotion":   "Serene",  # ← le plus proche disponible
        "exact":     False,
        "filename":  "15_satisfied_notfound_used_Serene.wav",
        "text": "Parfait, tout est en ordre de mon côté.",
    },
    {
        "num": 16,
        "requested": "Assuring",
        "emotion":   "Trust",  # ← le plus proche disponible
        "exact":     False,
        "filename":  "16_assuring_notfound_used_Trust.wav",
        "text": "Je vais transmettre ça immédiatement à Monsieur Dupont, ne vous inquiétez pas.",
    },
    {
        "num": 17,
        "requested": "Thoughtful",
        "emotion":   "Contemplative",  # ← dans la liste, très bon match
        "exact":     False,
        "filename":  "17_thoughtful_notfound_used_Contemplative.wav",
        "text": "C'est une situation un peu délicate, laissez-moi voir comment on peut arranger ça.",
    },
    {
        "num": 18,
        "requested": "Attentive",
        "emotion":   "Anticipation",  # ← le plus proche disponible
        "exact":     False,
        "filename":  "18_attentive_notfound_used_Anticipation.wav",
        "text": "Très bien, je prends note de tous les détails que vous venez de me donner.",
    },
    {
        "num": 19,
        "requested": "Regretful",
        "emotion":   "Guilty",  # ← le plus proche disponible
        "exact":     False,
        "filename":  "19_regretful_notfound_used_Guilty.wav",
        "text": "Je suis sincèrement navrée du désagrément, on va corriger ça au plus vite.",
    },
    {
        "num": 20,
        "requested": "Certain",
        "emotion":   "Proud",  # ← le plus proche disponible
        "exact":     False,
        "filename":  "20_certain_notfound_used_Proud.wav",
        "text": "Absolument, je peux vous confirmer que c'est bien prévu pour demain matin.",
    },
    {
        "num": 21,
        "requested": "Friendly",
        "emotion":   "Enthusiastic",  # ← le plus proche disponible
        "exact":     False,
        "filename":  "21_friendly_notfound_used_Enthusiastic.wav",
        "text": "Ah, vous êtes déjà client chez nous ? Ravie de vous reparler !",
    },
    {
        "num": 22,
        "requested": "Firm",
        "emotion":   "Determined",  # ← le plus proche disponible
        "exact":     False,
        "filename":  "22_firm_notfound_used_Determined.wav",
        "text": "Je dois malheureusement vous dire que ce n'est pas possible dans l'immédiat.",
    },
    {
        "num": 23,
        "requested": "Supportive",
        "emotion":   "Affectionate",  # ← le plus proche disponible
        "exact":     False,
        "filename":  "23_supportive_notfound_used_Affectionate.wav",
        "text": "Ne vous en faites pas, on va trouver une solution ensemble.",
    },
    {
        "num": 24,
        "requested": "Appreciative",
        "emotion":   "Grateful",  # ← dans la liste, très bon match
        "exact":     False,
        "filename":  "24_appreciative_notfound_used_Grateful.wav",
        "text": "C'est très clair, merci pour toutes ces précisions.",
    },
    {
        "num": 25,
        "requested": "Patient",
        "emotion":   "Calm",  # ← le plus proche disponible
        "exact":     False,
        "filename":  "25_patient_notfound_used_Calm.wav",
        "text": "Un instant s'il vous plaît, je vérifie la disponibilité de l'équipe.",
    },
]


async def generate_wav(
    session: aiohttp.ClientSession,
    text: str,
    emotion: Optional[str],
    output_path: str,
) -> int:
    """Appelle l'API Cartesia /tts/bytes, écrit le WAV. Retourne la taille en bytes."""
    payload: dict = {
        "model_id": MODEL,
        "transcript": text,
        "voice": {"mode": "id", "id": VOICE_ID},
        "output_format": {
            "container": "raw",
            "encoding":  "pcm_s16le",
            "sample_rate": SAMPLE_RATE,
        },
        "language": LANGUAGE,
    }
    if emotion:
        payload["generation_config"] = {"emotion": emotion}

    async with session.post(
        "https://api.cartesia.ai/tts/bytes",
        headers={
            "X-API-Key":        CARTESIA_API_KEY,
            "Cartesia-Version": CARTESIA_VERSION,
            "Content-Type":     "application/json",
        },
        json=payload,
        timeout=aiohttp.ClientTimeout(total=30),
    ) as resp:
        if resp.status != 200:
            body = await resp.text()
            raise RuntimeError(f"HTTP {resp.status}: {body[:200]}")
        pcm_data = await resp.read()

    # Encapsule le PCM brut dans un fichier WAV valide
    with wave.open(output_path, "wb") as wf:
        wf.setnchannels(1)
        wf.setsampwidth(2)   # pcm_s16le = 2 octets par sample
        wf.setframerate(SAMPLE_RATE)
        wf.writeframes(pcm_data)

    return len(pcm_data)


async def main() -> None:
    os.makedirs(OUTPUT_DIR, exist_ok=True)

    print(f"\n{'='*70}")
    print(f"  Cartesia Audio Generation — {MODEL} | Pauline ({VOICE_ID[:8]}...)")
    print(f"  {len(SAMPLES)} fichiers → {OUTPUT_DIR}/")
    print(f"{'='*70}\n")

    exact_count   = sum(1 for s in SAMPLES if s["exact"])
    approx_count  = len(SAMPLES) - exact_count

    connector = aiohttp.TCPConnector(ssl=True)
    async with aiohttp.ClientSession(connector=connector) as session:
        for s in SAMPLES:
            output_path = os.path.join(OUTPUT_DIR, s["filename"])
            emotion_display = s["emotion"] or "—"
            match_tag       = "✅" if s["exact"] else f"⚠️  ({s['requested']} → {s['emotion']})"

            print(f"  [{s['num']:02d}/25] {s['requested']:<14} {match_tag}")
            print(f"         \"{s['text'][:70]}{'…' if len(s['text']) > 70 else ''}\"")

            try:
                size = await generate_wav(session, s["text"], s["emotion"], output_path)
                print(f"         → {s['filename']}  ({size//1000} KB)\n")
            except Exception as e:
                print(f"         ❌ ERREUR : {e}\n")

            # Petite pause pour ne pas saturer l'API
            await asyncio.sleep(0.4)

    # ── Récapitulatif ──────────────────────────────────────────────────────────
    generated = [
        f for f in os.listdir(OUTPUT_DIR) if f.endswith(".wav")
    ]
    print(f"\n{'='*70}")
    print(f"  RÉSULTAT : {len(generated)}/25 fichiers générés")
    print(f"  Matchs exacts  : {exact_count}/25")
    print(f"  Approximations : {approx_count}/25")
    print(f"\n  Dossier : {OUTPUT_DIR}/")
    print(f"{'='*70}")

    # ── Liste complète des émotions disponibles ────────────────────────────────
    print(f"\n{'='*70}")
    print(f"  TOUTES LES ÉMOTIONS DISPONIBLES — sonic-3 / sonic-3.5")
    print(f"  ({len(ALL_AVAILABLE_EMOTIONS)} émotions | source : livekit-plugins-cartesia v1.3.12)")
    print(f"{'='*70}")
    cols = 4
    for i in range(0, len(ALL_AVAILABLE_EMOTIONS), cols):
        row = ALL_AVAILABLE_EMOTIONS[i:i+cols]
        print("  " + "  |  ".join(f"{e:<18}" for e in row))

    print(f"\n  Émotions NON disponibles (approximées dans ce test) :")
    not_found = [
        (s["requested"], s["emotion"])
        for s in SAMPLES
        if not s["exact"] and s["emotion"] is not None
    ]
    for req, used in not_found:
        print(f"    {req:<14} → utilisé : {used}")
    print()


if __name__ == "__main__":
    asyncio.run(main())
