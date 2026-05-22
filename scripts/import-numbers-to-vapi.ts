// scripts/import-numbers-to-vapi.ts
// One-shot : importe +33939247033 et +33939246754 dans Vapi sans assistantId
// Usage : npx tsx scripts/import-numbers-to-vapi.ts --dry-run
//         npx tsx scripts/import-numbers-to-vapi.ts

import { createClient } from '@supabase/supabase-js'

try { (process as any).loadEnvFile('.env.local') } catch { /* absent */ }

const DRY_RUN = process.argv.includes('--dry-run')

const TWILIO_SID   = process.env.TWILIO_ACCOUNT_SID!
const TWILIO_TOKEN = process.env.TWILIO_AUTH_TOKEN!
const VAPI_KEY     = process.env.VAPI_API_KEY!
const SB_URL       = process.env.SUPABASE_URL!
const SB_SERVICE   = process.env.FIXLYY_SERVICE_ROLE_KEY!

const sb = createClient(SB_URL, SB_SERVICE)

const NUMBERS = ['+33939247033', '+33939246754']

function log(msg: string) { console.log(`[${new Date().toISOString()}] ${msg}`) }

async function importNumber(phoneNumber: string): Promise<void> {
  log(`→ Traitement de ${phoneNumber}`)

  if (DRY_RUN) {
    log(`  [DRY-RUN] POST /phone-number avec :`)
    log(`    provider        : twilio`)
    log(`    number          : ${phoneNumber}`)
    log(`    twilioAccountSid: ${TWILIO_SID}`)
    log(`    twilioAuthToken : ***`)
    log(`    name            : fixlyy-pool-${phoneNumber.slice(-4)}`)
    return
  }

  // 1. POST vers Vapi pour importer le numéro
  const res = await fetch('https://api.vapi.ai/phone-number', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${VAPI_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      provider:         'twilio',
      number:           phoneNumber,
      twilioAccountSid: TWILIO_SID,
      twilioAuthToken:  TWILIO_TOKEN,
      name:             `fixlyy-pool-${phoneNumber.slice(-4)}`,
      // Pas d'assistantId intentionnellement — on importe seulement
    }),
  })

  const body = await res.json()

  if (!res.ok) {
    log(`  ✗ ERREUR Vapi ${res.status} : ${JSON.stringify(body)}`)
    return
  }

  const vapiPhoneNumberId: string = body.id
  log(`  ✓ Vapi phone-number créé : ${vapiPhoneNumberId}`)
  log(`    status : ${body.status}`)
  log(`    number : ${body.number}`)

  // 2. UPDATE phone_numbers_pool
  const { error } = await sb
    .from('phone_numbers_pool')
    .update({ vapi_phone_number_id: vapiPhoneNumberId })
    .eq('phone_number', phoneNumber)

  if (error) {
    log(`  ✗ DB UPDATE échoué : ${error.message}`)
  } else {
    log(`  ✓ phone_numbers_pool mis à jour`)
  }
}

async function main() {
  log(`Mode : ${DRY_RUN ? 'DRY-RUN' : 'RÉEL'}`)

  if (!TWILIO_SID || !TWILIO_TOKEN || !VAPI_KEY || !SB_URL || !SB_SERVICE) {
    console.error('Variables manquantes — vérifie .env.local')
    process.exit(1)
  }

  for (const num of NUMBERS) {
    await importNumber(num)
  }

  log('─── Terminé ───')
}

main().catch(e => { console.error('Fatal:', e); process.exit(1) })
