import { checkRateLimit, getClientIp, TOO_MANY_REQUESTS } from '../_shared/rateLimit.ts'

const cors = {
  'Access-Control-Allow-Origin': 'https://app.fixlyy.fr',
  'Access-Control-Allow-Headers': 'authorization, content-type',
}

// Voice IDs Cartesia sonic-3.5 — tous mappés sur la voix française de Mia
const VOICE_IDS: Record<string, string> = {
  'female-warm': '65b25c5d-ff07-4687-a04c-da2f43ef6fa9',
  'female-pro':  '65b25c5d-ff07-4687-a04c-da2f43ef6fa9',
  'male-warm':   '65b25c5d-ff07-4687-a04c-da2f43ef6fa9',
  'male-pro':    '65b25c5d-ff07-4687-a04c-da2f43ef6fa9',
}

const DEFAULT_TEXT = "Bonjour, vous êtes bien chez votre artisan. Je suis votre assistante. Comment puis-je vous aider ?"

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })

  const ip = getClientIp(req)
  if (!(await checkRateLimit(ip, 'voice-preview', 3, 60_000))) return TOO_MANY_REQUESTS(cors)

  try {
    const { voice, text } = await req.json()
    const previewText = (text && text.trim().length > 0) ? text.trim() : DEFAULT_TEXT
    const voiceId = VOICE_IDS[voice]
    if (!voiceId) {
      return new Response(JSON.stringify({ error: 'Voix inconnue' }), {
        status: 400, headers: { ...cors, 'Content-Type': 'application/json' },
      })
    }

    const apiKey = Deno.env.get('CARTESIA_API_KEY')
    if (!apiKey) {
      return new Response(JSON.stringify({ error: 'Clé API manquante' }), {
        status: 500, headers: { ...cors, 'Content-Type': 'application/json' },
      })
    }

    const res = await fetch('https://api.cartesia.ai/tts/bytes', {
      method: 'POST',
      headers: {
        'X-API-Key': apiKey,
        'Cartesia-Version': '2024-06-10',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model_id: 'sonic-3.5',
        transcript: previewText,
        voice: { mode: 'id', id: voiceId },
        output_format: { container: 'mp3', encoding: 'mp3', sample_rate: 44100 },
        language: 'fr',
      }),
    })

    if (!res.ok) {
      const err = await res.text()
      console.error('[voice-preview] Cartesia error:', err)
      return new Response(JSON.stringify({ error: 'Erreur synthese vocale' }), {
        status: 502, headers: { ...cors, 'Content-Type': 'application/json' },
      })
    }

    const audio = await res.arrayBuffer()
    return new Response(audio, {
      headers: { ...cors, 'Content-Type': 'audio/mpeg' },
    })
  } catch (e: any) {
    console.error('[voice-preview] error:', e.message)
    return new Response(JSON.stringify({ error: 'internal_error' }), {
      status: 500, headers: { ...cors, 'Content-Type': 'application/json' },
    })
  }
})
