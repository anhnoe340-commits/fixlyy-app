import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, content-type',
}

const VOICE_IDS: Record<string, string> = {
  'female-warm': 'FFXYdAYPzn8Tw8KiHZqg',
  'female-pro':  'd3AXX0BlgJHYFCuH9X88',
  'male-warm':   'FRY6vOtGqwamgAf39SwP',
  'male-pro':    'BVBq6HVJVdnwOMJOqvy9',
}

const DEFAULT_TEXT = "Bonjour, vous êtes bien chez votre artisan. Je suis votre assistante. Comment puis-je vous aider ?"

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })

  try {
    const { voice, text } = await req.json()
    const previewText = (text && text.trim().length > 0) ? text.trim() : DEFAULT_TEXT
    const voiceId = VOICE_IDS[voice]
    if (!voiceId) {
      return new Response(JSON.stringify({ error: 'Voix inconnue' }), {
        status: 400, headers: { ...cors, 'Content-Type': 'application/json' },
      })
    }

    const apiKey = Deno.env.get('ELEVEN_API_KEY')
    if (!apiKey) {
      return new Response(JSON.stringify({ error: 'Clé API manquante' }), {
        status: 500, headers: { ...cors, 'Content-Type': 'application/json' },
      })
    }

    const res = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`, {
      method: 'POST',
      headers: {
        'xi-api-key': apiKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        text: previewText,
        model_id: 'eleven_multilingual_v2',
        voice_settings: { stability: 0.5, similarity_boost: 0.75 },
      }),
    })

    if (!res.ok) {
      const err = await res.text()
      console.error('ElevenLabs error:', err)
      return new Response(JSON.stringify({ error: 'Erreur ElevenLabs' }), {
        status: 502, headers: { ...cors, 'Content-Type': 'application/json' },
      })
    }

    const audio = await res.arrayBuffer()
    return new Response(audio, {
      headers: { ...cors, 'Content-Type': 'audio/mpeg' },
    })
  } catch (e: any) {
    return new Response(JSON.stringify({ error: e.message }), {
      status: 500, headers: { ...cors, 'Content-Type': 'application/json' },
    })
  }
})
