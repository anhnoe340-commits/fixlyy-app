/**
 * patch-existing-assistants.ts
 * Met à jour les assistants Vapi existants avec le nouveau system prompt
 * (section RÉSUMÉ DE FIN D'APPEL) et le champ fullSummary dans structuredDataPlan.
 *
 * Usage: npx tsx scripts/patch-existing-assistants.ts --dry-run
 *        npx tsx scripts/patch-existing-assistants.ts
 */

import { createClient } from '@supabase/supabase-js'

try { (process as any).loadEnvFile('.env.local') } catch { /* fichier absent */ }

const DRY_RUN = process.argv.includes('--dry-run')

const sb = createClient(
  process.env.SUPABASE_URL!,
  process.env.FIXLYY_SERVICE_ROLE_KEY!
)
const VAPI_KEY    = process.env.VAPI_API_KEY!
const SB_URL      = process.env.SUPABASE_URL!
const WEBHOOK_URL = `${SB_URL}/functions/v1/send-call-sms`
const WEBHOOK_SECRET = process.env.VAPI_WEBHOOK_SECRET

function log(msg: string) { console.log(`[${new Date().toISOString()}] ${msg}`) }

function buildSystemPrompt(p: { assistant_name: string; company_name: string; company_type: string }) {
  const { assistant_name: assistantName, company_name: companyName, company_type: companyType } = p
  return `# IDENTITÉ
Tu es ${assistantName}, la réceptionniste de ${companyName} (${companyType}).
Tu es chaleureuse, professionnelle, et tu t'adaptes à chaque client.

# STYLE
- Commence par un marqueur naturel : "D'accord", "Très bien", "Oh là" (si urgence), "Prenez votre temps" (si hésitation)
- Réagis aux émotions AVANT de poser ta question suivante
- Reformule ce que dit le client pour montrer que tu écoutes
- Phrases courtes, max 20 mots
- Ne dis jamais deux fois la même formule dans un appel
- Si demandé si tu es une IA : "Je suis l'assistante de ${companyName}, je transmets votre demande à l'artisan."

# OBJECTIFS (ordre flexible)
Collecte naturellement : nom, téléphone, adresse complète, problème précis, urgence, disponibilités.
Ne dis JAMAIS "Je dois vous poser quelques questions".
Tu dois TOUJOURS demander l'adresse avant de raccrocher. Sans adresse, l'artisan ne peut pas intervenir.

# CLÔTURE
Toujours terminer par : "Je récapitule : vous êtes [Nom], au [Adresse], pour [Problème]. On vous rappelle [délai]. C'est bien ça ?"
Puis : "Merci, à très vite !"

## RÉSUMÉ DE FIN D'APPEL
À la fin de l'appel, tu remplis le champ fullSummary avec un résumé structuré destiné à l'artisan par SMS.
Ce résumé doit respecter STRICTEMENT le format suivant (3 phrases maximum, toujours en français) :

1. [RAISON] Une phrase courte expliquant pourquoi le client a appelé.
2. [INFOS CLÉS] Nom du client, adresse (si donnée), téléphone (si donné), détail technique critique (type de panne, ampleur du problème).
3. [URGENCE + ACTION] Le niveau d'urgence (URGENT / NORMAL / PEUT ATTENDRE) suivi de la prochaine action concrète (rappeler avant Xh, devis à envoyer, RDV confirmé le [date] à [heure], etc.).

Règles strictes :
- Toujours en français, jamais d'anglais
- Maximum 3 phrases
- Ton professionnel et factuel (style note de chantier)
- Si une info manque, l'indiquer explicitement ("adresse non communiquée")
- URGENT / NORMAL / PEUT ATTENDRE — un seul parmi ces trois

Exemples :
"Fuite d'eau active sous l'évier de cuisine. Mme Dupont, 12 rue de la Paix Paris 11e, 06 12 34 56 78, eau coupée au compteur, risque de dégât. URGENT : rappeler immédiatement, intervention souhaitée dans les 2h."
"Devis pour remplacement chaudière gaz. M. Martin, 45 av Foch Boulogne, 06 98 76 54 32, chaudière 15 ans en panne intermittente. NORMAL : RDV confirmé jeudi 23 mai à 14h pour visite technique."
"Demande d'information sur tarifs dépannage serrurerie. M. Bernard, adresse non communiquée, 07 11 22 33 44, prêt à comparer plusieurs devis. PEUT ATTENDRE : rappeler dans la journée pour qualifier le besoin."`
}

const STRUCTURED_DATA_SCHEMA = {
  type: 'object',
  properties: {
    customerName:             { type: 'string', description: 'Prénom et nom du client' },
    customerPhone:            { type: 'string', description: 'Numéro de téléphone du client' },
    customerAddress:          { type: 'string', description: "Adresse complète de l'intervention" },
    reason:                   { type: 'string', description: "Raison de l'appel en 1 phrase" },
    urgency:                  { type: 'string', enum: ['urgent', 'non_urgent'] },
    appointmentDate:          { type: 'string', description: 'Date souhaitée si mentionnée' },
    appointmentTime:          { type: 'string', description: 'Heure souhaitée si mentionnée' },
    smsBody:                  { type: 'string', description: "Accroche courte max 80 chars : nature exacte du problème + action immédiate. Toujours en français." },
    fullSummary:              { type: 'string', description: "Résumé complet en 3 phrases max, toujours en français : (1) raison de l'appel, (2) nom + adresse + téléphone + détail technique, (3) URGENT/NORMAL/PEUT ATTENDRE + action concrète pour l'artisan. Style note de chantier, factuel." },
    clientTone:               { type: 'string', enum: ['calme', 'stressé', 'agressif', 'confus'] },
    aiToneUsed:               { type: 'string', enum: ['efficace', 'empathique', 'rassurante'] },
    conversationQualityScore: { type: 'integer', description: 'Note 0-10' },
    conversationQualityNotes: { type: 'string', description: 'Note en 1 phrase sur la qualité' },
  },
}

async function main() {
  log(`Mode : ${DRY_RUN ? 'DRY-RUN' : 'RÉEL'}`)

  const { data: profiles, error } = await sb
    .from('profiles')
    .select('id, company_name, company_type, assistant_name, vapi_assistant_id')
    .not('vapi_assistant_id', 'is', null)

  if (error) throw new Error(error.message)
  if (!profiles?.length) { log('Aucun profil provisionné.'); return }

  log(`${profiles.length} assistant(s) à patcher`)

  for (const p of profiles) {
    const assistantId = p.vapi_assistant_id
    const name = p.company_name || '(sans nom)'
    log(`  → ${name} [${assistantId}]`)

    if (DRY_RUN) {
      log(`    [DRY-RUN] PATCHerait system prompt + fullSummary`)
      continue
    }

    const systemPrompt = buildSystemPrompt({
      assistant_name: p.assistant_name || 'Mia',
      company_name:   p.company_name   || 'votre artisan',
      company_type:   p.company_type   || 'artisan',
    })

    const patchBody: Record<string, unknown> = {
      model: {
        provider: 'openai',
        model: 'gpt-4o-mini',
        maxTokens: 250,
        temperature: 0.75,
        messages: [{ role: 'system', content: systemPrompt }],
      },
      analysisPlan: {
        summaryPlan: { enabled: true },
        structuredDataPlan: { enabled: true, schema: STRUCTURED_DATA_SCHEMA },
      },
      serverUrl: WEBHOOK_URL,
      ...(WEBHOOK_SECRET ? { serverUrlSecret: WEBHOOK_SECRET } : {}),
    }

    const res = await fetch(`https://api.vapi.ai/assistant/${assistantId}`, {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${VAPI_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(patchBody),
    })

    if (!res.ok) {
      log(`    ✗ ERREUR : ${res.status} ${await res.text()}`)
    } else {
      log(`    ✓ Patché`)
    }
  }

  log('─── Patch terminé ───')
}

main().catch(e => { console.error('Fatal:', e); process.exit(1) })
