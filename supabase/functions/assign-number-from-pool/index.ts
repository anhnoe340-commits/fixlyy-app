import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { logEvent } from '../_shared/audit.ts'
import { checkRateLimit, getClientIp, TOO_MANY_REQUESTS } from '../_shared/rateLimit.ts'

const TWILIO_SID        = Deno.env.get('TWILIO_ACCOUNT_SID')!
const TWILIO_TOKEN      = Deno.env.get('TWILIO_AUTH_TOKEN')!
const VAPI_KEY          = Deno.env.get('VAPI_API_KEY')!
const VAPI_WEBHOOK_SECRET = Deno.env.get('VAPI_WEBHOOK_SECRET') ?? undefined
const SB_URL            = Deno.env.get('SUPABASE_URL')!
const SB_SERVICE        = Deno.env.get('FIXLYY_SERVICE_ROLE_KEY')!

// ── LiveKit Cloud ─────────────────────────────────────────────────────────────
const LK_URL    = (Deno.env.get('LIVEKIT_CLOUD_URL') ?? '').replace(/^wss?:\/\//, 'https://')
const LK_KEY    = Deno.env.get('LIVEKIT_CLOUD_API_KEY') ?? ''
const LK_SECRET = Deno.env.get('LIVEKIT_CLOUD_API_SECRET') ?? ''

const WEBHOOK_URL = `${SB_URL}/functions/v1/send-call-sms`

const VOICE_IDS: Record<string, string> = {
  'female-warm': 'FFXYdAYPzn8Tw8KiHZqg',
  'female-pro':  'b0Ev8lcOOXx2o9ZcF46H',
  'male-warm':   'FRY6vOtGqwamgAf39SwP',
  'male-pro':    'HuLbOdhRlvQQN8oPP0AJ',
}

const corsHeaders = {
  'Access-Control-Allow-Origin': 'https://app.fixlyy.fr',
  'Access-Control-Allow-Headers': 'authorization, content-type',
}

const sb = createClient(SB_URL, SB_SERVICE)

function fetchWithTimeout(url: string, init: RequestInit, timeoutMs = 10000): Promise<Response> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  return fetch(url, { ...init, signal: controller.signal }).finally(() => clearTimeout(timer))
}

async function log(status: string, durationMs: number, inputMeta: object, outputMeta: object, errorMessage?: string) {
  await sb.from('edge_function_logs').insert({
    function_name: 'assign-number-from-pool',
    status,
    duration_ms: durationMs,
    input_meta: inputMeta,
    output_meta: outputMeta,
    error_message: errorMessage || null,
  })
}

async function rollbackTwilioVoiceUrl(twilioSid: string) {
  try {
    await fetchWithTimeout(
      `https://api.twilio.com/2010-04-01/Accounts/${TWILIO_SID}/IncomingPhoneNumbers/${twilioSid}.json`,
      {
        method: 'POST',
        headers: {
          Authorization: 'Basic ' + btoa(`${TWILIO_SID}:${TWILIO_TOKEN}`),
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({ VoiceUrl: '', VoiceMethod: 'POST' }),
      }
    )
  } catch { /* non-bloquant */ }
}

async function deleteVapiAssistant(assistantId: string) {
  try {
    await fetchWithTimeout(`https://api.vapi.ai/assistant/${assistantId}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${VAPI_KEY}` },
    })
  } catch { /* non-bloquant */ }
}

// ── LiveKit helpers ───────────────────────────────────────────────────────────
async function livekitAdminToken(): Promise<string> {
  const now = Math.floor(Date.now() / 1000)
  const enc = (obj: object) =>
    btoa(JSON.stringify(obj)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '')
  const head    = enc({ alg: 'HS256', typ: 'JWT' })
  const payload = enc({ iss: LK_KEY, sub: 'sip-admin', iat: now, exp: now + 60, nbf: now, sip: { admin: true } })
  const input   = `${head}.${payload}`
  const key     = await crypto.subtle.importKey(
    'raw', new TextEncoder().encode(LK_SECRET),
    { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'],
  )
  const sig    = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(input))
  const sigB64 = btoa(String.fromCharCode(...new Uint8Array(sig)))
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '')
  return `${input}.${sigB64}`
}

async function createLivekitSipTrunk(userId: string, phoneNumber: string): Promise<string> {
  const token = await livekitAdminToken()
  const res = await fetchWithTimeout(
    `${LK_URL}/twirp/livekit.SIP/CreateSIPInboundTrunk`,
    {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        trunk: { name: `artisan-${userId.slice(0, 8)}`, numbers: [phoneNumber] },
      }),
    },
    12000,
  )
  if (!res.ok) throw new Error(`LiveKit CreateSIPInboundTrunk ${res.status}: ${await res.text()}`)
  const data = await res.json()
  const id = data?.trunk?.sipTrunkId ?? data?.trunk?.sip_trunk_id
    ?? data?.sipTrunkId ?? data?.sip_trunk_id
  if (!id) throw new Error(`LiveKit trunk: sip_trunk_id absent dans la réponse: ${JSON.stringify(data)}`)
  return id as string
}

async function createLivekitDispatchRule(userId: string, trunkId: string): Promise<string> {
  const token = await livekitAdminToken()
  const res = await fetchWithTimeout(
    `${LK_URL}/twirp/livekit.SIP/CreateSIPDispatchRule`,
    {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        trunkIds: [trunkId],
        rule: { dispatchRuleDirect: { roomName: `artisan-${userId}`, pin: '' } },
        name: `artisan-${userId.slice(0, 8)}-rule`,
      }),
    },
    12000,
  )
  if (!res.ok) throw new Error(`LiveKit CreateSIPDispatchRule ${res.status}: ${await res.text()}`)
  const data = await res.json()
  const id = data?.rule?.sipDispatchRuleId ?? data?.rule?.sip_dispatch_rule_id
    ?? data?.sipDispatchRuleId ?? data?.sip_dispatch_rule_id
  if (!id) throw new Error(`LiveKit dispatch rule: id absent dans la réponse: ${JSON.stringify(data)}`)
  return id as string
}

async function createDedicatedAssistant(profile: {
  company_name: string | null
  company_type: string | null
  assistant_name: string | null
  assistant_voice: string | null
  greeting_open: string | null
}): Promise<{ id: string; systemPrompt: string }> {
  const assistantName = profile.assistant_name || 'Mia'
  const companyName   = profile.company_name   || 'votre artisan'
  const companyType   = profile.company_type   || 'artisan'
  const voiceKey      = profile.assistant_voice || 'female-warm'
  const voiceId       = VOICE_IDS[voiceKey] ?? VOICE_IDS['female-warm']
  const firstMessage  = profile.greeting_open  || `Allô, ${companyName}, bonjour !`

  const body = {
    name: `${assistantName} — ${companyName}`,
    firstMessage,
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
Pose systématiquement une question sur le contexte : 'Est-ce que vous avez déjà essayé quelque chose ?' ou 'Ça dure depuis quand ?' ou 'Quelqu'un est déjà intervenu ?'. Cette information est aussi importante que l'adresse pour l'artisan.

# CLÔTURE
Toujours terminer par : "Je récapitule : vous êtes [Nom], au [Adresse], pour [Problème]. On vous rappelle [délai]. C'est bien ça ?"
Puis : "Merci, à très vite !"

## RÉSUMÉ DE FIN D'APPEL
À la fin de l'appel, tu remplis le champ fullSummary avec un résumé structuré destiné à l'artisan par SMS.
Ce résumé doit respecter STRICTEMENT le format suivant (4 éléments, toujours en français) :

1. [RAISON] Ce que le client voulait / son problème principal.
2. [CONTEXTE] Ce qu'il a déjà essayé ou ce qui s'est passé avant l'appel (durée du problème, tentatives de réparation, situation actuelle). Si rien n'a été tenté, indiquer "aucune tentative préalable".
3. [INFOS CLÉS] Nom, adresse, téléphone, détail technique critique.
4. [URGENCE + ACTION] URGENT / NORMAL / PEUT ATTENDRE + prochaine étape concrète pour l'artisan.

Règles strictes :
- Toujours en français, jamais d'anglais
- Ton professionnel et factuel (style note de chantier)
- Si une info manque, l'indiquer explicitement ("adresse non communiquée")
- URGENT / NORMAL / PEUT ATTENDRE — un seul parmi ces trois

Exemples :
"Fuite active sous l'évier de cuisine depuis ce matin. Client a changé le joint du siphon seul, sans succès — eau coupée au compteur, sol trempé. Mme Dupont, 12 rue de la Paix Paris 11e, 06 12 34 56 78. URGENT : rappeler immédiatement, intervention dans les 2h."
"Remplacement chaudière gaz en panne intermittente depuis 3 semaines. Client a contacté un autre artisan sans suite — chaudière 15 ans, code erreur E4 récurrent. M. Martin, 45 av Foch Boulogne, 06 98 76 54 32. NORMAL : RDV confirmé jeudi 23 mai à 14h."
"Demande de tarifs pour dépannage serrurerie, porte claquée. Aucune tentative préalable, pas d'urgence immédiate, compare plusieurs artisans. M. Bernard, adresse non communiquée, 07 11 22 33 44. PEUT ATTENDRE : rappeler dans la journée pour qualifier."`,
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
    stopSpeakingPlan: {
      numWords: 2,
      voiceSeconds: 0.3,
      backoffSeconds: 1.0,
    },
    silenceTimeoutSeconds: 30,
    maxDurationSeconds: 600,
    backgroundSound: 'office',
    backchannelingEnabled: true,
    modelOutputInMessagesEnabled: true,
    backgroundDenoisingEnabled: true,
    serverUrl: WEBHOOK_URL,
    ...(VAPI_WEBHOOK_SECRET ? { serverUrlSecret: VAPI_WEBHOOK_SECRET } : {}),
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
            customerAddress:          { type: 'string', description: 'Adresse complète de l\'intervention' },
            reason:                   { type: 'string', description: 'Raison de l\'appel en 1 phrase' },
            urgency:                  { type: 'string', enum: ['urgent', 'non_urgent'] },
            appointmentDate:          { type: 'string', description: 'Date souhaitée si mentionnée' },
            appointmentTime:          { type: 'string', description: 'Heure souhaitée si mentionnée' },
            smsBody:                  { type: 'string', description: "Accroche courte max 80 chars : nature exacte du problème + action immédiate. Toujours en français." },
            fullSummary:              { type: 'string', description: "Résumé complet en 4 éléments, toujours en français : (1) raison/problème principal, (2) contexte — ce qui a déjà été tenté ou durée du problème, (3) nom + adresse + téléphone + détail technique, (4) URGENT/NORMAL/PEUT ATTENDRE + action concrète. Style note de chantier, factuel." },
            clientTone:               { type: 'string', enum: ['calme', 'stressé', 'agressif', 'confus'] },
            aiToneUsed:               { type: 'string', enum: ['efficace', 'empathique', 'rassurante'] },
            conversationQualityScore: { type: 'integer', description: 'Note 0-10' },
            conversationQualityNotes: { type: 'string', description: 'Note en 1 phrase sur la qualité' },
          },
        },
      },
    },
  }

  const res = await fetchWithTimeout('https://api.vapi.ai/assistant', {
    method: 'POST',
    headers: { Authorization: `Bearer ${VAPI_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  }, 15000)

  if (!res.ok) {
    const text = await res.text()
    throw new Error(`Vapi assistant creation failed: ${res.status} ${text}`)
  }
  const data = await res.json()
  const systemPromptContent: string = body.model.messages[0].content
  return { id: data.id as string, systemPrompt: systemPromptContent }
}

async function recordTrialFingerprint(
  userId: string,
  phone: string | null,
  ip: string,
  email: string | null,
): Promise<void> {
  let phoneMatch: any = null
  let ipMatch: any = null

  if (phone) {
    const { data } = await sb
      .from('trial_fingerprints')
      .select('id, user_id, email')
      .eq('phone', phone)
      .neq('user_id', userId)
      .limit(1)
      .maybeSingle()
    phoneMatch = data
  }

  if (ip !== 'unknown') {
    const ninetyDaysAgo = new Date(Date.now() - 90 * 86400000).toISOString()
    const { data } = await sb
      .from('trial_fingerprints')
      .select('id, user_id, email')
      .eq('ip_address', ip)
      .gte('created_at', ninetyDaysAgo)
      .neq('user_id', userId)
      .limit(1)
      .maybeSingle()
    ipMatch = data
  }

  const isSuspicious = !!(phoneMatch || ipMatch)
  const matchType = phoneMatch && ipMatch ? 'both' : phoneMatch ? 'phone' : ipMatch ? 'ip' : null

  await sb.from('trial_fingerprints').upsert({
    user_id: userId,
    phone,
    ip_address: ip,
    email,
    trial_started_at: new Date().toISOString(),
    is_suspicious: isSuspicious,
    suspicious_reason: matchType === 'both'
      ? "Même téléphone et IP qu'un essai précédent"
      : matchType === 'phone'
      ? "Même téléphone qu'un essai précédent"
      : matchType === 'ip'
      ? "Même IP qu'un essai précédent (90j)"
      : null,
  }, { onConflict: 'user_id', ignoreDuplicates: false })

  if (isSuspicious && matchType) {
    const previous = phoneMatch ?? ipMatch
    await sb.from('critical_alerts').insert({
      alert_type: 'trial_abuse_suspected',
      severity: 'warning',
      message: `Possible abus d'essai gratuit — ${matchType === 'both' ? 'Téléphone + IP' : matchType === 'phone' ? 'Même téléphone' : 'Même IP (90j)'}`,
      meta: {
        new_user_id: userId,
        new_email: email,
        new_phone: phone,
        ip_address: ip,
        previous_user_id: previous.user_id,
        previous_email: previous.email,
        match_type: matchType,
        detected_at: new Date().toISOString(),
      },
    })
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  // Rate limiting : 5 req/min par IP (les appels service-role internes sont exemptés)
  const authHeader = req.headers.get('Authorization') ?? ''
  if (authHeader !== `Bearer ${SB_SERVICE}`) {
    const ip = getClientIp(req)
    if (!checkRateLimit(ip, 5, 60000)) return TOO_MANY_REQUESTS(corsHeaders)
  }

  const startMs = Date.now()
  let userId: string

  if (authHeader === `Bearer ${SB_SERVICE}`) {
    const body = await req.json().catch(() => ({}))
    userId = body?.user_id
    if (!userId) return new Response(JSON.stringify({ error: 'Missing user_id' }), { status: 400, headers: corsHeaders })
  } else {
    try {
      const { data: { user }, error: authErr } = await createClient(SB_URL, Deno.env.get('SUPABASE_ANON_KEY')!).auth.getUser(authHeader.replace('Bearer ', ''))
      if (authErr || !user) {
        await sb.from('audit_log').insert({
          event_type: 'auth_failure',
          user_id: null,
          metadata: { ip: getClientIp(req), endpoint: 'assign-number-from-pool' },
          severity: 'warning',
        }).catch(() => {})
        return new Response('Unauthorized', { status: 401, headers: corsHeaders })
      }
      userId = user.id
    } catch {
      return new Response('Unauthorized', { status: 401, headers: corsHeaders })
    }
  }

  let assignedRow: any = null
  let twilioPatched = false
  let twilioAlreadyConfigured = false
  let createdAssistantId: string | null = null
  let createdSystemPrompt: string | null = null
  let assistantIdToUse: string | null = null

  try {
    // 1. Réservation atomique
    const { data: rows, error: reserveErr } = await sb.rpc('assign_phone_number_to_user', { p_user_id: userId })
    if (reserveErr) throw new Error(reserveErr.message)
    assignedRow = rows?.[0]
    if (!assignedRow) throw new Error('no_number_available')

    const { phone_number_id, twilio_sid, phone_number } = assignedRow

    // 2. Récupérer le profil pour personnaliser l'assistant
    const { data: profileData } = await sb
      .from('profiles')
      .select('company_name, company_type, assistant_name, assistant_voice, greeting_open, vapi_assistant_id, phone, livekit_trunk_id')
      .eq('id', userId)
      .single()

    // 2b. Fingerprinting anti-abus (non-bloquant)
    try {
      const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
        || req.headers.get('x-real-ip')
        || 'unknown'
      const { data: { user: authUser } } = await sb.auth.admin.getUserById(userId)
      const email = authUser?.email ?? null
      const phone = profileData?.phone ?? null
      await recordTrialFingerprint(userId, phone, ip, email)
    } catch (fpErr) {
      console.warn('[assign-number-from-pool] fingerprint non-bloquant:', fpErr)
    }

    // 3. Assistant Vapi — réutilise l'existant ou en crée un nouveau
    const existingAssistantId = profileData?.vapi_assistant_id ?? null
    if (existingAssistantId) {
      assistantIdToUse = existingAssistantId
    } else {
      const created = await createDedicatedAssistant({
        company_name:   profileData?.company_name   ?? null,
        company_type:   profileData?.company_type   ?? null,
        assistant_name: profileData?.assistant_name ?? null,
        assistant_voice: profileData?.assistant_voice ?? null,
        greeting_open:  profileData?.greeting_open  ?? null,
      })
      createdAssistantId  = created.id
      createdSystemPrompt = created.systemPrompt
      assistantIdToUse    = created.id
    }

    // 4. PATCH Twilio voiceUrl → Vapi
    twilioAlreadyConfigured = !!assignedRow.vapi_phone_number_id
    const twilioRes = await fetchWithTimeout(
      `https://api.twilio.com/2010-04-01/Accounts/${TWILIO_SID}/IncomingPhoneNumbers/${twilio_sid}.json`,
      {
        method: 'POST',
        headers: {
          Authorization: 'Basic ' + btoa(`${TWILIO_SID}:${TWILIO_TOKEN}`),
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({
          VoiceUrl: 'https://api.vapi.ai/call/phone',
          VoiceMethod: 'POST',
        }),
      }
    )
    if (!twilioRes.ok) throw new Error(`Twilio PATCH failed: ${twilioRes.status}`)
    twilioPatched = true

    // 5. Mapping Vapi phone-number → assistant (PATCH si existant, POST sinon)
    let vapiPhoneNumberId: string
    if (assignedRow.vapi_phone_number_id) {
      const vapiRes = await fetchWithTimeout(`https://api.vapi.ai/phone-number/${assignedRow.vapi_phone_number_id}`, {
        method: 'PATCH',
        headers: { Authorization: `Bearer ${VAPI_KEY}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          assistantId: assistantIdToUse,
          twilioAccountSid: TWILIO_SID,
          twilioAuthToken: TWILIO_TOKEN,
        }),
      })
      if (!vapiRes.ok) throw new Error(`Vapi PATCH phone-number failed: ${vapiRes.status} ${await vapiRes.text()}`)
      vapiPhoneNumberId = assignedRow.vapi_phone_number_id
    } else {
      const vapiRes = await fetchWithTimeout('https://api.vapi.ai/phone-number', {
        method: 'POST',
        headers: { Authorization: `Bearer ${VAPI_KEY}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          provider: 'twilio',
          number: phone_number,
          twilioAccountSid: TWILIO_SID,
          twilioAuthToken: TWILIO_TOKEN,
          assistantId: assistantIdToUse,
          name: `fixlyy-${userId.slice(0, 8)}`,
        }),
      })
      if (!vapiRes.ok) throw new Error(`Vapi POST phone-number failed: ${vapiRes.status} ${await vapiRes.text()}`)
      const vapiData = await vapiRes.json()
      vapiPhoneNumberId = vapiData.id
    }

    // 6. Finalise en base
    await sb.from('phone_numbers_pool').update({
      status: 'assigned',
      assigned_at: new Date().toISOString(),
      vapi_phone_number_id: vapiPhoneNumberId,
    }).eq('id', phone_number_id)

    await sb.from('profiles').update({
      twilio_number: phone_number,
      vapi_assistant_id: assistantIdToUse,
      provisioning_status: 'done',
      ...(createdSystemPrompt ? { vapi_system_prompt: createdSystemPrompt } : {}),
    }).eq('id', userId)

    await log('success', Date.now() - startMs, { userId }, {
      phone_number,
      vapi_phone_number_id: vapiPhoneNumberId,
      vapi_assistant_id: assistantIdToUse,
    })
    await logEvent({ supabase: sb, eventType: 'number_assigned',
      userId, resourceType: 'phone_number', resourceId: phone_number,
      metadata: { vapi_assistant_id: assistantIdToUse }, severity: 'info' })

    // 7. LiveKit SIP trunk + dispatch rule (non-bloquant — infrastructure pour migration Vapi→LiveKit)
    if (LK_KEY && LK_SECRET && !profileData?.livekit_trunk_id) {
      try {
        const trunkId       = await createLivekitSipTrunk(userId, phone_number)
        const dispatchRuleId = await createLivekitDispatchRule(userId, trunkId)
        await sb.from('profiles').update({
          livekit_trunk_id:          trunkId,
          livekit_dispatch_rule_id:  dispatchRuleId,
        }).eq('id', userId)
        await logEvent({ supabase: sb, eventType: 'livekit_sip_trunk_created',
          userId, resourceType: 'livekit_trunk', resourceId: trunkId,
          metadata: { phone_number, dispatch_rule_id: dispatchRuleId }, severity: 'info' })
        console.log(`[LiveKit] trunk=${trunkId} rule=${dispatchRuleId} OK`)
      } catch (lkErr: any) {
        console.error('[LiveKit] setup non-bloquant échoué:', lkErr.message)
        await logEvent({ supabase: sb, eventType: 'livekit_sip_trunk_failed',
          userId, resourceType: 'livekit_trunk', resourceId: null,
          metadata: { error: lkErr.message, phone_number }, severity: 'warning' })
      }
    }

    return new Response(JSON.stringify({ phone_number }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })

  } catch (err: any) {
    // Rollback assistant Vapi si créé
    if (createdAssistantId) {
      await deleteVapiAssistant(createdAssistantId)
    }
    // Rollback Twilio voiceUrl si patché (seulement pour un nouveau provisioning)
    if (twilioPatched && !twilioAlreadyConfigured && assignedRow?.twilio_sid) {
      await rollbackTwilioVoiceUrl(assignedRow.twilio_sid)
    }
    // Rollback pool si non finalisé
    if (assignedRow?.phone_number_id && !assignedRow?.vapi_phone_number_id) {
      await sb.from('phone_numbers_pool').update({
        status: 'available',
        reserved_at: null,
        assigned_to_user_id: null,
      }).eq('id', assignedRow.phone_number_id)
    }

    const isPoolEmpty = err.message === 'no_number_available'
    if (isPoolEmpty) {
      await sb.from('critical_alerts').insert({
        alert_type: 'pool_empty',
        severity: 'critical',
        message: `Pool vide lors d'une tentative d'assignation pour user ${userId}`,
        meta: { user_id: userId },
      })
    }

    await sb.from('profiles').update({ provisioning_status: 'failed' }).eq('id', userId)
    await log('error', Date.now() - startMs, { userId }, {}, err.message)
    await logEvent({ supabase: sb, eventType: 'number_assignment_failed',
      userId, resourceType: 'phone_number', resourceId: null,
      metadata: { error: err.message }, severity: 'warning' })
    const publicError = isPoolEmpty ? 'service_unavailable' : 'internal_server_error'
    return new Response(JSON.stringify({ error: publicError }), {
      status: isPoolEmpty ? 503 : 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
