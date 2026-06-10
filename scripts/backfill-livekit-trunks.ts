/**
 * Backfill LiveKit SIP trunks + dispatch rules pour les artisans
 * déjà onboardés (numéros assignés sans livekit_trunk_id).
 *
 * Usage : npx tsx scripts/backfill-livekit-trunks.ts [--dry-run]
 */

import { createClient } from '@supabase/supabase-js'
import * as fs from 'fs'
import * as path from 'path'
import * as crypto from 'crypto'

// Charger .env.local manuellement
const envPath = path.resolve(process.cwd(), '.env.local')
if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, 'utf8').split('\n')) {
    const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/)
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '')
  }
}

const DRY_RUN = process.argv.includes('--dry-run')

const SB_URL     = process.env.SUPABASE_URL!
const SB_SERVICE = process.env.FIXLYY_SERVICE_ROLE_KEY!
const LK_URL     = 'https://fixlyy-pou60iq2.livekit.cloud'
const LK_KEY     = process.env.LIVEKIT_CLOUD_API_KEY!
const LK_SECRET  = process.env.LIVEKIT_CLOUD_API_SECRET!

if (!SB_URL || !SB_SERVICE) { console.error('SUPABASE_URL ou FIXLYY_SERVICE_ROLE_KEY manquant'); process.exit(1) }
if (!LK_KEY || !LK_SECRET)  { console.error('LIVEKIT_CLOUD_API_KEY ou LIVEKIT_CLOUD_API_SECRET manquant'); process.exit(1) }

const sb = createClient(SB_URL, SB_SERVICE)

function livekitToken(): string {
  const now = Math.floor(Date.now() / 1000)
  const enc = (obj: object) =>
    Buffer.from(JSON.stringify(obj)).toString('base64url')
  const head    = enc({ alg: 'HS256', typ: 'JWT' })
  const payload = enc({ iss: LK_KEY, sub: 'sip-admin', iat: now, exp: now + 60, nbf: now, sip: { admin: true } })
  const input   = `${head}.${payload}`
  const sig     = crypto.createHmac('sha256', LK_SECRET).update(input).digest('base64url')
  return `${input}.${sig}`
}

async function createTrunk(userId: string, phone: string): Promise<string> {
  const res = await fetch(`${LK_URL}/twirp/livekit.SIP/CreateSIPInboundTrunk`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${livekitToken()}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ trunk: { name: `artisan-${userId.slice(0, 8)}`, numbers: [phone] } }),
  })
  if (!res.ok) throw new Error(`CreateSIPInboundTrunk ${res.status}: ${await res.text()}`)
  const d = await res.json()
  const id = d?.trunk?.sipTrunkId ?? d?.trunk?.sip_trunk_id ?? d?.sipTrunkId ?? d?.sip_trunk_id
  if (!id) throw new Error(`sip_trunk_id absent: ${JSON.stringify(d)}`)
  return id
}

async function createDispatchRule(userId: string, trunkId: string): Promise<string> {
  const res = await fetch(`${LK_URL}/twirp/livekit.SIP/CreateSIPDispatchRule`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${livekitToken()}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      trunkIds: [trunkId],
      rule: { dispatchRuleDirect: { roomName: `artisan-${userId}`, pin: '' } },
      name: `artisan-${userId.slice(0, 8)}-rule`,
    }),
  })
  if (!res.ok) throw new Error(`CreateSIPDispatchRule ${res.status}: ${await res.text()}`)
  const d = await res.json()
  const id = d?.rule?.sipDispatchRuleId ?? d?.rule?.sip_dispatch_rule_id ?? d?.sipDispatchRuleId ?? d?.sip_dispatch_rule_id
  if (!id) throw new Error(`sip_dispatch_rule_id absent: ${JSON.stringify(d)}`)
  return id
}

async function main() {
  console.log(`\n=== Backfill LiveKit trunks ${DRY_RUN ? '[DRY-RUN]' : ''} ===\n`)

  // Artisans avec numéro assigné mais sans trunk LiveKit
  const { data: rows, error } = await sb
    .from('profiles')
    .select('id, company_name, twilio_number, livekit_trunk_id')
    .not('twilio_number', 'is', null)
    .is('livekit_trunk_id', null)

  if (error) { console.error('Erreur DB:', error.message); process.exit(1) }
  if (!rows?.length) { console.log('✅ Tous les profils ont déjà un trunk LiveKit.'); return }

  console.log(`${rows.length} profil(s) à traiter :\n`)

  let ok = 0; let ko = 0
  for (const row of rows) {
    const label = `${row.company_name || row.id.slice(0, 8)} — ${row.twilio_number}`
    if (DRY_RUN) { console.log(`  [DRY] ${label}`); continue }
    try {
      const trunkId       = await createTrunk(row.id, row.twilio_number)
      const dispatchRuleId = await createDispatchRule(row.id, trunkId)
      await sb.from('profiles').update({
        livekit_trunk_id:         trunkId,
        livekit_dispatch_rule_id: dispatchRuleId,
      }).eq('id', row.id)
      console.log(`  ✅ ${label}`)
      console.log(`      trunk=${trunkId}`)
      console.log(`      rule=${dispatchRuleId}`)
      ok++
    } catch (e: any) {
      console.error(`  ❌ ${label} — ${e.message}`)
      ko++
    }
    // Pause 500ms entre les appels pour éviter rate limiting LiveKit
    await new Promise(r => setTimeout(r, 500))
  }

  console.log(`\n=== Résultat : ${ok} OK / ${ko} erreurs ===\n`)
  if (ko > 0) process.exit(1)
}

main()
