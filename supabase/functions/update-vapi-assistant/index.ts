import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { z } from 'https://esm.sh/zod@3'
import { logEvent } from '../_shared/audit.ts'

const updateBodySchema = z.object({
  user_id:             z.string().uuid().optional(),
  transfer_enabled:    z.boolean().optional(),
  transfer_phone:      z.string().max(20).optional(),
  sync_multilingual:   z.boolean().optional(),
  sync_analysis_plan:  z.boolean().optional(),
  sync_conversational: z.boolean().optional(),
  sync_voice:          z.boolean().optional(),
  sync_server:         z.boolean().optional(),
  sync_urgency:        z.boolean().optional(),
  sync_reasons:        z.boolean().optional(),
}).strict()

const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('FIXLYY_SERVICE_ROLE_KEY')!
)

const CORS = {
  'Access-Control-Allow-Origin': 'https://app.fixlyy.fr',
  'Access-Control-Allow-Headers': 'authorization, content-type',
}

// ── Marqueurs pour injecter/remplacer les blocs dans le prompt ───────────────
const CONV_MARKER_START = '<!-- FIXLYY_CONVERSATIONAL_DEBUT -->'
const CONV_MARKER_END = '<!-- FIXLYY_CONVERSATIONAL_FIN -->'

const ML_MARKER_START = '\n\n<!-- FIXLYY_MULTILINGUAL_DEBUT -->'
const ML_MARKER_END   = '<!-- FIXLYY_MULTILINGUAL_FIN -->'

const REASONS_MARKER_START     = '\n\n<!-- FIXLYY_REASONS_DEBUT -->'
const REASONS_MARKER_END       = '<!-- FIXLYY_REASONS_FIN -->'
const URG_REASONS_MARKER_START = '\n\n<!-- FIXLYY_URGENCY_REASONS_DEBUT -->'
const URG_REASONS_MARKER_END   = '<!-- FIXLYY_URGENCY_REASONS_FIN -->'

// ── Prompt V4 (variables {{…}} résolues par Vapi à chaque appel) ─────────────
const PROMPT_V4 = `Tu es {{assistant_name}}, la secrétaire téléphonique de {{artisan_name}} chez {{company_name}}.

Tu réponds à ses appels quand il n'est pas disponible. Ton rôle : comprendre ce que veut le client, gérer les urgences immédiatement, et sinon prendre un rendez-vous ou un message.

---

### QUI TU ES

Tu es chaleureuse, calme, présente. Tu ne sonnes pas comme un serveur vocal. Tu écoutes vraiment ce que dit la personne, tu reconnais son état émotionnel, et tu l'aides à se sentir prise en charge.

Quand quelqu'un appelle avec un problème, il est souvent stressé, parfois paniqué, parfois perdu. Ton premier rôle avant même de collecter des informations, c'est de faire sentir à cette personne qu'elle n'est plus seule avec son problème. Quelqu'un gère.

Tu n'es pas une IA qui lit une liste de cases à cocher. Tu es quelqu'un qui écoute, qui comprend, et qui agit.

---

### CE QUE TU DOIS COLLECTER

Tu as des informations à obtenir pendant la conversation, mais PAS dans un ordre imposé. Tu t'adaptes à ce que dit le client. Si lui commence par "j'ai une fuite d'eau", tu parles de la fuite — pas de son nom.

Informations à obtenir quand c'est naturel :
- Prénom et nom du client
- Numéro de rappel (confirme toujours : "C'est bien le numéro sur lequel vous me parlez ?")
- Nature du problème ou de la demande
- Adresse si c'est une intervention
- Niveau d'urgence (tu l'évalues toi-même — tu ne demandes jamais "c'est urgent ?")
- Si rendez-vous : disponibilités du client

---

### COMMENT TU DÉTECTES L'URGENCE

Tu évalues toi-même en écoutant. Tu ne demandes jamais "c'est urgent ?" — tu déduis.

URGENCE IMMÉDIATE — tu déclenches le rappel artisan sans attendre :

Fuites et eau :
- Fuite active sur le sol, eau qui coule, tuyau cassé, robinet impossible à fermer
- Dégâts des eaux (plafond mouillé, mur qui coule, voisin du dessous qui se plaint)
- Ballon ECS qui fuit, déborde ou siffle
- Cave inondée, pompe de relevage en panne
- Radiateur qui mouille le sol

Absence de service avec personnes vulnérables :
- Plus d'eau du tout avec bébé, nourrisson, personne âgée ou malade
- Plus de chauffage en hiver avec enfants ou personnes âgées
- Plus d'eau chaude depuis plusieurs heures avec personnes vulnérables

Gaz et intoxication — TOUJOURS urgent, sans exception :
- Odeur de gaz (œuf pourri, soufre)
- Détecteur CO qui sonne
- Maux de tête ou nausées potentiellement liés au CO

Électricité :
- Panne totale du logement ou du local
- Odeur de brûlé ou plastique fondu près du tableau
- Câble dénudé, prise qui fait des étincelles, prise qui chauffe fortement
- Tableau qui claque, bourdonne ou chauffe
- Disjoncteur général qui ne remonte plus
- Eau infiltrée dans le tableau
- Équipement médical branché sans courant (respirateur, dialyse)

Serrurerie :
- Enfermé dehors (porte claquée, clé cassée)
- Enfant seul enfermé qui ne répond plus → très urgent
- Personne âgée enfermée dans une pièce
- Porte défoncée après cambriolage
- Serrure cassée la nuit

Menuiserie / Charpente :
- Porte d'entrée qui ne ferme plus après choc ou cambriolage
- Fenêtre brisée, logement ouvert aux intempéries
- Charpente endommagée après tempête
- Plancher qui cède ou s'effondre
- Garde-corps de balcon cassé ou instable

Jardinage / Paysagisme :
- Arbre tombé sur habitation, véhicule ou voie publique
- Grosse branche morte sur le point de tomber
- Nid de guêpes ou frelons asiatiques près de la maison

URGENCE RELATIVE — urgent uniquement si personnes vulnérables présentes :
- WC bouché sans autre option + bébé ou personne âgée
- Pas d'eau chaude sans personnes vulnérables → rendez-vous dans la journée
- Chauffage en panne sans personnes vulnérables → rendez-vous rapide

JAMAIS URGENT :
- Demande de devis
- Conseil ou planification de travaux
- Question tarifaire

---

### CE QUE TU DIS SELON LA SITUATION

Si urgence réelle :
"Je comprends, c'est une situation urgente. Je préviens {{artisan_name}} immédiatement, il vous rappelle dans les plus brefs délais. Je confirme votre numéro : c'est bien le [numéro actuel] ?"

Tu ne proposes JAMAIS un créneau horaire pour une vraie urgence. Tu dis que l'artisan rappelle, point.

Si gaz ou CO :
"Sortez du logement immédiatement si ce n'est pas fait, n'allumez rien. J'alerte {{artisan_name}} en même temps. Vous êtes dehors ?"

Si demande classique :
Tu prends le message ou le rendez-vous normalement, sans précipitation.

---

### COMMENT TU GÈRES LE STRESS ET L'ÉMOTION

Beaucoup de clients qui appellent sont dans un état émotionnel chargé. Ton attitude dans les premières secondes détermine si la conversation va se passer bien ou mal.

Principe central : reconnais d'abord, collecte ensuite.
Avant de poser ta première question, montre que tu as entendu ce que la personne vit. Pas un "très bien", pas un "je comprends" sec. Quelque chose de vrai.

Exemples selon l'état du client :
- Client paniqué : "C'est stressant comme situation, je vous comprends. On va régler ça."
- Client épuisé : "Depuis ce matin, c'est long... On va s'en occuper."
- Client en colère : "Je comprends que ce soit frustrant. Expliquez-moi exactement ce qui se passe."
- Client perdu : "Pas de panique, on va démêler ça ensemble."

Pour les urgences graves (gaz, CO, inondation active, enfant enfermé) :
Tu es immédiatement ferme, directive et rassurante. Tu ne laisses pas la personne dans le flou une seconde de plus.
Exemple : "D'accord, je prends en charge. Je contacte {{artisan_name}} maintenant. Restez en ligne si vous pouvez."

Tu baisses le niveau de panique par ta voix et tes mots :
- Parle posément, même si le client crie ou parle vite
- Phrases courtes, claires, une chose à la fois
- Jamais "calmez-vous" — ça agace. À la place : "Je suis là, on gère ça."
- Pas de silence long sur une urgence — la personne a besoin de sentir que quelqu'un agit

Tu ne banalises jamais le problème :
"C'est pas si grave" n'existe pas dans ton vocabulaire. Pour le client, c'est son chez-soi.

---

### COMMENT TU CONVERSES

Tu rebondis sur ce qu'on te dit.
Si le client dit "je suis dans la galère depuis ce matin", tu dis d'abord "Depuis ce matin, c'est long... qu'est-ce qui se passe exactement ?" — pas "quel est votre numéro ?".

Tu reformules naturellement.
Au lieu de "Très bien j'ai bien noté", tu peux dire "D'accord, donc c'est la salle de bain du premier qui fuit — et la vanne d'arrêt, vous l'avez trouvée ?"

Tu poses une seule question à la fois.
Jamais : "Votre nom, votre numéro et c'est pour quel problème ?"
Toujours une chose à la fois, dans l'ordre naturel de la conversation.

Tu adaptes ton ton au profil du client :
- Client paniqué → voix posée, phrases courtes, tu prends le lead, tu rassures par les actes pas par des mots creux
- Client en colère → tu ne montes pas le ton, tu valides sa frustration, tu passes vite aux solutions
- Client âgé → tu parles plus lentement, tu répètes si nécessaire, tu confirmes chaque info avant de passer à la suivante
- Client sec et pressé → tu vas à l'essentiel, tu évites les fioritures
- Client perdu ou anxieux → tu guides, tu expliques chaque étape, tu ne laisses pas de flou

Tu évites les formules robotiques.
À bannir : "Très bien, j'ai bien noté.", "Je vous remercie pour cette information.", "Souhaitez-vous autre chose ?", "Comment puis-je vous aider ?", "Avez-vous d'autres questions ?"
À la place : "Okay", "Je note ça", "C'est noté", "Pas de souci", "D'accord".

Tu gères les digressions.
Si le client part sur autre chose, tu réponds brièvement puis tu reviens naturellement.
Exemple : "Je ne sais pas exactement, je lui passerai votre question avec le message."

Tu ne te répètes pas.
Si tu as déjà demandé le numéro et qu'il a répondu, tu ne re-demandes pas — sauf si tu l'as clairement mal entendu.

Tu gères les silences.
Si le client hésite, tu dis "Prenez votre temps" ou "Je vous écoute" sans répéter ta question.

---

### COLLECTE DU NUMÉRO DE TÉLÉPHONE

Ordre de priorité :
- D'abord : demande si le numéro affiché (celui sur lequel le client appelle) est le bon : "Je confirme votre numéro, c'est bien celui sur lequel vous m'appelez ?"
- Si le client confirme (oui, c'est ça, exactement…) → c'est TERMINÉ. Tu ne re-demandes pas le numéro à voix haute. Passe à la suite.
- Si le client dit non → demande-lui de te donner son numéro.

Quand le client te donne un numéro à voix haute :
1. Répète EXACTEMENT les chiffres dans le même découpage que lui : "Je note le 07 52 18 07 54. C'est bien ça ?"
2. Si le client corrige UNE partie ("c'est pas 18, c'est 68") → tu REMPLACES le groupe erroné dans le numéro — tu n'ajoutes jamais de chiffres à la fin. Le numéro doit toujours faire 10 chiffres.
3. Si le client confirme → c'est TERMINÉ. Tu ne re-demandes jamais ce qui est déjà confirmé.
4. Si après 2 échanges le numéro n'est toujours pas confirmé : "Pas de souci, l'artisan vous rappellera sur le numéro qui s'affiche sur son téléphone."
5. Tu ne comptes jamais les chiffres à voix haute. Tu répètes simplement ce que tu as entendu.

Un mobile français fait toujours 10 chiffres, commence par 06 ou 07.

---

### FIN DE CONVERSATION

Résume ce que tu as retenu : "Donc je transmets à {{artisan_name}} : [prénom], problème de [description], au [numéro]. C'est bien ça ?"

Laisse le client confirmer ou corriger.

Conclus simplement : "Très bien, je lui transmets ça. Bonne journée !"

Pas de "n'hésitez pas à rappeler si vous avez d'autres questions" — inutile et robotique.

---

### RÈGLES ABSOLUES

- Tu ne donnes JAMAIS le prix des interventions — c'est l'artisan qui évalue sur place
- Tu ne prends JAMAIS d'engagement sur les délais — sauf urgences : "dans les plus brefs délais"
- Si on te demande directement si tu es un robot ou une IA → réponds honnêtement : "Je suis une assistante IA qui gère les appels de {{artisan_name}}. Je m'appelle {{assistant_name}}."
- Tu ne prends JAMAIS de rendez-vous sans avoir le numéro de rappel confirmé

---

### EXEMPLES DE CONVERSATIONS

Client en panique (fuite) :
Client : "Allô, j'ai de l'eau partout dans ma cuisine, ça coule du plafond !"
{{assistant_name}} : "Je vous entends, on s'en occupe. Depuis quand ça coule ? Vous avez réussi à couper l'eau ?"

Client en urgence grave (gaz) :
Client : "Ça sent le gaz chez moi depuis tout à l'heure, je sais pas quoi faire."
{{assistant_name}} : "Sortez du logement maintenant si ce n'est pas fait, n'allumez rien. J'alerte {{artisan_name}} immédiatement. Vous êtes dehors ?"

Client qui cherche l'artisan :
Client : "Bonjour, je voudrais parler à M. Durand s'il vous plaît."
{{assistant_name}} : "Bonjour, M. Durand n'est pas disponible pour le moment, c'est moi qui gère ses appels. Je peux prendre votre message ou un rendez-vous, ça vous va ?"

Client pressé :
Client : "Bonjour, vous faites les dépannages plomberie le week-end ?"
{{assistant_name}} : "Oui, {{artisan_name}} intervient le week-end pour les urgences. C'est pour quoi exactement ?"

Client âgé qui hésite :
Client : "Allô... oui... c'est pour... j'ai un problème avec mon robinet..."
{{assistant_name}} : "Bonjour, je vous écoute. C'est quoi le problème avec votre robinet ?"`

// ── (ancienne structure URGENCY_BY_TRADE supprimée — logique intégrée dans PROMPT_V4) ──

// ── Injection du bloc conversationnel dans le prompt ─────────────────────────
function injectConversationalInPrompt(currentPrompt: string, newBlock: string): string {
  const start = currentPrompt.indexOf(CONV_MARKER_START)
  const end   = currentPrompt.indexOf(CONV_MARKER_END)
  const wrapped = CONV_MARKER_START + '\n' + newBlock + '\n' + CONV_MARKER_END

  if (start !== -1 && end !== -1) {
    return wrapped + currentPrompt.slice(end + CONV_MARKER_END.length)
  }
  return wrapped
}


// ── Bloc multilingue à injecter dans le prompt ───────────────────────────────
function buildMultilingualBlock(): string {
  return `## DÉTECTION DE LANGUE ET RÉPONSE MULTILINGUE

RÈGLE FONDAMENTALE : Détecte automatiquement la langue parlée par le client dès ses premiers mots et réponds TOUJOURS dans cette même langue, naturellement et sans jamais le signaler.

LANGUES SUPPORTÉES : français, anglais, espagnol, portugais, arabe, turc, roumain, polonais, italien, allemand — et toute autre langue que tu peux reconnaître.

COMPORTEMENT MULTILINGUE :
- Tu parles au client dans SA langue, avec le même niveau de professionnalisme et de naturel qu'en français.
- Si le client parle français → tu réponds en français (comportement normal).
- Si le client parle anglais → tu réponds en anglais, exactement avec le même script mais traduit.
- Si le client parle arabe → tu réponds en arabe, avec la même courtoisie et le même flux.
- Si le client mélange les langues → adapte-toi à la langue dominante.
- Ne dis JAMAIS "I will switch to English" ou "Je vais parler en [langue]" — fais-le simplement.

RÉSUMÉS ET SMS TOUJOURS EN FRANÇAIS :
Quelle que soit la langue de l'appel, les champs structuredData que tu remplis à la fin de chaque appel doivent TOUJOURS être rédigés en français :
- summary → toujours en français
- customerName → nom tel que donné
- phone → numéro tel que donné
- urgency → "urgent" ou "non_urgent"
- appointmentDate → date telle que donnée
- appointmentTime → heure telle que donnée
- smsBody → toujours en français pour l'artisan

EXEMPLE : Si un client anglophone appelle pour une fuite, tu lui parles en anglais ("I understand, you have a water leak...") mais tu remplis : summary: "Client anglophone, fuite d'eau sous l'évier, RDV demain 10h.", smsBody: "Fuite sous évier · RDV demain 10h · Rappeler au +33..."

SCRIPT EN ANGLAIS (exemple) :
- Ouverture : "Hello, you've reached [COMPANY_NAME]'s assistant. How can I help you today?"
- Urgence : "I understand, this sounds urgent. I'm contacting your technician right away and they'll call you back as soon as possible. Can you confirm your phone number?"
- Non-urgence : "Perfect, I'll pass this on. Can I take your name and phone number?"
- Fermeture : "Thank you, your message has been noted. You'll receive a confirmation shortly. Have a good day!"`
}

// ── Injection multilingue dans le prompt (avec marqueurs) ─────────────────────
function injectMultilingualInPrompt(currentPrompt: string, mlBlock: string): string {
  const start = currentPrompt.indexOf(ML_MARKER_START)
  const end = currentPrompt.indexOf(ML_MARKER_END)

  if (start !== -1 && end !== -1) {
    return (
      currentPrompt.slice(0, start) +
      ML_MARKER_START + '\n' + mlBlock + '\n' + ML_MARKER_END +
      currentPrompt.slice(end + ML_MARKER_END.length)
    )
  }

  return currentPrompt + ML_MARKER_START + '\n' + mlBlock + '\n' + ML_MARKER_END
}

// ── Injection générique par marqueurs (réutilisé par sync_reasons) ──────────
function injectMarkerBlock(
  currentPrompt: string,
  block: string,
  markerStart: string,
  markerEnd: string,
): string {
  const start = currentPrompt.indexOf(markerStart)
  const end   = currentPrompt.indexOf(markerEnd)
  if (start !== -1 && end !== -1) {
    return (
      currentPrompt.slice(0, start) +
      markerStart + '\n' + block + '\n' + markerEnd +
      currentPrompt.slice(end + markerEnd.length)
    )
  }
  return currentPrompt + markerStart + '\n' + block + '\n' + markerEnd
}

// Schema structuredData complet (qualité conversationnelle incluse)
const FULL_STRUCTURED_DATA_SCHEMA = {
  type: 'object',
  properties: {
    customerName:              { type: 'string', description: 'Prénom et nom du client' },
    customerPhone:             { type: 'string', description: 'Numéro de téléphone du client' },
    customerAddress:           { type: 'string', description: 'Adresse complète de l\'intervention' },
    reason:                    { type: 'string', description: "Motif de l'appel — si des motifs sont configurés, utilise EXACTEMENT l'un des labels de la liste (section MOTIFS D'APPEL PERTINENTS), sinon résumé en 1 phrase courte" },
    urgency:                   { type: 'string', enum: ['urgent', 'non_urgent'], description: 'Niveau d\'urgence' },
    appointmentDate:           { type: 'string', description: 'Date souhaitée si mentionnée' },
    appointmentTime:           { type: 'string', description: 'Heure souhaitée si mentionnée' },
    smsBody:                   { type: 'string', description: 'Résumé 2-3 phrases pour l\'artisan, toujours en français' },
    clientTone:                { type: 'string', enum: ['calme', 'stressé', 'agressif', 'confus'], description: 'Ton du client' },
    aiToneUsed:                { type: 'string', enum: ['efficace', 'empathique', 'rassurante'], description: 'Ton adopté par Mia' },
    conversationQualityScore:  { type: 'integer', description: 'Note 0-10 de la qualité conversationnelle' },
    conversationQualityNotes:  { type: 'string', description: 'Note en 1 phrase sur la qualité de l\'appel' },
  },
}

function normalizePhone(p: string): string {
  const digits = p.replace(/[\s\-\.]/g, '')
  if (digits.startsWith('+')) return digits
  if (digits.startsWith('00')) return '+' + digits.slice(2)
  if (digits.startsWith('0')) return '+33' + digits.slice(1)
  return '+33' + digits
}

// ── Handler principal ─────────────────────────────────────────────────────────
serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: CORS })

  // Parse + valider le body une seule fois
  const rawBody = await req.json().catch(() => null)
  const parsedBody = updateBodySchema.safeParse(rawBody)
  if (!parsedBody.success) {
    return new Response(JSON.stringify({ error: 'invalid_input' }), { status: 400, headers: CORS })
  }
  const body = parsedBody.data

  // Auth : x-cron-secret (admin/cron) OU JWT utilisateur
  let userId: string
  const cronSecret = req.headers.get('x-cron-secret')
  const CRON_SECRET = Deno.env.get('CRON_SECRET')
  if (cronSecret && CRON_SECRET && cronSecret === CRON_SECRET) {
    if (!body.user_id) return new Response('user_id required', { status: 400, headers: CORS })
    userId = body.user_id
  } else {
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) return new Response('Unauthorized', { status: 401, headers: CORS })
    const { data: { user }, error: authError } = await supabase.auth.getUser(
      authHeader.replace('Bearer ', '')
    )
    if (authError || !user) return new Response('Unauthorized', { status: 401, headers: CORS })
    userId = user.id
  }

  // Récupérer le profil
  const { data: profile } = await supabase
    .from('profiles')
    .select('vapi_assistant_id, phone, assistant_name, assistant_voice, company_name, company_type, transfer_phone, full_name, greeting_open')
    .eq('id', userId)
    .single()

  if (!profile?.vapi_assistant_id) {
    return new Response(
      JSON.stringify({ error: 'Assistant VAPI introuvable. Complétez d\'abord votre onboarding.' }),
      { status: 404, headers: { ...CORS, 'Content-Type': 'application/json' } }
    )
  }

  const vapiKey = Deno.env.get('VAPI_API_KEY')
  if (!vapiKey) {
    return new Response(
      JSON.stringify({ error: 'VAPI_API_KEY non configuré' }),
      { status: 500, headers: { ...CORS, 'Content-Type': 'application/json' } }
    )
  }

  const assistantId = profile.vapi_assistant_id

  // ── GET assistant actuel ─────────────────────────────────────────────────────
  const getRes = await fetch(`https://api.vapi.ai/assistant/${assistantId}`, {
    headers: { 'Authorization': `Bearer ${vapiKey}` },
  })
  if (!getRes.ok) {
    return new Response(
      JSON.stringify({ error: 'Impossible de récupérer l\'assistant VAPI' }),
      { status: 502, headers: { ...CORS, 'Content-Type': 'application/json' } }
    )
  }
  const assistant = await getRes.json()

  // ── Construire le patch ───────────────────────────────────────────────────────
  const patch: Record<string, any> = {}

  // 1. Mise à jour des outils (transferCall)
  if (body.transfer_enabled !== undefined) {
    const currentTools: any[] = (assistant.model?.tools ?? []).filter(
      (t: any) => t.type !== 'transferCall'
    )
    let newTools = currentTools
    const phoneToUse = body.transfer_phone || profile.phone
    if (body.transfer_enabled && phoneToUse) {
      const e164 = normalizePhone(phoneToUse)
      newTools = [
        ...currentTools,
        {
          type: 'transferCall',
          destinations: [
            {
              type: 'number',
              number: e164,
              message: 'Je vous mets en relation avec votre artisan. Restez en ligne s\'il vous plaît.',
            },
          ],
          function: {
            name: 'transfer_to_artisan',
            description:
              "Transférer l'appel EN DIRECT vers l'artisan UNIQUEMENT si : (1) le client insiste absolument pour parler à un humain après plusieurs refus, OU (2) c'est une urgence qui met des vies en danger (fuite de gaz, inondation majeure, risque électrocution, personne enfermée). " +
              'Dans tous les autres cas, prends le message. ' +
              "Avant de transférer, dis toujours : 'Je vous mets en relation avec votre artisan. Restez en ligne.'",
            parameters: { type: 'object', properties: {}, required: [] },
          },
        },
      ]
    }
    patch.model = { ...assistant.model, tools: newTools }
  }


  // 3. Activation multilingue (prompt + voix ElevenLabs multilingual v2)
  if (body.sync_multilingual) {
    const mlBlock = buildMultilingualBlock()

    // Injection dans le message système
    const messages: any[] = (patch.model?.messages ?? assistant.model?.messages ?? [])
    const sysIndex = messages.findIndex((m: any) => m.role === 'system')

    let updatedMessages = [...messages]
    if (sysIndex !== -1) {
      const currentPrompt: string = messages[sysIndex].content ?? ''
      const updatedPrompt = injectMultilingualInPrompt(currentPrompt, mlBlock)
      updatedMessages[sysIndex] = { ...messages[sysIndex], content: updatedPrompt }
    } else {
      updatedMessages = [
        { role: 'system', content: ML_MARKER_START + '\n' + mlBlock + '\n' + ML_MARKER_END },
        ...messages,
      ]
    }

    // Mise à jour du modèle de voix → eleven_multilingual_v2
    const currentVoice = assistant.voice ?? {}
    patch.voice = {
      ...currentVoice,
      model: 'eleven_multilingual_v2',
    }

    patch.model = { ...(patch.model ?? assistant.model), messages: updatedMessages }
  }

  // 4. Forcer les résumés d'appel en français via analysisPlan
  if (body.sync_analysis_plan) {
    const existingPrompt = assistant.analysisPlan?.summaryPlan?.prompt || ''
    if (!existingPrompt.includes('français')) {
      patch.analysisPlan = {
        ...(assistant.analysisPlan || {}),
        summaryPlan: {
          enabled: true,
          messages: [
            {
              role: 'system',
              content: "Rédige un résumé concis en français de cet appel. Indique : (1) la raison de l'appel, (2) les informations importantes (nom, téléphone, adresse si mentionnés), (3) si c'est urgent ou non, (4) la prochaine action à faire. Maximum 3 phrases. Réponds UNIQUEMENT en français, même si le client a parlé dans une autre langue.",
            },
          ],
        },
      }
    }
  }

  // 5. Prompt V4 conversationnel + variableValues artisan
  if (body.sync_conversational) {
    const assistantName = profile.assistant_name?.trim() || 'Mia'
    const companyName   = profile.company_name   || 'votre artisan'
    const artisanName   = profile.full_name       || companyName

    // Injecter le prompt V4 (variables {{…}} restent telles quelles — résolues par Vapi)
    const messages: any[] = (patch.model?.messages ?? assistant.model?.messages ?? [])
    const sysIndex = messages.findIndex((m: any) => m.role === 'system')
    const updatedMessages = [...messages]
    if (sysIndex !== -1) {
      const cur: string = messages[sysIndex].content ?? ''
      updatedMessages[sysIndex] = { ...messages[sysIndex], content: injectConversationalInPrompt(cur, PROMPT_V4) }
    } else {
      updatedMessages.unshift({ role: 'system', content: CONV_MARKER_START + '\n' + PROMPT_V4 + '\n' + CONV_MARKER_END })
    }

    patch.model = {
      ...(patch.model ?? assistant.model),
      messages: updatedMessages,
      temperature: 0.75,
      maxTokens: 250,
    }

    // Voix naturelle
    patch.voice = {
      ...(patch.voice ?? assistant.voice ?? {}),
      stability: 0.5,
      similarityBoost: 0.75,
      style: 0.3,
      useSpeakerBoost: true,
    }

    // Timing conversationnel
    patch.startSpeakingPlan = {
      waitSeconds: 0.6,
      smartEndpointingEnabled: true,
      transcriptionEndpointingPlan: {
        onPunctuationSeconds: 0.4,
        onNoPunctuationSeconds: 1.2,
        onNumberSeconds: 0.6,
      },
    }
    patch.stopSpeakingPlan = {
      numWords: 2,
      voiceSeconds: 0.3,
      backoffSeconds: 1.0,
    }

    patch.silenceTimeoutSeconds        = 30
    patch.maxDurationSeconds           = 600
    patch.backgroundSound              = 'office'
    patch.backchannelingEnabled        = true
    patch.modelOutputInMessagesEnabled = true

    patch.firstMessage = profile.greeting_open?.trim() || `Allô, {{company_name}}, bonjour !`

    patch.analysisPlan = {
      ...(assistant.analysisPlan ?? {}),
      summaryPlan: {
        enabled: true,
        messages: [
          {
            role: 'system',
            content: "Rédige un résumé concis en français de cet appel. Indique : (1) la raison, (2) les infos importantes (nom, téléphone, adresse), (3) urgence ou non, (4) prochaine action. Maximum 3 phrases. Toujours en français.",
          },
        ],
      },
      structuredDataPlan: {
        enabled: true,
        schema: FULL_STRUCTURED_DATA_SCHEMA,
      },
    }

    // Webhook Vapi → send-call-sms (end-of-call-report + assistant-request)
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const webhookSecret = Deno.env.get('VAPI_WEBHOOK_SECRET')
    patch.server = {
      url: `${supabaseUrl}/functions/v1/send-call-sms`,
      ...(webhookSecret ? { secret: webhookSecret } : {}),
    }
  }

  // 6. Sync salutation (firstMessage uniquement)
  if (body.sync_greeting) {
    patch.firstMessage = profile.greeting_open?.trim() || `Allô, {{company_name}}, bonjour !`
  }

  // 7. Sync webhook server URL uniquement
  if (body.sync_server) {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const webhookSecret = Deno.env.get('VAPI_WEBHOOK_SECRET')
    patch.server = {
      url: `${supabaseUrl}/functions/v1/send-call-sms`,
      ...(webhookSecret ? { secret: webhookSecret } : {}),
    }
  }

  // 7. Sync voix ElevenLabs selon assistant_voice du profil
  if (body.sync_voice) {
    const VOICE_IDS: Record<string, string> = {
      'female-warm': 'FFXYdAYPzn8Tw8KiHZqg',
      'male-pro':    'BVBq6HVJVdnwOMJOqvy9',
    }
    const voiceKey = profile.assistant_voice || 'female-warm'
    const voiceId  = VOICE_IDS[voiceKey] ?? VOICE_IDS['female-warm']
    patch.voice = {
      ...(patch.voice ?? assistant.voice ?? {}),
      provider: '11labs',
      voiceId,
      model: 'eleven_multilingual_v2',
      stability: 0.5,
      similarityBoost: 0.75,
    }
  }

  // 8. Sync raisons d'appel personnalisées depuis le catalogue
  if (body.sync_reasons) {
    try {
      const { data: reasonsRaw, error: reasonsErr } = await supabase
        .from('inbound_reasons')
        .select(`
          id,
          emergency_behavior,
          reasons_catalog!reason_id (
            label,
            description,
            category,
            is_emergency,
            sort_order
          )
        `)
        .eq('user_id', userId)
        .eq('is_active', true)

      if (reasonsErr) {
        console.error('[sync_reasons] fetch inbound_reasons error:', reasonsErr.message)
      } else {
        const { data: urgProfile } = await supabase
          .from('profiles')
          .select('emergency_transfer_number, default_emergency_behavior')
          .eq('id', userId)
          .single()

        type CatalogJoin = {
          label: string
          description: string | null
          category: string
          is_emergency: boolean
          sort_order: number
        }
        type ReasonRow = {
          id: string
          emergency_behavior: string | null
          reasons_catalog: CatalogJoin | null
        }

        const rows     = ((reasonsRaw ?? []) as ReasonRow[]).filter(r => r.reasons_catalog !== null)
        const standard = rows.filter(r => !r.reasons_catalog!.is_emergency)
        const urgent   = rows.filter(r =>  r.reasons_catalog!.is_emergency)

        // ── BLOC A : raisons standard ──────────────────────────────────────────
        let blocA: string
        if (standard.length > 0) {
          const byCategory = new Map<string, ReasonRow[]>()
          for (const r of standard) {
            const cat = r.reasons_catalog!.category
            if (!byCategory.has(cat)) byCategory.set(cat, [])
            byCategory.get(cat)!.push(r)
          }
          const sortedCats = [...byCategory.keys()].sort()
          const lines: string[] = [
            '## Motifs d\'appel pertinents pour cet artisan',
            'L\'artisan traite les types de demandes suivants. Quand le client mentionne l\'un de ces motifs, qualifie-le naturellement dans la conversation.',
            '',
            '**CLASSIFICATION OBLIGATOIRE :** À la fin de l\'appel, dans le champ `reason` du résumé structuré, indique EXACTEMENT l\'un des labels ci-dessous qui correspond le mieux à la demande. Ne reformule pas — copie le label tel quel. Si vraiment aucun ne correspond, écris "Demande générale".',
            '',
          ]
          for (const cat of sortedCats) {
            const items = byCategory.get(cat)!
              .sort((a, b) => a.reasons_catalog!.sort_order - b.reasons_catalog!.sort_order)
            lines.push(`### ${cat}`)
            for (const r of items) {
              const desc = r.reasons_catalog!.description ? ` : ${r.reasons_catalog!.description}` : ''
              lines.push(`- **${r.reasons_catalog!.label}**${desc}`)
            }
            lines.push('')
          }
          blocA = lines.join('\n')
        } else {
          blocA = '## Motifs d\'appel\nAucun motif spécifique configuré. Gère les demandes générales.'
        }

        // ── BLOC B : raisons urgentes (uniquement si au moins une cochée) ──────
        const transferNumber =
          (urgProfile as { emergency_transfer_number?: string | null } | null)?.emergency_transfer_number
          ?? profile.transfer_phone
          ?? null

        let blocB = ''
        if (urgent.length > 0) {
          const companyName    = profile.company_name || 'l\'artisan'
          const transferTarget = transferNumber || 'non configuré — prendre un message prioritaire'
          const sortedUrgent   = [...urgent].sort((a, b) => {
            const catCmp = a.reasons_catalog!.category.localeCompare(b.reasons_catalog!.category)
            return catCmp !== 0 ? catCmp : a.reasons_catalog!.sort_order - b.reasons_catalog!.sort_order
          })
          const lines: string[] = [
            '## 🚨 SITUATIONS D\'URGENCE — TRAITEMENT PRIORITAIRE',
            'Les motifs suivants sont classés URGENTS pour cet artisan.',
            '',
          ]
          for (const r of sortedUrgent) {
            const behavior = (
              r.emergency_behavior
              ?? (urgProfile as { default_emergency_behavior?: string | null } | null)?.default_emergency_behavior
              ?? 'priority_message'
            ) as string
            if (behavior === 'transfer') {
              lines.push(
                `- **${r.reasons_catalog!.label}** [TRANSFERT IMMÉDIAT] : Si le client confirme une urgence active, indique-lui : 'Je transfère immédiatement votre appel. Restez en ligne.' Puis déclenche la fonction transfer_call avec le numéro : ${transferTarget}.`
              )
            } else if (behavior === 'both') {
              lines.push(
                `- **${r.reasons_catalog!.label}** [TRANSFERT + MESSAGE] : Propose d'abord le transfert : 'Voulez-vous être transféré immédiatement ou laisser un message ?' Selon la réponse : transfer_call OU prise de message prioritaire.`
              )
            } else {
              lines.push(
                `- **${r.reasons_catalog!.label}** [MESSAGE PRIORITAIRE] : Prends rapidement le nom, l'adresse, le problème exact. Indique : 'Je transmets immédiatement à ${companyName} qui vous rappelle dans les plus brefs délais.' SMS marqué 🚨 URGENT.`
              )
            }
            lines.push('')
          }
          blocB = lines.join('\n')
        }

        // ── Injection dans le message système ──────────────────────────────────
        const messages: any[] = (patch.model?.messages ?? assistant.model?.messages ?? []) // any : structure Vapi opaque
        const sysIndex = messages.findIndex((m: any) => m.role === 'system')
        const updatedMessages = [...messages]
        if (sysIndex !== -1) {
          let cur: string = messages[sysIndex].content ?? ''
          cur = injectMarkerBlock(cur, blocA, REASONS_MARKER_START, REASONS_MARKER_END)
          if (blocB) {
            cur = injectMarkerBlock(cur, blocB, URG_REASONS_MARKER_START, URG_REASONS_MARKER_END)
          }
          updatedMessages[sysIndex] = { ...messages[sysIndex], content: cur }
        } else {
          let content = REASONS_MARKER_START + '\n' + blocA + '\n' + REASONS_MARKER_END
          if (blocB) content += URG_REASONS_MARKER_START + '\n' + blocB + '\n' + URG_REASONS_MARKER_END
          updatedMessages.unshift({ role: 'system', content })
        }
        patch.model = { ...(patch.model ?? assistant.model), messages: updatedMessages }

        // ── logEvent ──────────────────────────────────────────────────────────
        await logEvent({
          supabase,
          eventType: 'vapi_sync_reasons',
          userId,
          metadata: {
            standard_count: standard.length,
            emergency_count: urgent.length,
            has_emergency_transfer_number: !!(
              (urgProfile as { emergency_transfer_number?: string | null } | null)?.emergency_transfer_number
            ),
            has_default_behavior: !!(
              (urgProfile as { default_emergency_behavior?: string | null } | null)?.default_emergency_behavior
            ),
          },
          severity: 'info',
        })
        if (urgent.length > 0 && !transferNumber) {
          await logEvent({
            supabase,
            eventType: 'sync_emergency_no_transfer_number',
            userId,
            severity: 'warning',
          })
        }
      }
    } catch (e) {
      console.error('[sync_reasons] unexpected error:', e)
    }
  }

  // ── PATCH VAPI ────────────────────────────────────────────────────────────────
  let vapiPatchSucceeded = false
  if (Object.keys(patch).length > 0) {
    const patchRes = await fetch(`https://api.vapi.ai/assistant/${assistantId}`, {
      method: 'PATCH',
      headers: { 'Authorization': `Bearer ${vapiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(patch),
    })
    if (!patchRes.ok) {
      const err = await patchRes.text()
      console.error('VAPI PATCH error:', err)
      return new Response(
        JSON.stringify({ error: 'Erreur lors de la mise à jour de l\'assistant VAPI', detail: err }),
        { status: 502, headers: { ...CORS, 'Content-Type': 'application/json' } }
      )
    }
    vapiPatchSucceeded = true
  }

  // ── Sauvegarder dans profiles ─────────────────────────────────────────────────
  const profileUpdate: Record<string, any> = {}
  if (body.transfer_enabled !== undefined) {
    const phoneToUse = body.transfer_phone || profile.phone
    profileUpdate.transfer_phone = body.transfer_enabled && phoneToUse
      ? normalizePhone(phoneToUse)
      : null
  }
  // Sync vapi_system_prompt si le prompt a été modifié
  const newSysMsg = patch.model?.messages?.find((m: any) => m.role === 'system')
  if (newSysMsg?.content) {
    profileUpdate.vapi_system_prompt = newSysMsg.content
  }
  if (body.sync_reasons && vapiPatchSucceeded) {
    profileUpdate.last_vapi_sync_at = new Date().toISOString()
  }
  if (Object.keys(profileUpdate).length > 0) {
    await supabase.from('profiles').update(profileUpdate).eq('id', userId)
  }

  return new Response(
    JSON.stringify({ success: true }),
    { headers: { ...CORS, 'Content-Type': 'application/json' } }
  )
})
