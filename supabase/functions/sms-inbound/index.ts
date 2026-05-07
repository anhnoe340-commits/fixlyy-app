import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SERVICE_ROLE_KEY')!
)
const ANTHROPIC_KEY = Deno.env.get('ANTHROPIC_API_KEY')!

// Réponse TwiML pour Twilio
function twiml(msg: string) {
  const safe = msg.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  return new Response(
    `<?xml version="1.0" encoding="UTF-8"?><Response><Message>${safe}</Message></Response>`,
    { headers: { 'Content-Type': 'text/xml' } }
  )
}

// Formate les horaires de l'artisan en texte lisible
function formatHours(hours: Record<string, { enabled: boolean; from: string; to: string }>): string {
  const labels: Record<string, string> = { mon: 'Lun', tue: 'Mar', wed: 'Mer', thu: 'Jeu', fri: 'Ven', sat: 'Sam', sun: 'Dim' }
  return Object.entries(labels)
    .filter(([k]) => hours[k]?.enabled)
    .map(([k, l]) => `${l}: ${hours[k].from}–${hours[k].to}`)
    .join(', ') || 'Non définis'
}

// Vérifie qu'un créneau est dans les horaires ET pas déjà pris
function isAvailable(
  date: string, time: string,
  hours: Record<string, { enabled: boolean; from: string; to: string }>,
  appointments: Array<{ appointment_date: string; appointment_time: string }>
): boolean {
  const dayKeys = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat']
  const d = new Date(date + 'T12:00:00')
  const dayHours = hours[dayKeys[d.getDay()]]
  if (!dayHours?.enabled) return false

  const toMins = (t: string) => { const [h, m] = t.split(':').map(Number); return h * 60 + m }
  const slot = toMins(time)
  if (slot < toMins(dayHours.from) || slot > toMins(dayHours.to) - 60) return false

  return !appointments.some(a =>
    a.appointment_date === date && a.appointment_time.slice(0, 5) === time.slice(0, 5)
  )
}

serve(async (req) => {
  if (req.method !== 'POST') return new Response('Method Not Allowed', { status: 405 })

  // Twilio envoie du form-encoded
  const text = await req.text()
  const p = new URLSearchParams(text)
  const from = p.get('From') || ''
  const to   = p.get('To')   || ''
  const body = (p.get('Body') || '').trim()

  if (!from || !to || !body) return twiml('Bonjour, comment puis-je vous aider ?')

  // Trouver l'artisan par son numéro Twilio
  const { data: profile } = await supabase
    .from('profiles')
    .select('id, company_name, company_type, hours')
    .eq('twilio_number', to)
    .maybeSingle()

  if (!profile) return twiml('Bonjour, comment puis-je vous aider ?')

  // Charger ou créer la conversation
  const { data: conv } = await supabase
    .from('sms_conversations')
    .select('id, messages')
    .eq('artisan_id', profile.id)
    .eq('client_phone', from)
    .maybeSingle()

  const history: Array<{ role: string; content: string }> = (conv?.messages || []).slice(-8)
  history.push({ role: 'user', content: body })

  // Horaires artisan
  let artisanHours: Record<string, { enabled: boolean; from: string; to: string }> = {}
  try { artisanHours = profile.hours ? JSON.parse(profile.hours) : {} } catch { /* noop */ }

  // RDV existants (14 prochains jours)
  const today = new Date().toISOString().split('T')[0]
  const in14  = new Date(Date.now() + 14 * 86400000).toISOString().split('T')[0]
  const { data: appts } = await supabase
    .from('appointments')
    .select('appointment_date, appointment_time, client_name, status')
    .eq('artisan_id', profile.id)
    .gte('appointment_date', today)
    .lte('appointment_date', in14)
    .neq('status', 'cancelled')

  const appointments = appts || []
  const apptSummary = appointments.length > 0
    ? appointments.map(a => `${a.appointment_date} à ${a.appointment_time.slice(0, 5)}`).join(', ')
    : 'aucun'

  const systemPrompt = `Tu es Mia, secrétaire IA de ${profile.company_name} (${profile.company_type || 'artisan'}).
Tu réponds aux SMS des clients pour les aider à prendre rendez-vous.

HORAIRES DE ${profile.company_name} : ${formatHours(artisanHours)}
RDV DÉJÀ PRIS (14 prochains jours) : ${apptSummary}
Date du jour : ${today}

RÈGLES :
1. Si le client demande un RDV : vérifie si le créneau est dans les horaires et pas déjà pris.
2. Si le créneau est disponible : confirme chaleureusement, puis termine ta réponse avec EXACTEMENT ce JSON sur une nouvelle ligne (et rien après) :
{"book":true,"date":"YYYY-MM-DD","time":"HH:MM","client_name":"prénom ou Inconnu","reason":"motif ou RDV"}
3. Si le créneau n'est pas disponible : propose le créneau libre le plus proche.
4. Si le client ne demande pas de RDV : réponds normalement et brièvement.
5. Réponds toujours en français. Sois concis — c'est un SMS.
6. N'inclus JAMAIS le JSON si tu ne veux pas créer le RDV.`

  // Appel Claude Haiku
  const aiRes = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': ANTHROPIC_KEY,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 350,
      system: systemPrompt,
      messages: history.map(m => ({ role: m.role, content: m.content })),
    }),
  })

  let replyText = 'Désolé, je suis momentanément indisponible. Rappelez-nous directement.'
  if (aiRes.ok) {
    const aiData = await aiRes.json()
    replyText = aiData.content?.[0]?.text?.trim() || replyText
  }

  // Détecter et traiter une intention de réservation
  const jsonMatch = replyText.match(/\{"book"\s*:\s*true[^}]*\}/)
  if (jsonMatch) {
    try {
      const booking = JSON.parse(jsonMatch[0])
      if (booking.book && booking.date && booking.time) {
        if (isAvailable(booking.date, booking.time, artisanHours, appointments)) {
          await supabase.from('appointments').insert({
            artisan_id: profile.id,
            client_phone: from,
            client_name: booking.client_name || 'Client SMS',
            reason: booking.reason || 'Rendez-vous',
            appointment_date: booking.date,
            appointment_time: booking.time + ':00',
            duration_minutes: 60,
            status: 'confirmed',
          })
        }
        // Supprimer le JSON de la réponse envoyée au client
        replyText = replyText.replace(jsonMatch[0], '').trim()
      }
    } catch { /* noop */ }
  }

  // Sauvegarder la conversation
  history.push({ role: 'assistant', content: replyText })
  if (conv?.id) {
    await supabase.from('sms_conversations')
      .update({ messages: history, updated_at: new Date().toISOString() })
      .eq('id', conv.id)
  } else {
    await supabase.from('sms_conversations')
      .insert({ artisan_id: profile.id, client_phone: from, messages: history })
  }

  return twiml(replyText)
})
