/**
 * Migration : basculer le VoiceUrl de chaque numéro du pool Twilio
 * de Vapi (https://api.vapi.ai/call/phone) vers LiveKit SIP
 * (https://hxkpmmekaotwmzgqxafp.supabase.co/functions/v1/twilio-sip-router)
 *
 * Usage : npx tsx scripts/migrate-numbers-to-livekit.ts [--dry-run]
 *
 * Numéros concernés : tous les numéros du pool (available + assigned),
 * sauf quarantaine.
 */

import { createClient } from '@supabase/supabase-js'
import * as fs from 'fs'
import * as path from 'path'

// Charger .env.local manuellement
const envPath = path.resolve(process.cwd(), '.env.local')
if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, 'utf8').split('\n')) {
    const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/)
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '')
  }
}

const DRY_RUN = process.argv.includes('--dry-run')

const SB_URL         = process.env.SUPABASE_URL!
const SB_SERVICE     = process.env.FIXLYY_SERVICE_ROLE_KEY!
const TWILIO_SID     = process.env.TWILIO_ACCOUNT_SID!
const TWILIO_TOKEN   = process.env.TWILIO_AUTH_TOKEN!

// URL de la nouvelle edge function SIP router
const SIP_ROUTER_URL = `${SB_URL}/functions/v1/twilio-sip-router`

if (!SB_URL || !SB_SERVICE)   { console.error('SUPABASE_URL ou FIXLYY_SERVICE_ROLE_KEY manquant'); process.exit(1) }
if (!TWILIO_SID || !TWILIO_TOKEN) { console.error('TWILIO_ACCOUNT_SID ou TWILIO_AUTH_TOKEN manquant'); process.exit(1) }

const sb = createClient(SB_URL, SB_SERVICE)

async function patchTwilioVoiceUrl(twilioSid: string, phoneNumber: string): Promise<void> {
  const url = `https://api.twilio.com/2010-04-01/Accounts/${TWILIO_SID}/IncomingPhoneNumbers/${twilioSid}.json`
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: 'Basic ' + Buffer.from(`${TWILIO_SID}:${TWILIO_TOKEN}`).toString('base64'),
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({
      VoiceUrl:    SIP_ROUTER_URL,
      VoiceMethod: 'POST',
    }),
  })
  if (!res.ok) {
    const text = await res.text()
    throw new Error(`Twilio PATCH ${twilioSid} (${phoneNumber}) — ${res.status}: ${text}`)
  }
}

async function main() {
  console.log(`\n=== Migration VoiceUrl → LiveKit SIP ${DRY_RUN ? '[DRY-RUN]' : ''} ===`)
  console.log(`SIP Router URL : ${SIP_ROUTER_URL}\n`)

  // Tous les numéros du pool sauf quarantaine
  const { data: rows, error } = await sb
    .from('phone_numbers_pool')
    .select('id, phone_number, twilio_sid, status')
    .neq('status', 'quarantine')
    .not('twilio_sid', 'is', null)

  if (error) { console.error('Erreur DB:', error.message); process.exit(1) }
  if (!rows?.length) { console.log('Aucun numéro trouvé dans le pool.'); return }

  console.log(`${rows.length} numéro(s) à traiter :\n`)

  let ok = 0; let ko = 0
  for (const row of rows) {
    const label = `${row.phone_number}  [${row.status}]  twilio_sid=${row.twilio_sid}`
    if (DRY_RUN) {
      console.log(`  [DRY] ${label}`)
      continue
    }
    try {
      await patchTwilioVoiceUrl(row.twilio_sid, row.phone_number)
      console.log(`  ✅ ${label}`)
      ok++
    } catch (e: any) {
      console.error(`  ❌ ${label} — ${e.message}`)
      ko++
    }
    // Pause entre les appels pour éviter le rate limiting Twilio
    await new Promise(r => setTimeout(r, 300))
  }

  console.log(`\n=== Résultat : ${ok} OK / ${ko} erreurs ===`)
  console.log(`\nPour vérifier : https://console.twilio.com/us1/develop/phone-numbers/manage/active\n`)

  if (ko > 0) process.exit(1)
}

main()
