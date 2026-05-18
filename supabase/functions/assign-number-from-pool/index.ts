import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const TWILIO_SID        = Deno.env.get('TWILIO_ACCOUNT_SID')!
const TWILIO_TOKEN      = Deno.env.get('TWILIO_AUTH_TOKEN')!
const VAPI_KEY          = Deno.env.get('VAPI_API_KEY')!
const VAPI_WEBHOOK_SECRET = Deno.env.get('VAPI_WEBHOOK_SECRET') ?? undefined
const SB_URL            = Deno.env.get('SUPABASE_URL')!
const SB_SERVICE        = Deno.env.get('FIXLYY_SERVICE_ROLE_KEY')!

const WEBHOOK_URL = `${SB_URL}/functions/v1/send-call-sms`

const VOICE_IDS: Record<string, string> = {
  'female-warm': 'FFXYdAYPzn8Tw8KiHZqg',
  'female-pro':  'b0Ev8lcOOXx2o9ZcF46H',
  'male-warm':   'FRY6vOtGqwamgAf39SwP',
  'male-pro':    'HuLbOdhRlvQQN8oPP0AJ',
}

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
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

async function createDedicatedAssistant(profile: {
  company_name: string | null
  company_type: string | null
  assistant_name: string | null
  assistant_voice: string | null
  greeting_open: string | null
}): Promise<string> {
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
Collecte naturellement : nom, téléphone, adresse, problème, urgence, disponibilités.
Ne dis JAMAIS "Je dois vous poser quelques questions".

# CLÔTURE
Toujours terminer par : "Je récapitule : vous êtes [Nom], au [Adresse], pour [Problème]. On vous rappelle [délai]. C'est bien ça ?"
Puis : "Merci, à très vite !"

# STRUCTUREDDATA (toujours en français)
customerName, customerPhone, customerAddress, reason, urgency (urgent/non_urgent),
appointmentDate, appointmentTime, smsBody (résumé 1-2 phrases courtes max 80 chars pour l'artisan),
clientTone (calme/stressé/agressif/confus), aiToneUsed (efficace/empathique/rassurante),
conversationQualityScore (0-10), conversationQualityNotes (1 phrase)`,
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
    numFastTurns: 2,
    backgroundDenoisingEnabled: true,
    serverUrl: WEBHOOK_URL,
    ...(VAPI_WEBHOOK_SECRET ? { serverUrlSecret: VAPI_WEBHOOK_SECRET } : {}),
    analysisPlan: {
      summaryPlan: {
        enabled: true,
        prompt: "Rédige un résumé concis en français de cet appel. Indique : (1) la raison, (2) les infos importantes (nom, téléphone, adresse), (3) urgence ou non, (4) prochaine action. Maximum 3 phrases. Toujours en français.",
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
            smsBody:                  { type: 'string', description: 'Résumé 1-2 phrases courtes max 80 chars pour l\'artisan, toujours en français' },
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
  return data.id as string
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  const startMs = Date.now()
  const authHeader = req.headers.get('Authorization')
  if (!authHeader) return new Response('Unauthorized', { status: 401, headers: corsHeaders })

  const { data: { user }, error: authErr } = await createClient(SB_URL, Deno.env.get('SUPABASE_ANON_KEY')!).auth.getUser(authHeader.replace('Bearer ', ''))
  if (authErr || !user) return new Response('Unauthorized', { status: 401, headers: corsHeaders })

  const userId = user.id
  let assignedRow: any = null
  let twilioPatched = false
  let createdAssistantId: string | null = null

  try {
    // 1. Réservation atomique
    const { data: rows, error: reserveErr } = await sb.rpc('assign_phone_number_to_user', { p_user_id: userId })
    if (reserveErr) throw new Error(reserveErr.message)
    assignedRow = rows?.[0]
    if (!assignedRow) throw new Error('no_number_available')

    const { phone_number_id, twilio_sid, phone_number } = assignedRow

    // Si déjà fully assigned, retour immédiat
    if (assignedRow.vapi_phone_number_id) {
      await sb.from('profiles').update({ twilio_number: phone_number }).eq('id', userId)
      await log('success', Date.now() - startMs, { userId }, { phone_number, already_assigned: true })
      return new Response(JSON.stringify({ phone_number }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }

    // 2. Récupérer le profil pour personnaliser l'assistant
    const { data: profileData } = await sb
      .from('profiles')
      .select('company_name, company_type, assistant_name, assistant_voice, greeting_open')
      .eq('id', userId)
      .single()

    // 3. Créer l'assistant Vapi dédié à cet artisan
    createdAssistantId = await createDedicatedAssistant({
      company_name:   profileData?.company_name   ?? null,
      company_type:   profileData?.company_type   ?? null,
      assistant_name: profileData?.assistant_name ?? null,
      assistant_voice: profileData?.assistant_voice ?? null,
      greeting_open:  profileData?.greeting_open  ?? null,
    })

    // 4. PATCH Twilio voiceUrl → Vapi
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

    // 5. Créer le mapping Vapi phone-number → assistant dédié
    const vapiRes = await fetchWithTimeout('https://api.vapi.ai/phone-number', {
      method: 'POST',
      headers: { Authorization: `Bearer ${VAPI_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        provider: 'twilio',
        number: phone_number,
        twilioAccountSid: TWILIO_SID,
        twilioAuthToken: TWILIO_TOKEN,
        assistantId: createdAssistantId,
        name: `fixlyy-${userId.slice(0, 8)}`,
      }),
    })
    if (!vapiRes.ok) throw new Error(`Vapi POST phone-number failed: ${vapiRes.status} ${await vapiRes.text()}`)
    const vapiData = await vapiRes.json()
    const vapiPhoneNumberId = vapiData.id

    // 6. Finalise en base
    await sb.from('phone_numbers_pool').update({
      status: 'assigned',
      assigned_at: new Date().toISOString(),
      vapi_phone_number_id: vapiPhoneNumberId,
    }).eq('id', phone_number_id)

    await sb.from('profiles').update({
      twilio_number: phone_number,
      vapi_assistant_id: createdAssistantId,
    }).eq('id', userId)

    await log('success', Date.now() - startMs, { userId }, {
      phone_number,
      vapi_phone_number_id: vapiPhoneNumberId,
      vapi_assistant_id: createdAssistantId,
    })
    return new Response(JSON.stringify({ phone_number }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })

  } catch (err: any) {
    // Rollback assistant Vapi si créé
    if (createdAssistantId) {
      await deleteVapiAssistant(createdAssistantId)
    }
    // Rollback Twilio voiceUrl si patché
    if (twilioPatched && assignedRow?.twilio_sid) {
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

    await log('error', Date.now() - startMs, { userId }, {}, err.message)
    return new Response(JSON.stringify({ error: err.message }), {
      status: isPoolEmpty ? 503 : 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
