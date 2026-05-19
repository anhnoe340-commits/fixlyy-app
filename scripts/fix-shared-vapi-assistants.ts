/**
 * fix-shared-vapi-assistants.ts
 *
 * Migration : crée un assistant Vapi dédié pour chaque artisan
 * qui partage actuellement le même vapi_assistant_id que d'autres.
 *
 * Usage :
 *   npx tsx scripts/fix-shared-vapi-assistants.ts --dry-run   ← preview sans rien changer
 *   npx tsx scripts/fix-shared-vapi-assistants.ts              ← migration réelle
 */

import { createClient } from '@supabase/supabase-js'

// Node.js v20.12+ natif — pas besoin de dotenv
try { (process as any).loadEnvFile('.env.local') } catch { /* fichier absent, on continue */ }

const DRY_RUN = process.argv.includes('--dry-run')

const sb = createClient(
  process.env.SUPABASE_URL!,
  process.env.FIXLYY_SERVICE_ROLE_KEY!
)
const VAPI_KEY     = process.env.VAPI_API_KEY!
const TWILIO_SID   = process.env.TWILIO_ACCOUNT_SID!
const TWILIO_TOKEN = process.env.TWILIO_AUTH_TOKEN!
const SB_URL       = process.env.SUPABASE_URL!
const WEBHOOK_URL  = `${SB_URL}/functions/v1/send-call-sms`
const WEBHOOK_SECRET = process.env.VAPI_WEBHOOK_SECRET

const VOICE_IDS: Record<string, string> = {
  'female-warm': 'FFXYdAYPzn8Tw8KiHZqg',
  'female-pro':  'b0Ev8lcOOXx2o9ZcF46H',
  'male-warm':   'FRY6vOtGqwamgAf39SwP',
  'male-pro':    'HuLbOdhRlvQQN8oPP0AJ',
}

function log(msg: string) {
  console.log(`[${new Date().toISOString()}] ${msg}`)
}

async function vapiGet(path: string) {
  const res = await fetch(`https://api.vapi.ai${path}`, {
    headers: { Authorization: `Bearer ${VAPI_KEY}` },
  })
  if (!res.ok) throw new Error(`Vapi GET ${path} failed: ${res.status} ${await res.text()}`)
  return res.json()
}

async function vapiPost(path: string, body: unknown) {
  const res = await fetch(`https://api.vapi.ai${path}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${VAPI_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  if (!res.ok) throw new Error(`Vapi POST ${path} failed: ${res.status} ${await res.text()}`)
  return res.json()
}

async function vapiPatch(path: string, body: unknown) {
  const res = await fetch(`https://api.vapi.ai${path}`, {
    method: 'PATCH',
    headers: { Authorization: `Bearer ${VAPI_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  if (!res.ok) throw new Error(`Vapi PATCH ${path} failed: ${res.status} ${await res.text()}`)
  return res.json()
}

async function vapiDelete(path: string) {
  const res = await fetch(`https://api.vapi.ai${path}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${VAPI_KEY}` },
  })
  if (!res.ok) throw new Error(`Vapi DELETE ${path} failed: ${res.status} ${await res.text()}`)
}

function buildAssistantBody(profile: {
  company_name: string | null
  company_type: string | null
  assistant_name: string | null
  assistant_voice: string | null
}) {
  const assistantName = profile.assistant_name || 'Mia'
  const companyName   = profile.company_name   || 'votre artisan'
  const companyType   = profile.company_type   || 'artisan'
  const voiceKey      = profile.assistant_voice || 'female-warm'
  const voiceId       = VOICE_IDS[voiceKey] ?? VOICE_IDS['female-warm']

  return {
    name: `${assistantName} — ${companyName}`,
    firstMessage: `Allô, ${companyName}, bonjour !`,
    endCallMessage: 'Merci pour votre appel, à très vite !',
    model: {
      provider: 'openai',
      model: 'gpt-4o-mini',
      maxTokens: 250,
      temperature: 0.75,
      messages: [{
        role: 'system',
        content: `# IDENTITÉ
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
"Demande d'information sur tarifs dépannage serrurerie. M. Bernard, adresse non communiquée, 07 11 22 33 44, prêt à comparer plusieurs devis. PEUT ATTENDRE : rappeler dans la journée pour qualifier le besoin."`,
      }],
    },
    voice: {
      provider: '11labs',
      voiceId,
      model: 'eleven_multilingual_v2',
      language: 'fr',
      stability: 0.5,
      similarityBoost: 0.75,
      style: 0.3,
      useSpeakerBoost: true,
    },
    transcriber: {
      provider: 'deepgram',
      model: 'nova-2',
      language: 'fr',
      smartFormat: true,
    },
    startSpeakingPlan: {
      waitSeconds: 0.6,
      smartEndpointingEnabled: true,
      transcriptionEndpointingPlan: {
        onPunctuationSeconds: 0.4,
        onNoPunctuationSeconds: 1.2,
        onNumberSeconds: 0.6,
      },
    },
    stopSpeakingPlan: { numWords: 2, voiceSeconds: 0.3, backoffSeconds: 1.0 },
    silenceTimeoutSeconds: 30,
    maxDurationSeconds: 600,
    backgroundSound: 'office',
    backchannelingEnabled: true,
    modelOutputInMessagesEnabled: true,
    backgroundDenoisingEnabled: true,
    serverUrl: WEBHOOK_URL,
    ...(WEBHOOK_SECRET ? { serverUrlSecret: WEBHOOK_SECRET } : {}),
    analysisPlan: {
      summaryPlan: {
        enabled: true,
      },
      structuredDataPlan: {
        enabled: true,
        schema: {
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
        },
      },
    },
  }
}

async function main() {
  log(`Mode : ${DRY_RUN ? 'DRY-RUN (aucune modification)' : 'RÉEL'}`)
  log('Vérification clé Vapi...')

  // Test de la clé Vapi
  try {
    await vapiGet('/assistant?limit=1')
    log('✓ Clé Vapi valide')
  } catch (e: any) {
    log(`✗ Clé Vapi invalide : ${e.message}`)
    log('  → Régénère la clé sur dashboard.vapi.ai et mets à jour VAPI_API_KEY dans .env.local')
    process.exit(1)
  }

  // 1. Charger tous les profils provisionnés
  const { data: profiles, error } = await sb
    .from('profiles')
    .select('id, company_name, company_type, assistant_name, assistant_voice, twilio_number, vapi_assistant_id')
    .not('vapi_assistant_id', 'is', null)

  if (error) throw new Error(`Supabase profiles query failed: ${error.message}`)
  if (!profiles?.length) { log('Aucun profil provisionné trouvé.'); return }

  log(`${profiles.length} profil(s) provisionné(s) trouvé(s)`)

  // 2. Trouver les assistant_id partagés
  const countByAssistant = new Map<string, number>()
  for (const p of profiles) {
    if (p.vapi_assistant_id) {
      countByAssistant.set(p.vapi_assistant_id, (countByAssistant.get(p.vapi_assistant_id) ?? 0) + 1)
    }
  }

  const sharedAssistantIds = [...countByAssistant.entries()]
    .filter(([, count]) => count > 1)
    .map(([id]) => id)

  if (sharedAssistantIds.length === 0) {
    log('✓ Aucun assistant partagé — tous les profils ont déjà un assistant dédié.')
    return
  }

  log(`\n${sharedAssistantIds.length} assistant(s) partagé(s) détecté(s) :`)
  for (const aid of sharedAssistantIds) {
    const users = profiles.filter(p => p.vapi_assistant_id === aid)
    log(`  ${aid} → ${users.length} artisans :`)
    for (const u of users) {
      log(`    - ${u.company_name || '(sans nom)'} [${u.id.slice(0, 8)}...] twilio=${u.twilio_number ?? 'AUCUN'}`)
    }
  }

  // 3. Pour chaque assistant partagé, traiter les profils concernés
  for (const sharedId of sharedAssistantIds) {
    const affected = profiles.filter(p => p.vapi_assistant_id === sharedId)

    // Le premier garde l'assistant original, les autres reçoivent un nouveau
    const [keeper, ...others] = affected
    log(`\n  Assistant ${sharedId} :`)
    log(`    → GARDE l'original : ${keeper.company_name} [${keeper.id.slice(0, 8)}...]`)

    for (const profile of others) {
      log(`\n    → TRAITE : ${profile.company_name} [${profile.id.slice(0, 8)}...]`)

      if (DRY_RUN) {
        log(`      [DRY-RUN] Créerait un assistant Vapi dédié pour ${profile.company_name}`)
        if (profile.twilio_number) {
          // Trouver le vapi_phone_number_id dans le pool
          const { data: poolRow } = await sb
            .from('phone_numbers_pool')
            .select('vapi_phone_number_id')
            .eq('phone_number', profile.twilio_number)
            .maybeSingle()
          log(`      [DRY-RUN] PATCHerait le phone-number Vapi ${poolRow?.vapi_phone_number_id ?? '(non trouvé dans le pool)'}`)
        } else {
          log(`      [DRY-RUN] Pas de twilio_number → updaterait seulement profiles.vapi_assistant_id`)
        }
        continue
      }

      // ── MODE RÉEL ──
      let newAssistantId: string | null = null
      try {
        // a. Créer l'assistant dédié
        const body = buildAssistantBody(profile)
        const created = await vapiPost('/assistant', body)
        newAssistantId = created.id
        log(`      ✓ Assistant créé : ${newAssistantId}`)

        // b. Si le profil a un numéro, PATCH le mapping Vapi phone-number
        if (profile.twilio_number) {
          const { data: poolRow } = await sb
            .from('phone_numbers_pool')
            .select('id, vapi_phone_number_id')
            .eq('phone_number', profile.twilio_number)
            .maybeSingle()

          if (poolRow?.vapi_phone_number_id) {
            await vapiPatch(`/phone-number/${poolRow.vapi_phone_number_id}`, { assistantId: newAssistantId })
            log(`      ✓ Phone-number Vapi ${poolRow.vapi_phone_number_id} → assistant ${newAssistantId}`)
          } else {
            // Le numéro n'est pas dans le pool (acheté à l'ancienne via stripe-webhook)
            // Créer un mapping Vapi phone-number from scratch
            await vapiPost('/phone-number', {
              provider: 'twilio',
              number: profile.twilio_number,
              twilioAccountSid: TWILIO_SID,
              twilioAuthToken: TWILIO_TOKEN,
              assistantId: newAssistantId,
              name: `fixlyy-${profile.id.slice(0, 8)}`,
            })
            log(`      ✓ Nouveau mapping Vapi créé pour ${profile.twilio_number}`)
          }
        }

        // c. Mettre à jour le profil en base
        await sb.from('profiles').update({ vapi_assistant_id: newAssistantId }).eq('id', profile.id)
        log(`      ✓ profiles.vapi_assistant_id mis à jour`)

      } catch (e: any) {
        log(`      ✗ ERREUR pour ${profile.company_name} : ${e.message}`)
        if (newAssistantId) {
          log(`      → Rollback : suppression de l'assistant ${newAssistantId}`)
          try { await vapiDelete(`/assistant/${newAssistantId}`) } catch { /* silent */ }
        }
        log(`      → Profil NON modifié en base — à corriger manuellement`)
      }
    }
  }

  log('\n─── Migration terminée ───')
  log('Résumé final :')
  for (const aid of sharedAssistantIds) {
    const remaining = profiles.filter(p => p.vapi_assistant_id === aid)
    log(`  ${aid} → ${remaining.length} profil(s) (devrait être 1 après migration)`)
  }
}

main().catch(e => { console.error('Fatal:', e); process.exit(1) })
