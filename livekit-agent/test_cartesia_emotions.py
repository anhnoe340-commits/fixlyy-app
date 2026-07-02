"""
Test de latence TTFB — Cartesia sonic-3.5 avec/sans émotions
Mesure le temps jusqu'au premier chunk audio reçu via WebSocket.
Usage : python3 test_cartesia_emotions.py
"""

import asyncio
import json
import os
import time
import uuid
import base64
from typing import Optional, List
import aiohttp

CARTESIA_API_KEY = os.environ.get("CARTESIA_API_KEY", "")
CARTESIA_VERSION = "2025-04-16"
VOICE_ID         = "65b25c5d-ff07-4687-a04c-da2f43ef6fa9"  # Pauline - Helpful Companion
MODEL            = "sonic-3.5"
LANGUAGE         = "fr"
RUNS_PER_PHRASE  = 3  # nb de passages pour chaque condition

WS_URL = f"wss://api.cartesia.ai/tts/websocket?api_key={CARTESIA_API_KEY}&cartesia_version={CARTESIA_VERSION}"

PHRASES = [
    {
        "label":   "Accueil neutre",
        "text":    "Bonjour, c'est Mia, l'assistante de votre artisan. Comment puis-je vous aider ?",
        "emotion": None,
    },
    {
        "label":   "Réponse urgence",
        "text":    "Je comprends, c'est urgent. Je transmets immédiatement votre demande à l'artisan.",
        "emotion": "Alarmed",
    },
    {
        "label":   "Réponse empathique",
        "text":    "Je suis vraiment désolée que vous ayez ce problème. Votre demande sera traitée en priorité.",
        "emotion": "Sympathetic",
    },
    {
        "label":   "Recadrage poli",
        "text":    "Je comprends votre impatience. L'artisan reviendra vers vous dès que possible, c'est certain.",
        "emotion": "Confident",
    },
    {
        "label":   "Clôture d'appel",
        "text":    "Merci de votre appel. Bonne journée et à bientôt.",
        "emotion": "Content",
    },
]


def build_payload(text: str, emotion: Optional[str], context_id: str) -> dict:
    payload: dict = {
        "model_id":   MODEL,
        "transcript": text,
        "voice": {
            "mode": "id",
            "id":   VOICE_ID,
        },
        "output_format": {
            "container":   "raw",
            "encoding":    "pcm_s16le",
            "sample_rate": 24000,
        },
        "language":   LANGUAGE,
        "context_id": context_id,
        "continue":   False,
    }
    if emotion:
        payload["generation_config"] = {"emotion": emotion}
    return payload


async def measure_ttfb(session: aiohttp.ClientSession, text: str, emotion: Optional[str]) -> float:
    """Retourne le TTFB en ms (temps jusqu'au 1er chunk audio)."""
    context_id = str(uuid.uuid4())
    payload = build_payload(text, emotion, context_id)

    async with session.ws_connect(
        WS_URL,
        headers={"User-Agent": "fixlyy-latency-test/1.0"},
    ) as ws:
        t_send = time.perf_counter()
        await ws.send_str(json.dumps(payload))

        async for msg in ws:
            if msg.type == aiohttp.WSMsgType.TEXT:
                data = json.loads(msg.data)
                if data.get("data"):
                    # Premier chunk audio reçu
                    t_first = time.perf_counter()
                    return (t_first - t_send) * 1000
                if data.get("done"):
                    break
                if data.get("type") == "error":
                    raise RuntimeError(f"Cartesia error: {data}")
            elif msg.type in (aiohttp.WSMsgType.CLOSED, aiohttp.WSMsgType.ERROR):
                raise RuntimeError(f"WS closed unexpectedly: {msg.type}")

    raise RuntimeError("No audio data received")


async def run_test(phrase: dict, session: aiohttp.ClientSession) -> dict:
    label   = phrase["label"]
    text    = phrase["text"]
    emotion = phrase["emotion"]

    results: dict = {"label": label, "emotion": emotion, "with": [], "without": []}

    for run in range(RUNS_PER_PHRASE):
        # Sans émotion
        try:
            ttfb = await measure_ttfb(session, text, emotion=None)
            results["without"].append(ttfb)
        except Exception as e:
            print(f"  ❌ [{label}] sans émotion run {run+1}: {e}")
        await asyncio.sleep(0.3)

        # Avec émotion (si définie)
        if emotion:
            try:
                ttfb = await measure_ttfb(session, text, emotion=emotion)
                results["with"].append(ttfb)
            except Exception as e:
                print(f"  ❌ [{label}] avec {emotion} run {run+1}: {e}")
            await asyncio.sleep(0.3)

    return results


def avg(lst: List[float]) -> float:
    return sum(lst) / len(lst) if lst else 0.0


async def main() -> None:
    print(f"\n{'='*65}")
    print(f"  Cartesia TTFB Test — modèle {MODEL}, voix Pauline ({VOICE_ID[:8]}...)")
    print(f"  {RUNS_PER_PHRASE} passages par condition | version API {CARTESIA_VERSION}")
    print(f"{'='*65}\n")

    connector = aiohttp.TCPConnector(ssl=True)
    async with aiohttp.ClientSession(connector=connector) as session:
        all_results = []
        for phrase in PHRASES:
            print(f"▶ {phrase['label']} (émotion: {phrase['emotion'] or 'aucune'})")
            result = await run_test(phrase, session)
            all_results.append(result)

            avg_without = avg(result["without"])
            print(f"   Sans émotion  : {avg_without:.0f}ms avg  {result['without']}")
            if result["emotion"] and result["with"]:
                avg_with = avg(result["with"])
                delta    = avg_with - avg_without
                sign     = "+" if delta >= 0 else ""
                ok       = "✅" if avg_with < 250 else "❌"
                print(f"   Avec {result['emotion']:12s}: {avg_with:.0f}ms avg  {result['with']}  {ok}  (delta {sign}{delta:.0f}ms)")
            print()

    # Résumé
    print(f"\n{'='*65}")
    print("  RÉSUMÉ")
    print(f"{'='*65}")
    print(f"  {'Phrase':<28}  {'Sans émotion':>14}  {'Avec émotion':>14}  {'Delta':>8}  {'OK?':>5}")
    print(f"  {'-'*70}")

    any_fail = False
    ttfb_without_all = []
    ttfb_with_all    = []

    for r in all_results:
        a_wo = avg(r["without"])
        a_wi = avg(r["with"]) if r["with"] else None
        ttfb_without_all.extend(r["without"])
        if r["with"]:
            ttfb_with_all.extend(r["with"])

        if a_wi is not None:
            delta = a_wi - a_wo
            ok    = "✅" if a_wi < 250 else "❌"
            if a_wi >= 250:
                any_fail = True
            sign = "+" if delta >= 0 else ""
            print(f"  {r['label']:<28}  {a_wo:>12.0f}ms  {a_wi:>12.0f}ms  {sign}{delta:>6.0f}ms  {ok:>5}")
        else:
            print(f"  {r['label']:<28}  {a_wo:>12.0f}ms  {'(neutre)':>14}  {'n/a':>8}  {'–':>5}")

    print(f"\n  Global sans émotion : {avg(ttfb_without_all):.0f}ms")
    if ttfb_with_all:
        global_delta = avg(ttfb_with_all) - avg(ttfb_without_all)
        sign = "+" if global_delta >= 0 else ""
        print(f"  Global avec émotion : {avg(ttfb_with_all):.0f}ms  (delta {sign}{global_delta:.0f}ms)")
        print()
        if not any_fail:
            print("  ✅ DÉCISION : Émotions compatibles (<250ms) — intégration dans agent.py possible")
        else:
            print("  ❌ DÉCISION : Latence dégradée (>250ms) — ne pas intégrer en prod")
    print(f"\n{'='*65}\n")


if __name__ == "__main__":
    asyncio.run(main())
