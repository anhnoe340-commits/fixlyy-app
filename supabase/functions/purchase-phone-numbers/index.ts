// Achète des numéros Twilio 09 national FR quand le pool tombe sous le seuil.
// Différences vs replenish-phone-pool :
//   - API National (pas Local) → numéros 09 uniquement
//   - Filtre dur +339... sur chaque numéro candidat
//   - Pré-configure VoiceUrl → twilio-sip-router dès l'achat
//   - Vérification voice+SMS sur le numéro acheté, status='error' si raté
//   - Seuil : PURCHASE_THRESHOLD (défaut 3) / Batch : PURCHASE_BATCH_SIZE (défaut 5)
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const TWILIO_SID         = Deno.env.get('TWILIO_ACCOUNT_SID')!
const TWILIO_TOKEN       = Deno.env.get('TWILIO_AUTH_TOKEN')!
// Bundle réglementaire France National (approuvé Twilio, adresse Villiers-sur-Marne)
const TWILIO_BUNDLE_SID         = Deno.env.get('TWILIO_BUNDLE_SID')         ?? 'BU8bded271b7b03c4c47c11dad86f1f30a'
const TWILIO_BUNDLE_ADDRESS_SID = Deno.env.get('TWILIO_BUNDLE_ADDRESS_SID') ?? 'AD055f44393e4efebbf13a9fe379236465'
const SB_URL             = Deno.env.get('SUPABASE_URL')!
const SB_SERVICE         = Deno.env.get('FIXLYY_SERVICE_ROLE_KEY')!
const CRON_SECRET        = Deno.env.get('CRON_SECRET')!

const THRESHOLD  = parseInt(Deno.env.get('PURCHASE_THRESHOLD')  || '3')
const BATCH_SIZE = parseInt(Deno.env.get('PURCHASE_BATCH_SIZE') || '5')

const MAX_RUNS_PER_HOUR   = 3
const COST_PER_NUMBER_EUR = 2.00  // ~1€ setup + 1€ premier mois
const VOICE_URL           = `${SB_URL}/functions/v1/twilio-sip-router`

const sb = createClient(SB_URL, SB_SERVICE)

function twilioAuth() {
  return 'Basic ' + btoa(`${TWILIO_SID}:${TWILIO_TOKEN}`)
}

// ── Twilio helpers ────────────────────────────────────────────────────────────

async function getTwilioBalance(): Promise<{ balance: number; currency: string } | null> {
  try {
    const res = await fetch(
      `https://api.twilio.com/2010-04-01/Accounts/${TWILIO_SID}/Balance.json`,
      { headers: { Authorization: twilioAuth() } }
    )
    if (!res.ok) return null
    const { balance, currency } = await res.json()
    return { balance: parseFloat(balance ?? '0'), currency }
  } catch {
    return null
  }
}

// Cherche jusqu'à `limit*3` numéros FR via Local.json et filtre sur le préfixe +339 (09 national)
// Note: Twilio FR n'expose pas d'endpoint /National.json — les 09 sont retournés via /Local.json
async function findNational09Numbers(limit: number): Promise<string[]> {
  const url = new URL(`https://api.twilio.com/2010-04-01/Accounts/${TWILIO_SID}/AvailablePhoneNumbers/FR/Local.json`)
  url.searchParams.set('VoiceEnabled', 'true')
  url.searchParams.set('SmsEnabled', 'true')
  url.searchParams.set('PageSize', String(limit * 3))  // sur-demander pour compenser le filtre 09

  const res = await fetch(url.toString(), { headers: { Authorization: twilioAuth() } })
  if (!res.ok) throw new Error(`Twilio search failed: ${res.status} ${await res.text()}`)

  const { available_phone_numbers } = await res.json()
  if (!available_phone_numbers?.length) return []

  // Filtre strict : uniquement les numéros dont le E.164 commence par +339
  return (available_phone_numbers as Array<{ phone_number: string }>)
    .map(n => n.phone_number)
    .filter(n => n.startsWith('+339'))
    .slice(0, limit)
}

// Achète un numéro et retourne son SID
async function purchaseNumber(phoneNumber: string): Promise<string> {
  const params: Record<string, string> = { PhoneNumber: phoneNumber }
  // Twilio FR national requiert BundleSid + l'AddressSid lié au bundle
  params.BundleSid  = TWILIO_BUNDLE_SID
  params.AddressSid = TWILIO_BUNDLE_ADDRESS_SID

  const res = await fetch(
    `https://api.twilio.com/2010-04-01/Accounts/${TWILIO_SID}/IncomingPhoneNumbers.json`,
    {
      method: 'POST',
      headers: { Authorization: twilioAuth(), 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams(params),
    }
  )
  if (!res.ok) throw new Error(`Twilio purchase failed: ${res.status} ${await res.text()}`)
  const bought = await res.json()
  if (!bought.sid) throw new Error(`Twilio purchase: sid absent dans la réponse`)
  return bought.sid as string
}

// Patch VoiceUrl → twilio-sip-router (pré-configure à l'achat)
async function patchVoiceUrl(twilioSid: string): Promise<boolean> {
  const res = await fetch(
    `https://api.twilio.com/2010-04-01/Accounts/${TWILIO_SID}/IncomingPhoneNumbers/${twilioSid}.json`,
    {
      method: 'POST',
      headers: { Authorization: twilioAuth(), 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ VoiceUrl: VOICE_URL, VoiceMethod: 'POST' }),
    }
  )
  return res.ok
}

// Vérifie que le numéro a bien voice + SMS activés (post-achat)
async function verifyCapabilities(twilioSid: string): Promise<{ voice: boolean; sms: boolean }> {
  const res = await fetch(
    `https://api.twilio.com/2010-04-01/Accounts/${TWILIO_SID}/IncomingPhoneNumbers/${twilioSid}.json`,
    { headers: { Authorization: twilioAuth() } }
  )
  if (!res.ok) return { voice: false, sms: false }
  const data = await res.json()
  return {
    voice: !!data.capabilities?.voice,
    sms:   !!data.capabilities?.sms,
  }
}

// ── Main handler ──────────────────────────────────────────────────────────────

Deno.serve(async (req) => {
  if (req.method !== 'POST') return new Response('Method Not Allowed', { status: 405 })

  const cronSecret     = req.headers.get('x-cron-secret')
  const isServiceRole  = req.headers.get('Authorization') === `Bearer ${SB_SERVICE}`
  if (cronSecret !== CRON_SECRET && !isServiceRole) {
    return new Response('Unauthorized', { status: 401 })
  }

  const { dry_run = false, force = false, limit } = await req.json().catch(() => ({}))
  const startMs = Date.now()

  try {
    // ── Vérification seuil ────────────────────────────────────────────────────
    const { count } = await sb
      .from('phone_numbers_pool')
      .select('*', { count: 'exact', head: true })
      .eq('status', 'available')

    const available = count ?? 0

    if (!force && available >= THRESHOLD) {
      await sb.from('edge_function_logs').insert({
        function_name: 'purchase-phone-numbers',
        status: 'skipped',
        duration_ms: Date.now() - startMs,
        input_meta: { dry_run },
        output_meta: { available, threshold: THRESHOLD },
      })
      return new Response(JSON.stringify({ skipped: true, available, threshold: THRESHOLD }), { status: 200 })
    }

    const toFetch = (limit && Number.isInteger(limit) && limit > 0) ? Math.min(limit, BATCH_SIZE) : BATCH_SIZE

    // ── Mode dry_run ──────────────────────────────────────────────────────────
    if (dry_run) {
      const candidates = await findNational09Numbers(toFetch).catch(() => [])
      return new Response(JSON.stringify({
        dry_run: true,
        available,
        threshold: THRESHOLD,
        would_purchase: toFetch,
        sample_candidates: candidates.slice(0, 3),
        message: `Would purchase up to ${toFetch} national 09 numbers (current pool: ${available})`,
      }), { status: 200 })
    }

    // ── Anti-runaway ──────────────────────────────────────────────────────────
    const oneHourAgo = new Date(Date.now() - 3600_000).toISOString()
    const { count: recentRuns } = await sb
      .from('edge_function_logs')
      .select('*', { count: 'exact', head: true })
      .eq('function_name', 'purchase-phone-numbers')
      .neq('status', 'skipped')
      .gte('created_at', oneHourAgo)

    if ((recentRuns ?? 0) >= MAX_RUNS_PER_HOUR) {
      const msg = `Runaway purchase-phone-numbers: ${recentRuns} exécutions dans la dernière heure`
      await sb.from('critical_alerts').insert({
        alert_type: 'runaway_replenish',
        severity: 'high',
        message: msg,
        meta: { recent_runs: recentRuns },
      })
      return new Response(JSON.stringify({ error: 'runaway_detected' }), { status: 429 })
    }

    // ── Vérification solde Twilio ─────────────────────────────────────────────
    const bal = await getTwilioBalance()
    if (bal) {
      const estimatedCostUsd = toFetch * COST_PER_NUMBER_EUR * 1.10
      if (bal.balance < estimatedCostUsd) {
        const alertMsg = `⚠️ Solde Twilio insuffisant pour ${toFetch} numéro(s) 09. Solde: ${bal.balance} ${bal.currency}, coût estimé: ${estimatedCostUsd.toFixed(2)} USD`
        await sb.from('critical_alerts').insert({
          alert_type: 'twilio_balance_low',
          severity: 'high',
          message: alertMsg,
          meta: { balance: bal.balance, currency: bal.currency, to_buy: toFetch, estimated_cost_usd: estimatedCostUsd },
        })
        await sb.from('edge_function_logs').insert({
          function_name: 'purchase-phone-numbers',
          status: 'error',
          duration_ms: Date.now() - startMs,
          input_meta: { available, threshold: THRESHOLD },
          output_meta: { balance: bal.balance },
          error_message: alertMsg,
        })
        return new Response(JSON.stringify({ error: 'insufficient_balance', balance: bal.balance }), { status: 402 })
      }
    }

    // ── Recherche numéros 09 ──────────────────────────────────────────────────
    const candidates = await findNational09Numbers(toFetch)
    if (!candidates.length) {
      const msg = 'Aucun numéro national 09 disponible chez Twilio'
      await sb.from('critical_alerts').insert({
        alert_type: 'no_09_numbers_available',
        severity: 'high',
        message: msg,
        meta: { available, threshold: THRESHOLD },
      })
      await sb.from('edge_function_logs').insert({
        function_name: 'purchase-phone-numbers',
        status: 'error',
        duration_ms: Date.now() - startMs,
        input_meta: { available },
        output_meta: {},
        error_message: msg,
      })
      return new Response(JSON.stringify({ error: 'no_candidates' }), { status: 503 })
    }

    // ── Achat + configuration ─────────────────────────────────────────────────
    const purchased: string[] = []
    const errors: string[] = []

    for (const phoneNumber of candidates) {
      if (purchased.length >= BATCH_SIZE) break

      // Vérification préfixe (double-check)
      if (!phoneNumber.startsWith('+339')) {
        errors.push(`rejected_prefix: ${phoneNumber}`)
        continue
      }

      let twilioSid: string | null = null
      try {
        // 1. Achat Twilio
        twilioSid = await purchaseNumber(phoneNumber)

        // 2. Vérification voice + SMS
        const caps = await verifyCapabilities(twilioSid)
        if (!caps.voice || !caps.sms) {
          errors.push(`${phoneNumber}: voice=${caps.voice} sms=${caps.sms}`)
          await sb.from('phone_numbers_pool').insert({
            twilio_sid:   twilioSid,
            phone_number: phoneNumber,
            type:         'national',
            status:       'error',
            purchased_at: new Date().toISOString(),
            notes:        `Capacités insuffisantes: voice=${caps.voice} sms=${caps.sms}`,
          })
          await sb.from('phone_purchase_log').insert({
            phone_number: phoneNumber,
            twilio_sid:   twilioSid,
            action:       'purchased_error',
            triggered_by: 'purchase_cron',
            cost_eur:     1.00,
            meta:         { caps, reason: 'missing_capabilities' },
          })
          continue
        }

        // 3. Patch VoiceUrl → twilio-sip-router
        const voiceOk = await patchVoiceUrl(twilioSid)
        if (!voiceOk) {
          errors.push(`${phoneNumber}: VoiceUrl patch failed`)
          await sb.from('phone_numbers_pool').insert({
            twilio_sid:   twilioSid,
            phone_number: phoneNumber,
            type:         'national',
            status:       'error',
            purchased_at: new Date().toISOString(),
            notes:        'VoiceUrl patch échoué — à reconfigurer manuellement',
          })
          await sb.from('phone_purchase_log').insert({
            phone_number: phoneNumber,
            twilio_sid:   twilioSid,
            action:       'purchased_error',
            triggered_by: 'purchase_cron',
            cost_eur:     1.00,
            meta:         { reason: 'voiceurl_patch_failed' },
          })
          continue
        }

        // 4. Insertion pool — status='available' seulement si tout est OK
        const { error: poolErr } = await sb.from('phone_numbers_pool').insert({
          twilio_sid:   twilioSid,
          phone_number: phoneNumber,
          type:         'national',
          status:       'available',
          purchased_at: new Date().toISOString(),
          notes:        'auto_purchase_cron',
        })
        if (poolErr) throw new Error(`Pool insert failed: ${poolErr.message}`)

        await sb.from('phone_purchase_log').insert({
          phone_number: phoneNumber,
          twilio_sid:   twilioSid,
          action:       'purchased',
          triggered_by: 'purchase_cron',
          cost_eur:     1.00,
          meta: {
            batch_size: BATCH_SIZE,
            available_before: available,
            voice_url: VOICE_URL,
          },
        })

        purchased.push(phoneNumber)

      } catch (err: any) {
        errors.push(`${phoneNumber}: ${err.message}`)
        // Si le SID existe, on l'enregistre quand même avec status=error pour traçabilité
        if (twilioSid) {
          await sb.from('phone_numbers_pool').insert({
            twilio_sid:   twilioSid,
            phone_number: phoneNumber,
            type:         'national',
            status:       'error',
            purchased_at: new Date().toISOString(),
            notes:        `Erreur: ${err.message}`,
          }).catch(() => {})
        }
      }
    }

    await sb.from('edge_function_logs').insert({
      function_name: 'purchase-phone-numbers',
      status: errors.length && !purchased.length ? 'error' : 'success',
      duration_ms: Date.now() - startMs,
      input_meta: { available_before: available, threshold: THRESHOLD, batch_size: BATCH_SIZE },
      output_meta: { purchased, errors },
      error_message: errors[0] || null,
    })

    return new Response(JSON.stringify({ purchased, errors, available_before: available }), { status: 200 })

  } catch (err: any) {
    await sb.from('edge_function_logs').insert({
      function_name: 'purchase-phone-numbers',
      status: 'error',
      duration_ms: Date.now() - startMs,
      input_meta: {},
      output_meta: {},
      error_message: err.message,
    })
    return new Response(JSON.stringify({ error: 'internal_error' }), { status: 500 })
  }
})
