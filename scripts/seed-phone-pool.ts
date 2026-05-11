/**
 * Seed le pool de numéros depuis les numéros Twilio existants.
 * Idempotent : skip les numéros déjà en base.
 *
 * Usage: npx tsx scripts/seed-phone-pool.ts
 * Requires env: TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, SUPABASE_URL, FIXLYY_SERVICE_ROLE_KEY
 */

import { readFileSync } from 'fs'
import { resolve } from 'path'

// Charge .env.local si présent
try {
  const envPath = resolve(process.cwd(), '.env.local')
  const lines = readFileSync(envPath, 'utf-8').split('\n')
  for (const line of lines) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    const idx = trimmed.indexOf('=')
    if (idx === -1) continue
    const key = trimmed.slice(0, idx).trim()
    const val = trimmed.slice(idx + 1).trim()
    if (!process.env[key]) process.env[key] = val
  }
} catch { /* .env.local absent, env vars doivent être passées manuellement */ }

import { createClient } from '@supabase/supabase-js'

const EXCLUDED_NUMBERS = ['+33939245471'] // numéro réservé onboarding dev

const TWILIO_SID   = process.env.TWILIO_ACCOUNT_SID!
const TWILIO_TOKEN = process.env.TWILIO_AUTH_TOKEN!
const SB_URL       = process.env.SUPABASE_URL!
const SB_KEY       = process.env.FIXLYY_SERVICE_ROLE_KEY!

if (!TWILIO_SID || !TWILIO_TOKEN || !SB_URL || !SB_KEY) {
  console.error('Missing required env vars')
  process.exit(1)
}

const supabase = createClient(SB_URL, SB_KEY)

async function listTwilioNumbers() {
  const url = `https://api.twilio.com/2010-04-01/Accounts/${TWILIO_SID}/IncomingPhoneNumbers.json?PageSize=100`
  const res = await fetch(url, {
    headers: {
      Authorization: 'Basic ' + Buffer.from(`${TWILIO_SID}:${TWILIO_TOKEN}`).toString('base64'),
    },
  })
  if (!res.ok) throw new Error(`Twilio API error: ${res.status} ${await res.text()}`)
  const data = await res.json() as { incoming_phone_numbers: Array<{ sid: string; phone_number: string; phone_number_type?: string }> }
  return data.incoming_phone_numbers
}

async function run() {
  console.log('Fetching Twilio numbers...')
  const twilioNumbers = await listTwilioNumbers()
  console.log(`Found ${twilioNumbers.length} Twilio numbers`)

  const toSeed = twilioNumbers.filter(n => !EXCLUDED_NUMBERS.includes(n.phone_number))
  console.log(`Seeding ${toSeed.length} numbers (${twilioNumbers.length - toSeed.length} excluded)`)

  // Récupère les numéros déjà en base pour idempotence
  const { data: existing, error: selectErr } = await supabase
    .from('phone_numbers_pool')
    .select('twilio_sid')

  if (selectErr) {
    console.error('Erreur lecture phone_numbers_pool:', selectErr.message)
    console.error('→ La migration 20260511100000_phone_pool.sql est-elle appliquée ?')
    process.exit(1)
  }

  const existingSids = new Set((existing || []).map((r: any) => r.twilio_sid))

  let seeded = 0
  let skipped = 0

  for (const num of toSeed) {
    if (existingSids.has(num.sid)) {
      skipped++
      continue
    }

    const { error } = await supabase.from('phone_numbers_pool').insert({
      twilio_sid:   num.sid,
      phone_number: num.phone_number,
      type:         'local',
      status:       'available',
      purchased_at: new Date().toISOString(),
    })

    if (error) {
      console.error(`Error inserting ${num.phone_number}:`, error.message)
      continue
    }

    // Log dans phone_purchase_log
    await supabase.from('phone_purchase_log').insert({
      phone_number: num.phone_number,
      twilio_sid:   num.sid,
      action:       'seeded',
      triggered_by: 'seed_script',
      meta:         { phone_number_type: num.phone_number_type },
    })

    console.log(`  ✓ ${num.phone_number} (${num.sid})`)
    seeded++
  }

  console.log(`\nDone: ${seeded} seeded, ${skipped} already existed`)
}

run().catch(err => {
  console.error('Fatal:', err)
  process.exit(1)
})
