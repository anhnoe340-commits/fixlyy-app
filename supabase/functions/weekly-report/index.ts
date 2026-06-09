import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { featureAllowed } from '../_shared/planGate.ts'

const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('FIXLYY_SERVICE_ROLE_KEY')!)
const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY')!
const CRON_SECRET = Deno.env.get('CRON_SECRET') || null

const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, content-type, x-cron-secret' }

function weekRange(): { from: Date; to: Date; label: string } {
  const now = new Date()
  const to = new Date(now)
  const from = new Date(now)
  from.setDate(from.getDate() - 7)
  const fmt = (d: Date) => d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'long' })
  return { from, to, label: `${fmt(from)} – ${fmt(to)}` }
}

function formatDuration(sec: number): string {
  const m = Math.floor(sec / 60), s = sec % 60
  return m > 0 ? `${m}min${s > 0 ? ` ${s}s` : ''}` : `${s}s`
}

function qualityColor(score: number | null): string {
  if (score == null) return '#9CA3AF'
  if (score >= 7) return '#10B981'
  if (score >= 5) return '#F59E0B'
  return '#EF4444'
}

function buildEmail(artisan: {
  name: string
  totalCalls: number
  urgentCalls: number
  rdvCount: number
  avgQuality: number | null
  avgDuration: number
  topClients: { name: string; count: number }[]
  doneCount: number
  weekLabel: string
}): string {
  const qScore = artisan.avgQuality != null ? artisan.avgQuality.toFixed(1) : '—'
  const qColor = qualityColor(artisan.avgQuality)
  const treatRate = artisan.totalCalls > 0 ? Math.round((artisan.doneCount / artisan.totalCalls) * 100) : 0
  const avgDurStr = artisan.avgDuration > 0 ? formatDuration(artisan.avgDuration) : '—'

  const topClientsHtml = artisan.topClients.length === 0
    ? '<p style="color:#9CA3AF;font-size:13px;">Aucun client identifié cette semaine</p>'
    : artisan.topClients.map(c => `
        <div style="display:flex;align-items:center;justify-content:space-between;padding:8px 0;border-bottom:1px solid #F3F4F6;">
          <span style="font-size:13px;color:#374151;">${c.name}</span>
          <span style="font-size:12px;font-weight:600;color:#6B7280;">${c.count} appel${c.count > 1 ? 's' : ''}</span>
        </div>`).join('')

  return `<!DOCTYPE html>
<html lang="fr">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Rapport hebdomadaire Fixlyy</title></head>
<body style="margin:0;padding:0;background:#F9FAFB;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#F9FAFB;padding:32px 16px;">
    <tr><td align="center">
      <table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;">

        <!-- Header -->
        <tr><td style="background:#111827;border-radius:16px 16px 0 0;padding:28px 32px;">
          <table width="100%"><tr>
            <td><span style="font-size:18px;font-weight:700;color:#fff;letter-spacing:-0.3px;">⚡ Fixlyy</span></td>
            <td align="right"><span style="font-size:12px;color:#9CA3AF;">Rapport du ${artisan.weekLabel}</span></td>
          </tr></table>
          <p style="font-size:22px;font-weight:700;color:#fff;margin:16px 0 4px;">Bonjour ${artisan.name} 👋</p>
          <p style="font-size:14px;color:#9CA3AF;margin:0;">Voici le bilan de la semaine de Mia.</p>
        </td></tr>

        <!-- KPIs -->
        <tr><td style="background:#fff;padding:28px 32px;">
          <table width="100%" cellpadding="0" cellspacing="0">
            <tr>
              <td width="25%" style="text-align:center;padding:0 8px 0 0;">
                <div style="background:#F9FAFB;border-radius:12px;padding:16px 8px;">
                  <p style="font-size:28px;font-weight:700;color:#111827;margin:0;">${artisan.totalCalls}</p>
                  <p style="font-size:11px;color:#9CA3AF;margin:4px 0 0;text-transform:uppercase;letter-spacing:0.5px;">Appels</p>
                </div>
              </td>
              <td width="25%" style="text-align:center;padding:0 4px;">
                <div style="background:#FEF2F2;border-radius:12px;padding:16px 8px;">
                  <p style="font-size:28px;font-weight:700;color:#EF4444;margin:0;">${artisan.urgentCalls}</p>
                  <p style="font-size:11px;color:#9CA3AF;margin:4px 0 0;text-transform:uppercase;letter-spacing:0.5px;">Urgents</p>
                </div>
              </td>
              <td width="25%" style="text-align:center;padding:0 4px;">
                <div style="background:#ECFDF5;border-radius:12px;padding:16px 8px;">
                  <p style="font-size:28px;font-weight:700;color:#10B981;margin:0;">${artisan.rdvCount}</p>
                  <p style="font-size:11px;color:#9CA3AF;margin:4px 0 0;text-transform:uppercase;letter-spacing:0.5px;">RDV pris</p>
                </div>
              </td>
              <td width="25%" style="text-align:center;padding:0 0 0 8px;">
                <div style="background:#F9FAFB;border-radius:12px;padding:16px 8px;">
                  <p style="font-size:28px;font-weight:700;color:${qColor};margin:0;">${qScore}</p>
                  <p style="font-size:11px;color:#9CA3AF;margin:4px 0 0;text-transform:uppercase;letter-spacing:0.5px;">Qualité Mia</p>
                </div>
              </td>
            </tr>
          </table>

          <!-- Métriques secondaires -->
          <table width="100%" cellpadding="0" cellspacing="0" style="margin-top:20px;">
            <tr>
              <td width="50%" style="padding-right:8px;">
                <div style="background:#F9FAFB;border-radius:12px;padding:14px 16px;">
                  <p style="font-size:11px;color:#9CA3AF;margin:0 0 4px;text-transform:uppercase;letter-spacing:0.5px;">Durée moyenne</p>
                  <p style="font-size:18px;font-weight:700;color:#111827;margin:0;">${avgDurStr}</p>
                </div>
              </td>
              <td width="50%" style="padding-left:8px;">
                <div style="background:#F9FAFB;border-radius:12px;padding:14px 16px;">
                  <p style="font-size:11px;color:#9CA3AF;margin:0 0 4px;text-transform:uppercase;letter-spacing:0.5px;">Taux de traitement</p>
                  <p style="font-size:18px;font-weight:700;color:#111827;margin:0;">${treatRate}%</p>
                </div>
              </td>
            </tr>
          </table>
        </td></tr>

        <!-- Top clients -->
        <tr><td style="background:#fff;padding:0 32px 28px;border-top:1px solid #F3F4F6;">
          <p style="font-size:14px;font-weight:600;color:#111827;margin:0 0 12px;">Clients fréquents cette semaine</p>
          ${topClientsHtml}
        </td></tr>

        <!-- CTA -->
        <tr><td style="background:#F9FAFB;border-top:1px solid #F3F4F6;padding:24px 32px;text-align:center;">
          <a href="https://app.fixlyy.fr" style="display:inline-block;background:#111827;color:#fff;font-size:14px;font-weight:600;padding:12px 28px;border-radius:10px;text-decoration:none;letter-spacing:-0.2px;">
            Voir le tableau de bord →
          </a>
          <p style="font-size:11px;color:#D1D5DB;margin:16px 0 0;">Ce rapport est envoyé chaque lundi matin · <a href="https://app.fixlyy.fr" style="color:#9CA3AF;">Fixlyy</a></p>
        </td></tr>

        <!-- Footer -->
        <tr><td style="background:#111827;border-radius:0 0 16px 16px;padding:20px 32px;text-align:center;">
          <p style="font-size:11px;color:#6B7280;margin:0;">© ${new Date().getFullYear()} Fixlyy · Pour ne plus recevoir ces rapports, désactivez-les dans vos paramètres.</p>
        </td></tr>

      </table>
    </td></tr>
  </table>
</body>
</html>`
}

async function sendEmail(to: string, subject: string, html: string) {
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${RESEND_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from: 'Fixlyy <rapport@fixlyy.fr>', to, subject, html }),
  })
  if (!res.ok) {
    const err = await res.text()
    throw new Error(`Resend error: ${err}`)
  }
  return res.json()
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })

  // Vérifier le secret cron si configuré
  if (CRON_SECRET) {
    const incoming = req.headers.get('x-cron-secret')
    if (incoming !== CRON_SECRET) return new Response('Unauthorized', { status: 401 })
  }

  const { from, to, label: weekLabel } = weekRange()

  // Charger tous les artisans actifs avec un email
  const { data: artisansRaw, error } = await supabase
    .from('profiles')
    .select('id, email, company_name, assistant_name, subscription_plan')
    .in('subscription_status', ['active', 'trialing'])
    .not('email', 'is', null)
    .eq('email_notifications_enabled', true)

  // Filtrer par plan — weekly_report est Pro/Max uniquement
  const artisans = (artisansRaw ?? []).filter(a => featureAllowed(a.subscription_plan, 'weekly_report'))

  if (error || !artisans.length) {
    console.error('No artisans or error:', error)
    return new Response(JSON.stringify({ ok: true, sent: 0 }), { headers: { ...cors, 'Content-Type': 'application/json' } })
  }

  let sent = 0
  const errors: string[] = []

  for (const artisan of artisans) {
    try {
      // Appels de la semaine
      const { data: calls } = await supabase
        .from('calls')
        .select('status, duration_seconds, conversation_quality_score, caller_name')
        .eq('artisan_id', artisan.id)
        .gte('created_at', from.toISOString())
        .lte('created_at', to.toISOString())

      // RDV de la semaine
      const { count: rdvCount } = await supabase
        .from('appointments')
        .select('id', { count: 'exact', head: true })
        .eq('artisan_id', artisan.id)
        .gte('created_at', from.toISOString())
        .lte('created_at', to.toISOString())

      const c = calls || []
      const urgentCalls = c.filter(x => x.status === 'urgent').length
      const doneCount = c.filter(x => x.status === 'done').length
      const durations = c.filter(x => x.duration_seconds != null).map(x => x.duration_seconds!)
      const avgDuration = durations.length ? Math.round(durations.reduce((a, b) => a + b, 0) / durations.length) : 0
      const scores = c.filter(x => x.conversation_quality_score != null).map(x => x.conversation_quality_score!)
      const avgQuality = scores.length ? scores.reduce((a, b) => a + b, 0) / scores.length : null

      // Top clients (par fréquence)
      const nameCount: Record<string, number> = {}
      c.forEach(x => { if (x.caller_name) nameCount[x.caller_name] = (nameCount[x.caller_name] || 0) + 1 })
      const topClients = Object.entries(nameCount)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 3)
        .map(([name, count]) => ({ name, count }))

      if (c.length === 0 && !rdvCount) continue // Pas d'activité, on n'envoie pas

      const artisanName = artisan.company_name || artisan.email!.split('@')[0]
      const html = buildEmail({
        name: artisanName,
        totalCalls: c.length,
        urgentCalls,
        rdvCount: rdvCount || 0,
        avgQuality,
        avgDuration,
        topClients,
        doneCount,
        weekLabel,
      })

      await sendEmail(
        artisan.email!,
        `📊 Rapport hebdo Fixlyy — ${c.length} appel${c.length !== 1 ? 's' : ''} cette semaine`,
        html
      )
      sent++
    } catch (e: any) {
      const maskedEmail = artisan.email ? artisan.email.split('@')[0].slice(0,2) + '***@' + artisan.email.split('@')[1] : 'unknown'
      console.error(`Failed for ${maskedEmail}:`, e.message)
      errors.push(`${maskedEmail}: ${e.message}`)
    }
  }

  return new Response(
    JSON.stringify({ ok: true, sent, errors }),
    { headers: { ...cors, 'Content-Type': 'application/json' } }
  )
})
