// Cron horaire : achète des numéros Twilio si le pool est sous REPLENISH_THRESHOLD
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const TWILIO_SID         = Deno.env.get('TWILIO_ACCOUNT_SID')!
const TWILIO_TOKEN       = Deno.env.get('TWILIO_AUTH_TOKEN')!
const TWILIO_ADDRESS_SID = Deno.env.get('TWILIO_ADDRESS_SID') ?? ''
const SB_URL        = Deno.env.get('SUPABASE_URL')!
const SB_SERVICE    = Deno.env.get('FIXLYY_SERVICE_ROLE_KEY')!
const CRON_SECRET   = Deno.env.get('CRON_SECRET')!
const THRESHOLD     = parseInt(Deno.env.get('REPLENISH_THRESHOLD') || '5')
const TARGET        = parseInt(Deno.env.get('REPLENISH_TARGET') || '10')

// Plafond absolu : jamais plus de TARGET achats en une seule exécution
const MAX_BUYS_PER_RUN = TARGET
// Plafond horaire : si >= 3 exécutions dans la dernière heure → runaway
const MAX_RUNS_PER_HOUR = 3

const sb = createClient(SB_URL, SB_SERVICE)

async function buyFrenchNumber(): Promise<{ sid: string; phoneNumber: string } | null> {
  const url = `https://api.twilio.com/2010-04-01/Accounts/${TWILIO_SID}/AvailablePhoneNumbers/FR/Local.json?VoiceEnabled=true&SmsEnabled=true&PageSize=1`
  const searchRes = await fetch(url, {
    headers: { Authorization: 'Basic ' + btoa(`${TWILIO_SID}:${TWILIO_TOKEN}`) },
  })
  if (!searchRes.ok) throw new Error(`Twilio search failed: ${searchRes.status}`)
  const { available_phone_numbers } = await searchRes.json()
  if (!available_phone_numbers?.length) return null

  const toRent = available_phone_numbers[0].phone_number

  const buyRes = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${TWILIO_SID}/IncomingPhoneNumbers.json`, {
    method: 'POST',
    headers: {
      Authorization: 'Basic ' + btoa(`${TWILIO_SID}:${TWILIO_TOKEN}`),
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({
      PhoneNumber: toRent,
      ...(TWILIO_ADDRESS_SID ? { AddressSid: TWILIO_ADDRESS_SID } : {}),
    }),
  })
  if (!buyRes.ok) throw new Error(`Twilio buy failed: ${buyRes.status} ${await buyRes.text()}`)
  const bought = await buyRes.json()
  return { sid: bought.sid, phoneNumber: bought.phone_number }
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') return new Response('Method Not Allowed', { status: 405 })

  // Auth duale : x-cron-secret (cron pg) OU Bearer service_role (service-to-service)
  const cronSecret = req.headers.get('x-cron-secret')
  const isServiceRole = req.headers.get('Authorization') === `Bearer ${SB_SERVICE}`
  if (cronSecret !== CRON_SECRET && !isServiceRole) {
    return new Response('Unauthorized', { status: 401 })
  }

  const { dry_run = false } = await req.json().catch(() => ({}))

  const startMs = Date.now()

  try {
    // ── dry_run : simulation sans achat ni écriture ──────────────────────────
    if (dry_run) {
      const { count } = await sb
        .from('phone_numbers_pool')
        .select('*', { count: 'exact', head: true })
        .eq('status', 'available')

      const available = count ?? 0
      const wouldPurchase = available < THRESHOLD
        ? Math.min(TARGET - available, MAX_BUYS_PER_RUN)
        : 0

      return new Response(JSON.stringify({
        dry_run: true,
        message: wouldPurchase > 0
          ? `Would purchase ${wouldPurchase} numbers to reach minimum pool`
          : 'Pool OK, no purchase needed',
        current_pool_size:  available,
        minimum_required:   THRESHOLD,
        would_purchase:     wouldPurchase,
      }), { status: 200 })
    }

    // ⚠️ PRODUCTION MODE: ne passer dry_run=false qu'après
    // validation manuelle — chaque numéro Twilio coûte ~1$/mois

    // ── Fail-safe 1 : anti-runaway horaire ──────────────────────────────────
    const oneHourAgo = new Date(Date.now() - 3600_000).toISOString()
    const { count: recentRuns } = await sb
      .from('edge_function_logs')
      .select('*', { count: 'exact', head: true })
      .eq('function_name', 'replenish-phone-pool')
      .neq('status', 'skipped')
      .gte('created_at', oneHourAgo)

    if ((recentRuns ?? 0) >= MAX_RUNS_PER_HOUR) {
      const msg = `Runaway replenish-phone-pool: ${recentRuns} exécutions dans la dernière heure`
      await sb.from('critical_alerts').insert({
        alert_type: 'runaway_replenish',
        severity: 'high',
        message: msg,
        meta: { recent_runs: recentRuns, threshold: MAX_RUNS_PER_HOUR },
      })
      await sb.from('edge_function_logs').insert({
        function_name: 'replenish-phone-pool',
        status: 'error',
        duration_ms: Date.now() - startMs,
        input_meta: {},
        output_meta: { runaway: true, recent_runs: recentRuns },
        error_message: msg,
      })
      return new Response(JSON.stringify({ error: 'runaway_detected', recent_runs: recentRuns }), { status: 429 })
    }

    // ── Vérification seuil ───────────────────────────────────────────────────
    const { count } = await sb
      .from('phone_numbers_pool')
      .select('*', { count: 'exact', head: true })
      .eq('status', 'available')

    const available = count ?? 0

    if (available >= THRESHOLD) {
      await sb.from('edge_function_logs').insert({
        function_name: 'replenish-phone-pool',
        status: 'skipped',
        duration_ms: Date.now() - startMs,
        input_meta: {},
        output_meta: { available, threshold: THRESHOLD },
      })
      return new Response(JSON.stringify({ skipped: true, available }), { status: 200 })
    }

    const toBuy = Math.min(TARGET - available, MAX_BUYS_PER_RUN)

    // ── Vérification solde Twilio avant achat ────────────────────────────────
    // Chaque numéro FR coûte ~2€ (1€ setup + 1€ premier mois)
    const COST_PER_NUMBER_EUR = 2.00
    try {
      const balRes = await fetch(
        `https://api.twilio.com/2010-04-01/Accounts/${TWILIO_SID}/Balance.json`,
        { headers: { Authorization: 'Basic ' + btoa(`${TWILIO_SID}:${TWILIO_TOKEN}`) } }
      )
      if (balRes.ok) {
        const { balance, currency } = await balRes.json()
        const balanceNum = parseFloat(balance ?? '0')
        const estimatedCost = toBuy * COST_PER_NUMBER_EUR
        // Twilio balance est en USD ; ~1.08 USD/EUR. On reste conservateur.
        const estimatedCostUsd = estimatedCost * 1.10
        if (balanceNum < estimatedCostUsd) {
          const alertMsg = `⚠️ Solde Twilio insuffisant pour acheter ${toBuy} numéro(s). Solde: ${balanceNum} ${currency}, coût estimé: ${estimatedCostUsd.toFixed(2)} USD`
          await sb.from('critical_alerts').insert({
            alert_type: 'twilio_balance_low',
            severity: 'high',
            message: alertMsg,
            meta: { balance: balanceNum, currency, to_buy: toBuy, estimated_cost_usd: estimatedCostUsd },
          })
          await sb.from('edge_function_logs').insert({
            function_name: 'replenish-phone-pool',
            status: 'error',
            duration_ms: Date.now() - startMs,
            input_meta: { available, threshold: THRESHOLD },
            output_meta: { balance: balanceNum, estimated_cost_usd: estimatedCostUsd },
            error_message: alertMsg,
          })
          return new Response(JSON.stringify({ error: 'insufficient_balance', balance: balanceNum, estimated_cost_usd: estimatedCostUsd }), { status: 402 })
        }
      }
    } catch {
      // Non bloquant — si l'API balance est indisponible on continue l'achat
    }

    // ── Achat avec fail-safe 2 : plafond par exécution ───────────────────────
    const bought: string[] = []
    const errors: string[] = []

    for (let i = 0; i < toBuy; i++) {
      // Fail-safe 2 : anomalie si on dépasse le plafond en cours d'exécution
      if (bought.length >= MAX_BUYS_PER_RUN) {
        const msg = `Anomalie replenish-phone-pool: ${bought.length} achats en une seule exécution (plafond: ${MAX_BUYS_PER_RUN})`
        await sb.from('critical_alerts').insert({
          alert_type: 'runaway_replenish',
          severity: 'high',
          message: msg,
          meta: { bought_count: bought.length, max: MAX_BUYS_PER_RUN },
        })
        errors.push('max_buys_per_run_reached')
        break
      }

      try {
        const num = await buyFrenchNumber()
        if (!num) { errors.push('no_available_number'); break }

        await sb.from('phone_numbers_pool').insert({
          twilio_sid:   num.sid,
          phone_number: num.phoneNumber,
          type:         'local',
          status:       'available',
          purchased_at: new Date().toISOString(),
        })

        await sb.from('phone_purchase_log').insert({
          phone_number: num.phoneNumber,
          twilio_sid:   num.sid,
          action:       'purchased',
          triggered_by: 'replenish_cron',
          cost_eur:     1.00,
          meta:         { target: TARGET, available_before: available },
        })

        bought.push(num.phoneNumber)
      } catch (err: any) {
        errors.push(err.message)
        break
      }
    }

    await sb.from('edge_function_logs').insert({
      function_name: 'replenish-phone-pool',
      status: errors.length && !bought.length ? 'error' : 'success',
      duration_ms: Date.now() - startMs,
      input_meta: { available_before: available, threshold: THRESHOLD, target: TARGET },
      output_meta: { bought, errors },
      error_message: errors[0] || null,
    })

    return new Response(JSON.stringify({ bought, errors }), { status: 200 })

  } catch (err: any) {
    await sb.from('edge_function_logs').insert({
      function_name: 'replenish-phone-pool',
      status: 'error',
      duration_ms: Date.now() - startMs,
      input_meta: {},
      output_meta: {},
      error_message: err.message,
    })
    return new Response(JSON.stringify({ error: 'internal_error' }), { status: 500 })
  }
})
