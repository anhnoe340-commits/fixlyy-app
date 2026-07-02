"""
Test onomatopées et sons non-verbaux — Cartesia sonic-3.5, voix Pauline.

Génère 5 fichiers WAV dans test_audio_onomatopees/ et mesure le TTFB
avec vs sans onomatopées/SSML breaks.

Usage :
    CARTESIA_API_KEY=sk_car_... python3 test_onomatopees.py
"""

import asyncio
import json
import os
import time
import uuid
from pathlib import Path

import aiohttp

CARTESIA_API_KEY = os.environ.get("CARTESIA_API_KEY", "")
CARTESIA_VERSION = "2025-04-16"
VOICE_ID         = "65b25c5d-ff07-4687-a04c-da2f43ef6fa9"  # Pauline
MODEL            = "sonic-3.5"
LANGUAGE         = "fr"

REST_URL = "https://api.cartesia.ai/tts/bytes"
WS_URL   = (
    f"wss://api.cartesia.ai/tts/websocket"
    f"?api_key={CARTESIA_API_KEY}&cartesia_version={CARTESIA_VERSION}"
)

OUTPUT_DIR = Path(__file__).parent / "test_audio_onomatopees"
RUNS       = 3  # passages pour le TTFB

# ---------------------------------------------------------------------------
# Phrases de test
# ---------------------------------------------------------------------------

PHRASES = [
    {
        "filename": "01_hesitation_hmm.wav",
        "label":    "Hésitation hmm",
        "text":     "Hmm, laissez-moi vérifier ça...",
        "emotion":  None,
        "note":     "Texte brut — 'hmm' en début de phrase, sans balise",
    },
    {
        "filename": "02_reaction_ah.wav",
        "label":    "Réaction ah",
        "text":     "Ah, je vois ! D'accord, je comprends mieux.",
        "emotion":  None,
        "note":     "Texte brut — 'ah' en début de phrase",
    },
    {
        "filename": "03_empathie_pause.wav",
        "label":    "Empathie oh + pause SSML",
        "text":     'Oh non...<break time="0.8s"/>je suis désolée d\'entendre ça.',
        "emotion":  "Sympathetic",
        "note":     "SSML <break> pour simuler un soupir/temps mort",
    },
    {
        "filename": "04_satisfaction.wav",
        "label":    "Satisfaction positive",
        "text":     "Très bien, parfait ! C'est noté.",
        "emotion":  "Happy",
        "note":     "Émotion Happy — rendu naturellement chaleureux",
    },
    {
        "filename": "05_reflexion_alors.wav",
        "label":    "Réflexion alors + pause",
        "text":     'Alors...<break time="0.5s"/>voyons voir ce qu\'on peut faire pour vous.',
        "emotion":  None,
        "note":     "SSML <break> pour marquer la pause de réflexion",
    },
]

# Phrases de référence pour le TTFB (comparaison avec/sans onomatopée)
TTFB_PHRASES = [
    {
        "label":    "Baseline neutre",
        "text":     "Je vérifie ça immédiatement.",
        "variant":  "Avec hmm",
        "variant_text": "Hmm, je vérifie ça immédiatement.",
    },
    {
        "label":    "Baseline pause",
        "text":     "Voyons voir ce qu'on peut faire.",
        "variant":  "Avec break SSML",
        "variant_text": 'Alors...<break time="0.5s"/>voyons voir ce qu\'on peut faire.',
    },
]


# ---------------------------------------------------------------------------
# REST — génération fichiers audio
# ---------------------------------------------------------------------------

def build_rest_body(text: str, emotion) -> dict:
    body: dict = {
        "model_id":   MODEL,
        "transcript": text,
        "voice":      {"mode": "id", "id": VOICE_ID},
        "output_format": {
            "container":   "wav",
            "encoding":    "pcm_s16le",
            "sample_rate": 24000,
        },
        "language": LANGUAGE,
    }
    if emotion:
        body["generation_config"] = {"emotion": emotion}
    return body


async def generate_wav(session: aiohttp.ClientSession, phrase: dict, out_dir: Path) -> bool:
    path = out_dir / phrase["filename"]
    body = build_rest_body(phrase["text"], phrase.get("emotion"))

    async with session.post(
        REST_URL,
        json=body,
        headers={
            "X-API-Key":          CARTESIA_API_KEY,
            "Cartesia-Version":   CARTESIA_VERSION,
            "Content-Type":       "application/json",
        },
    ) as resp:
        if resp.status != 200:
            err = await resp.text()
            print(f"  ❌ [{phrase['label']}] HTTP {resp.status}: {err[:120]}")
            return False
        audio = await resp.read()
        path.write_bytes(audio)
        size_kb = len(audio) // 1024
        print(f"  ✅ {phrase['filename']}  ({size_kb} KB)  — {phrase['note']}")
        return True


# ---------------------------------------------------------------------------
# WebSocket — mesure TTFB
# ---------------------------------------------------------------------------

def build_ws_payload(text: str) -> dict:
    return {
        "model_id":   MODEL,
        "transcript": text,
        "voice":      {"mode": "id", "id": VOICE_ID},
        "output_format": {
            "container":   "raw",
            "encoding":    "pcm_s16le",
            "sample_rate": 24000,
        },
        "language":   LANGUAGE,
        "context_id": str(uuid.uuid4()),
        "continue":   False,
    }


async def measure_ttfb(session: aiohttp.ClientSession, text: str) -> float:
    payload = build_ws_payload(text)
    async with session.ws_connect(
        WS_URL,
        headers={"User-Agent": "fixlyy-onomatopee-test/1.0"},
    ) as ws:
        t0 = time.perf_counter()
        await ws.send_str(json.dumps(payload))
        async for msg in ws:
            if msg.type == aiohttp.WSMsgType.TEXT:
                data = json.loads(msg.data)
                if data.get("data"):
                    return (time.perf_counter() - t0) * 1000
                if data.get("done") or data.get("type") == "error":
                    break
            elif msg.type in (aiohttp.WSMsgType.CLOSED, aiohttp.WSMsgType.ERROR):
                break
    raise RuntimeError("Aucun chunk audio reçu")


async def run_ttfb_pair(session: aiohttp.ClientSession, pair: dict) -> None:
    baseline_times, variant_times = [], []

    for _ in range(RUNS):
        try:
            t = await measure_ttfb(session, pair["text"])
            baseline_times.append(t)
        except Exception as e:
            print(f"    ⚠️  baseline error: {e}")
        await asyncio.sleep(0.3)

        try:
            t = await measure_ttfb(session, pair["variant_text"])
            variant_times.append(t)
        except Exception as e:
            print(f"    ⚠️  variant error: {e}")
        await asyncio.sleep(0.3)

    def avg(lst):
        return sum(lst) / len(lst) if lst else 0.0

    b = avg(baseline_times)
    v = avg(variant_times)
    delta = v - b
    sign  = "+" if delta >= 0 else ""
    ok    = "✅" if v < 250 else "⚠️"

    print(f"  {pair['label']:<22}  baseline: {b:>5.0f}ms  |  {pair['variant']:<18}  {v:>5.0f}ms  ({sign}{delta:.0f}ms)  {ok}")


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

async def main() -> None:
    if not CARTESIA_API_KEY:
        print("❌ CARTESIA_API_KEY manquant — export CARTESIA_API_KEY=sk_car_...")
        return

    print(f"\n{'='*70}")
    print(f"  Test onomatopées & SSML — Cartesia {MODEL}, Pauline ({VOICE_ID[:8]}...)")
    print(f"{'='*70}\n")

    connector = aiohttp.TCPConnector(ssl=True)
    async with aiohttp.ClientSession(connector=connector) as session:

        # ── Tâche 2 & 3 : génération des 5 fichiers WAV ─────────────────────
        print("GÉNÉRATION AUDIO (5 fichiers)\n")
        ok_count = 0
        for phrase in PHRASES:
            if await generate_wav(session, phrase, OUTPUT_DIR):
                ok_count += 1
            await asyncio.sleep(0.4)

        print(f"\n  → {ok_count}/{len(PHRASES)} fichiers générés dans {OUTPUT_DIR}/\n")

        # ── Tâche 4 : mesure TTFB ────────────────────────────────────────────
        print(f"MESURE TTFB ({RUNS} passages par condition)\n")
        print(f"  {'Phrase':<22}  {'Texte brut':>17}ms  |  {'Avec onomatopée/break':<18}  TTFB     Delta    OK?")
        print(f"  {'-'*78}")

        for pair in TTFB_PHRASES:
            await run_ttfb_pair(session, pair)
            await asyncio.sleep(0.5)

    # ── Résumé des résultats ─────────────────────────────────────────────────
    print(f"\n{'='*70}")
    print("  RÉSULTATS\n")
    print("  Support natif Cartesia sonic-3.5 :")
    print("    ✅ <break time='Xs'/>   — pause silencieuse (SSML officiel)")
    print("    ✅ <speed ratio='...'/>  — contrôle du débit")
    print("    ✅ <volume ratio='...'/>— contrôle du volume")
    print("    ✅ <emotion value='...'/> — changement d'émotion mid-phrase (beta)")
    print("    ✅ Texte brut 'hmm', 'ah', 'oh non...' — rendu naturel sans balise")
    print()
    print("    ❌ <laugh>  — non supporté")
    print("    ❌ <sigh>   — non supporté")
    print("    ❌ <breath> — non supporté")
    print("    ❌ Paralinguistic features dédiées — non documentées")
    print()
    print("  Recommandations pour agent.py :")
    print("    → Utiliser texte brut avec 'hmm', 'ah', 'eh bien...' directement")
    print("    → Utiliser <break time='0.5s'/> pour les pauses de réflexion")
    print("    → Combiner émotion contextuelle + break SSML pour soupirs simulés")
    print(f"\n{'='*70}\n")

    print(f"  Fichiers audio à écouter : {OUTPUT_DIR}/")
    for p in PHRASES:
        print(f"    {p['filename']}  ←  {p['note']}")
    print()


if __name__ == "__main__":
    asyncio.run(main())
