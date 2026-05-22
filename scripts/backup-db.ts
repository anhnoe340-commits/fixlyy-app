// scripts/backup-db.ts
// Backup manuel des tables critiques vers backups/[timestamp]/
// Usage : npx tsx scripts/backup-db.ts

import { createClient } from '@supabase/supabase-js'
import { createHash } from 'crypto'
import { mkdirSync, writeFileSync } from 'fs'
import { join } from 'path'

try { (process as any).loadEnvFile('.env.local') } catch { /* absent */ }

const SB_URL     = process.env.SUPABASE_URL!
const SB_SERVICE = process.env.FIXLYY_SERVICE_ROLE_KEY!

if (!SB_URL || !SB_SERVICE) {
  console.error('Variables manquantes : SUPABASE_URL, FIXLYY_SERVICE_ROLE_KEY')
  process.exit(1)
}

const sb = createClient(SB_URL, SB_SERVICE)

const TABLES = [
  'profiles',
  'calls',
  'contacts',
  'phone_numbers_pool',
  'audit_log',
  'subscriptions',
  'appointments',
  'sms_conversations',
] as const

function sha256(content: string): string {
  return createHash('sha256').update(content).digest('hex')
}

function log(msg: string) {
  console.log(`[${new Date().toISOString()}] ${msg}`)
}

async function fetchTable(table: string): Promise<unknown[]> {
  let rows: unknown[] = []
  let from = 0
  const pageSize = 1000

  while (true) {
    const { data, error } = await sb
      .from(table)
      .select('*')
      .range(from, from + pageSize - 1)

    if (error) throw new Error(`SELECT ${table} failed: ${error.message}`)
    if (!data || data.length === 0) break

    rows = rows.concat(data)
    if (data.length < pageSize) break
    from += pageSize
  }

  return rows
}

async function main() {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)
  const outDir = join('backups', timestamp)

  mkdirSync(outDir, { recursive: true })
  log(`Dossier créé : ${outDir}`)

  const manifest: {
    created_at: string
    supabase_url: string
    tables: Record<string, { row_count: number; sha256: string; file: string }>
  } = {
    created_at: new Date().toISOString(),
    supabase_url: SB_URL,
    tables: {},
  }

  for (const table of TABLES) {
    log(`→ Backup ${table}...`)
    try {
      const rows = await fetchTable(table)
      const content = JSON.stringify(rows, null, 2)
      const hash = sha256(content)
      const file = `${table}.json`
      const filePath = join(outDir, file)

      writeFileSync(filePath, content, 'utf8')

      manifest.tables[table] = { row_count: rows.length, sha256: hash, file }
      log(`  ✓ ${rows.length} rows — SHA256: ${hash.slice(0, 16)}...`)
    } catch (e: any) {
      log(`  ✗ ERREUR : ${e.message}`)
      manifest.tables[table] = { row_count: -1, sha256: '', file: `${table}.json` }
    }
  }

  const manifestPath = join(outDir, 'manifest.json')
  writeFileSync(manifestPath, JSON.stringify(manifest, null, 2), 'utf8')
  log(`\nManifest écrit : ${manifestPath}`)

  const total = Object.values(manifest.tables).reduce((s, t) => s + Math.max(t.row_count, 0), 0)
  log(`─── Terminé : ${total} rows sauvegardées dans ${outDir} ───`)
}

main().catch(e => { console.error('Fatal:', e); process.exit(1) })
