import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SERVICE_ROLE_KEY')!
)

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, content-type',
}

// ── Marqueurs pour injecter/remplacer les blocs dans le prompt ───────────────
const MARKER_START = '\n\n<!-- FIXLYY_URGENCES_DEBUT -->'
const MARKER_END = '<!-- FIXLYY_URGENCES_FIN -->'

const ML_MARKER_START = '\n\n<!-- FIXLYY_MULTILINGUAL_DEBUT -->'
const ML_MARKER_END = '<!-- FIXLYY_MULTILINGUAL_FIN -->'

// ── Base de données des urgences par métier ───────────────────────────────────
const URGENCY_BY_TRADE: Record<string, string[]> = {

  'Plomberie / Chauffage / Climatisation': [
    // Fuites et dégâts des eaux
    "Fuite d'eau active sur le sol, une eau qui coule sans arrêt",
    "Dégât des eaux : plafond qui coule, mur trempé, eau qui tombe d'en haut",
    "Rupture ou explosion d'une canalisation",
    "Fuite visible sur un tuyau apparent avec eau qui gicle",
    "Voisin du dessous qui se plaint d'une tache ou d'eau au plafond",
    "Eau qui coule depuis le plafond dans une autre pièce",
    "Lave-linge ou lave-vaisselle qui déborde et inonde la pièce",
    "Ballon d'eau chaude qui fuit, déborde ou siffle",
    "Radiateur qui fuit et mouille le parquet ou la moquette",
    "Fuite au niveau du compteur d'eau général",
    "Pompe de relevage en panne avec cave ou sous-sol inondé",
    "Joint de robinet cassé, eau impossible à couper",
    // Absence d'eau ou eau chaude
    "Coupure d'eau froide totale dans tout le logement",
    "Canalisation gelée en hiver, plus une goutte d'eau",
    "Chauffe-eau ou chaudière en panne avec nourrisson, bébé ou personne âgée",
    "Pas d'eau chaude depuis plusieurs heures avec personnes vulnérables",
    "Ballon d'eau chaude HS et besoin d'hygiène urgent (malade, retour hospitalisation)",
    // Chauffage
    "Radiateurs froids en plein hiver, pas de chauffage du tout",
    "Pas de chauffage avec enfants en bas âge, nourrisson ou personne âgée",
    "Chaudière qui affiche une panne ou une erreur depuis le matin",
    "Chaudière qui fait des bruits anormaux : claquements, sifflements, grognements",
    "Chaudière qui s'éteint toutes les 10 minutes (court-cycle)",
    "Fuite sur un tuyau de raccordement de la chaudière",
    "Pression du circuit chauffage tombée à zéro",
    // Gaz et CO
    "Odeur de gaz dans le logement (oeuf pourri, soufre)",
    "Détecteur de monoxyde de carbone (CO) qui sonne",
    "Suspicion d'intoxication au monoxyde de carbone (maux de tête, nausées)",
    // Sanitaire
    "WC/toilettes bouchées et qui débordent, seule salle de bain du logement",
    "Chasse d'eau qui déborde et coule sans s'arrêter",
    "Siphon de douche ou de baignoire bouché avec eau qui monte dans la pièce",
    "Odeur d'égout forte et persistante dans tout le logement",
    "WC qui ne se vide plus du tout, logement bloqué",
    // Climatisation
    "Climatiseur qui ne fonctionne plus pendant une canicule avec personnes vulnérables",
    "Clim qui fuit et mouille le plafond ou les meubles",
    // Sécurité
    "Eau + électricité : fuite à proximité d'une installation électrique",
    "Vanne d'arrêt générale introuvable ou bloquée face à une fuite",
  ],

  'Électricité / Solaire': [
    // Pannes totales
    "Panne totale d'électricité dans tout le logement ou local commercial",
    "Disjoncteur général qui disjoncte en permanence et ne remonte plus",
    "Coupure électrique dans la moitié du logement sans explication",
    "Compteur Linky qui affiche une erreur ou qui coupe la fourniture",
    // Risques immédiats
    "Odeur de brûlé ou de plastique fondu dans ou autour du tableau électrique",
    "Câble électrique dénudé, endommagé, sectionné ou visible dans une paroi",
    "Prise ou interrupteur qui fait des étincelles à l'utilisation",
    "Prise ou interrupteur qui chauffe fortement au toucher",
    "Tableau électrique qui chauffe, émet des claquements ou des bourdonnements",
    "Traces noires ou brûlées sur une prise, un câble ou un tableau",
    "Fil électrique sorti d'un mur suite à un choc ou des travaux",
    // Court-circuits et surcharges
    "Court-circuit : lumières qui vacillent, appareils qui s'éteignent brutalement",
    "Disjoncteur qui saute à chaque branchement d'un appareil spécifique",
    "Foudre ou surtension : tableau électrique endommagé après un orage",
    // Risques particuliers
    "Câble enterré sectionné accidentellement (pelletage, forage)",
    "Eau infiltrée dans le tableau électrique (fuite + électricité)",
    "Câble ou lampadaire tombé sur la voie publique ou dans le jardin",
    "Coupure électrique avec équipement médical branché (respirateur, pompe, dialyse)",
    "Coupure électrique avec congélateur plein qui risque de dégeler",
    // Équipements spécifiques
    "Installation solaire en panne avec coupure de courant résidentielle associée",
    "Onduleur ou panneau solaire qui sent le brûlé ou qui fume",
    "Borne de recharge véhicule électrique qui fait des étincelles ou coupe le courant",
    "Prise de salle de bain ou cuisine qui déclenche le différentiel en permanence",
    // Collectif
    "Éclairage de cage d'escalier ou de parking entièrement hors service",
    "Alarme incendie ou alarme intrusion déclenchée par un défaut électrique",
    "Groupe électrogène de secours qui ne démarre pas",
    "Éclairage de sécurité hors service dans un ERP (magasin, école, restaurant)",
    // Électroménager dangereux
    "Chauffe-eau électrique qui sent le brûlé ou fait des étincelles",
    "Machine à laver ou sèche-linge qui provoque des disjonctions répétées",
  ],

  'Serrurerie': [
    // Enfermé dehors
    "Porte d'entrée claquée, personne enfermée dehors sans clé",
    "Clé cassée dans la serrure, impossible d'entrer ou de sortir",
    "Clé coincée et serrure bloquée",
    "Serrure qui ne répond plus, ni à la clé ni au badge",
    "Code d'interphone ou digicode défaillant, impossible d'entrer dans l'immeuble",
    // Personnes enfermées à l'intérieur
    "Enfant seul enfermé à l'intérieur et qui ne répond plus",
    "Personne âgée ou malade enfermée dans une pièce (salle de bain, chambre) et qui ne répond plus",
    "Personne enfermée dans les toilettes ou la salle de bain",
    "Locataire enfermé dans son logement par défaillance de la serrure",
    // Sécurité suite à effraction
    "Porte d'entrée forcée, fracturée ou défoncée suite à cambriolage",
    "Tentative d'effraction constatée, serrure endommagée, logement non sécurisé",
    "Fenêtre ou porte-fenêtre fracturée par cambriolage, logement ouvert",
    "Serrure cassée la nuit, porte qui ne ferme plus à clé",
    "Verrou ou loquet de porte fenêtre cassé, pièce non sécurisable",
    // Urgences pratiques
    "Clé perdue et besoin impératif d'accéder au logement ou au local",
    "Porte de parking ou box automobile bloquée avec véhicule à l'intérieur",
    "Porte blindée dont le mécanisme de verrouillage est bloqué",
    "Porte coupe-feu dans un bâtiment collectif qui ne ferme plus",
    "Cylindre de serrure défaillant suite à tentative d'effraction avec copie de clé",
    "Personne piégée dans un ascenseur avec serrure de trappe bloquée",
    // Professionnel
    "Local commercial dont la serrure est cassée avant ouverture",
    "Coffre-fort ou salle des archives bloqué avec documents importants",
    "Locataire non coopératif qui a changé la serrure sans autorisation",
  ],

  'Menuiserie / Charpenterie': [
    // Sécurité du logement
    "Porte d'entrée qui ne ferme plus correctement (cadre abîmé, gonds arrachés, serrure décalée)",
    "Porte d'entrée déposée ou hors de ses gonds après choc ou cambriolage",
    "Fenêtre brisée ou soufflée, logement ouvert aux intempéries et aux intrusions",
    "Fenêtre ou porte-fenêtre qui ne ferme plus à clé la nuit",
    "Volet roulant bloqué en position ouverte la nuit (sécurité)",
    "Volet battant arraché et en train de taper contre la façade dans le vent",
    "Porte de garage qui ne descend plus et local ouvert",
    // Structure et charpente
    "Charpente endommagée par tempête, chute d'arbre ou forte neige",
    "Poutre ou solive apparente qui présente une fissure, un craquement ou un affaissement",
    "Plancher ou parquet qui s'effondre partiellement ou qui cède sous les pieds",
    "Escalier dont une marche s'est effondrée ou brisée (risque de chute)",
    "Mezzanine ou structure bois qui montre des signes de cédage",
    "Bois porteur avec pourrissement avancé visible sur une zone structurelle",
    // Fenêtres de toit et toiture bois
    "Fenêtre de toit (Velux) ouverte bloquée ou brisée qui laisse entrer la pluie",
    "Chassis de fenêtre arrachée par le vent",
    // Sécurité des personnes
    "Porte de salle de bain bloquée avec personne à l'intérieur",
    "Grille ou barrière de sécurité bois pour escalier ou terrasse cassée (enfant en danger)",
    "Garde-corps de balcon ou terrasse en bois instable, brisé ou décollé",
    "Portail extérieur qui ne ferme plus et donne accès direct à la voie publique",
    // Professionnel
    "Porte coupe-feu d'un ERP hors service (restaurant, commerce, école)",
    "Bardage ou revêtement bois de façade qui se décroche et menace les passants",
    "Plancher de scène, estrade ou structure événementielle qui montre des signes d'affaissement",
  ],

  'Peinture / Décoration': [
    // Note: la peinture est rarement urgente. L'IA doit être vigilante sur ce point.
    "Dégât des eaux récent : peinture qui se décolle massivement, intervention nécessaire avant moisissures",
    "Moisissures noires importantes dans une chambre d'enfant ou de nourrisson (risque sanitaire grave)",
    "Enduit ou plâtre du plafond qui se décroche en morceaux et risque de tomber sur des personnes",
    "Peinture ancienne au plomb qui s'écaille dans un logement avec enfants en bas âge (saturnisme)",
    "Revêtement de sol dangereux : dalles décollées qui forment des crocs-pieds, parquet soulevé avec clous apparents",
    "Local commercial dont la devanture doit impérativement être repeinte avant ouverture officielle",
    "Fissures dans un mur fraîchement enduit qui signalent un problème structurel sous-jacent",
    "Infiltration d'eau visible à travers une peinture extérieure, risque d'aggravation rapide",
    // Important : signaler à l'IA de ne pas surclasser les demandes esthétiques
  ],

  'Jardinage / Paysagisme': [
    // Sécurité immédiate
    "Arbre tombé sur une habitation, un véhicule, une clôture ou une voie publique",
    "Grosse branche morte sur le point de tomber sur un toit, une voiture ou un passage",
    "Arbre partiellement déraciné par le vent qui menace de tomber",
    "Haie ou arbre qui bloque complètement l'accès au logement ou au portail",
    "Racines qui ont soulevé et fissuré une dalle ou un mur de fondation",
    // Faune dangereuse
    "Nid de guêpes ou de frelons asiatiques dans un arbre, proche de la maison ou d'une zone de passage",
    "Présence de serpents ou nuisibles dangereux dans le jardin ou sous une terrasse",
    // Eau et intempéries
    "Système d'arrosage automatique bloqué en position ouverte, eau qui jaillit et inonde",
    "Drainage de jardin bouché avec refoulement d'eau vers la maison ou la cave",
    "Toiture végétalisée ou toit terrasse engazonné qui retient l'eau et crée des infiltrations",
    "Bassin ou piscine naturelle dont la bâche est percée avec risque d'effondrement des berges",
    "Clôture ou muret de jardin effondré donnant accès direct à la voie publique",
    // Professionnel / événementiel
    "Pelouse ou espace vert d'un événement (mariage, inauguration) à J-1 en mauvais état critique",
    "Végétation qui cache une signalisation routière ou obstrue dangereusement la visibilité",
  ],

  'Services à domicile': [
    "Personne âgée ou dépendante qui ne répond plus à domicile, urgence bien-être",
    "Demande d'aide immédiate pour une personne en situation de handicap",
    "Accident domestique mineur avec besoin d'assistance immédiate (chute sans blessure grave)",
    "Besoin d'intervention hygiénique avant retour d'hospitalisation ou visite médicale",
    "Fuite d'eau ou panne dans un logement occupé par une personne dépendante",
    "Panne de chauffage avec personne âgée seule et vulnérable",
    "Personne âgée enfermée dehors ou dans une pièce",
    "Présence d'un individu suspect ou intimidant au domicile d'une personne vulnérable",
    "Dégât des eaux dans le logement d'une personne incapable de gérer seule",
    "Rupture de stock d'un médicament ou d'équipement médical critique",
  ],

  'Multi-services': [
    // Plomberie
    "Fuite d'eau active qui coule sur le sol ou au plafond",
    "Dégât des eaux : eau qui tombe d'en haut",
    "Odeur de gaz ou suspicion de fuite de gaz",
    "Chaudière ou chauffe-eau en panne avec enfants ou personnes âgées",
    "Pas de chauffage en hiver avec personnes vulnérables",
    "WC bouché et qui déborde, seule salle de bain",
    // Électricité
    "Panne totale d'électricité dans tout le logement",
    "Odeur de brûlé dans le tableau électrique ou une prise",
    "Câble dénudé ou prise qui fait des étincelles",
    "Disjoncteur qui ne remonte plus",
    // Serrurerie
    "Porte d'entrée claquée, personne dehors sans clé",
    "Effraction ou tentative d'effraction, porte cassée",
    "Enfant ou personne vulnérable enfermée à l'intérieur",
    // Structure
    "Charpente ou structure endommagée par tempête",
    "Fenêtre brisée, logement ouvert",
    "Plancher ou escalier qui s'effondre",
    // Arbre
    "Arbre tombé sur une habitation ou bloquant l'accès",
    // Général
    "Personne âgée ou dépendante qui ne répond plus à domicile",
    "Détecteur de monoxyde de carbone qui sonne",
    "Eau + électricité simultanément (fuite + tableau)",
  ],
}

// ── Correspondance métier → situations urgentes ───────────────────────────────
function getUrgencySituations(companyType: string): string[] {
  // Correspondance exacte
  if (URGENCY_BY_TRADE[companyType]) return URGENCY_BY_TRADE[companyType]

  // Correspondance partielle
  const lower = companyType.toLowerCase()
  if (lower.includes('plomb') || lower.includes('chauff') || lower.includes('clim')) {
    return URGENCY_BY_TRADE['Plomberie / Chauffage / Climatisation']
  }
  if (lower.includes('élect') || lower.includes('solaire')) {
    return URGENCY_BY_TRADE['Électricité / Solaire']
  }
  if (lower.includes('serrur')) {
    return URGENCY_BY_TRADE['Serrurerie']
  }
  if (lower.includes('menuis') || lower.includes('charpen')) {
    return URGENCY_BY_TRADE['Menuiserie / Charpenterie']
  }
  if (lower.includes('peint') || lower.includes('décor')) {
    return URGENCY_BY_TRADE['Peinture / Décoration']
  }
  if (lower.includes('jardin') || lower.includes('paysag')) {
    return URGENCY_BY_TRADE['Jardinage / Paysagisme']
  }
  if (lower.includes('service')) {
    return URGENCY_BY_TRADE['Services à domicile']
  }

  return URGENCY_BY_TRADE['Multi-services']
}

// ── Construction du bloc urgences à injecter dans le prompt ──────────────────
function buildUrgencyBlock(situations: string[], trade: string): string {
  const list = situations.map((s, i) => `${i + 1}. ${s}`).join('\n')
  return `## DÉTECTION D'URGENCE — SITUATIONS PROPRES AU MÉTIER : ${trade}

Tu dois détecter si l'appel correspond à une urgence RÉELLE. Marque l'urgence (urgency: "urgent") dès que le client décrit une situation de cette liste :

${list}

RÈGLES DE DÉTECTION :
- Si le client utilise des mots comme "ça coule", "ça déborde", "panne", "en panne", "plus de", "ça fuit", "ça sent", "enfermé", "cassé", "tombé", "ça sent le brûlé" → cherche immédiatement si ça correspond à une situation urgente de la liste.
- Si la situation semble grave mais ne correspond pas exactement → demande une précision rapide avant de conclure.
- Pour les urgences vitales (gaz, CO, inondation, électrocution, effraction) → marque URGENT immédiatement sans hésiter.
- Pour les urgences confort (pas d'eau chaude, WC bouché) → marque URGENT si des personnes vulnérables sont concernées (bébé, enfant, personne âgée, malade).
- Ne marque JAMAIS urgent une simple demande de devis, de conseil ou de planification de travaux.

COMPORTEMENT QUAND C'EST URGENT :
Dis : "Je comprends, c'est une situation urgente. Je contacte immédiatement votre artisan et il vous rappelle dans les plus brefs délais. Pouvez-vous me confirmer votre numéro de téléphone ?"
Ne minimise jamais. Ne propose jamais un RDV pour une vraie urgence.`
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

// ── Injection dans le prompt VAPI (avec marqueurs) ───────────────────────────
function injectUrgencyInPrompt(currentPrompt: string, urgencyBlock: string): string {
  const start = currentPrompt.indexOf(MARKER_START)
  const end = currentPrompt.indexOf(MARKER_END)

  if (start !== -1 && end !== -1) {
    // Remplacer la section existante
    return (
      currentPrompt.slice(0, start) +
      MARKER_START + '\n' + urgencyBlock + '\n' + MARKER_END +
      currentPrompt.slice(end + MARKER_END.length)
    )
  }

  // Ajouter à la fin
  return currentPrompt + MARKER_START + '\n' + urgencyBlock + '\n' + MARKER_END
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

  const authHeader = req.headers.get('Authorization')
  if (!authHeader) return new Response('Unauthorized', { status: 401, headers: CORS })

  const { data: { user }, error: authError } = await supabase.auth.getUser(
    authHeader.replace('Bearer ', '')
  )
  if (authError || !user) return new Response('Unauthorized', { status: 401, headers: CORS })

  let body: {
    transfer_enabled?: boolean
    transfer_phone?: string
    sync_urgency?: boolean        // true → met à jour le contexte métier dans le prompt
    sync_multilingual?: boolean   // true → injecte les règles multilingues + bascule la voix ElevenLabs
    sync_analysis_plan?: boolean  // true → force le résumé d'appel en français
  }
  try { body = await req.json() } catch {
    return new Response('Invalid JSON', { status: 400, headers: CORS })
  }

  // Récupérer le profil
  const { data: profile } = await supabase
    .from('profiles')
    .select('vapi_assistant_id, phone, assistant_name, company_type, transfer_phone')
    .eq('id', user.id)
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

  // 2. Mise à jour du contexte urgences par métier
  if (body.sync_urgency) {
    const trade = profile.company_type || 'Multi-services'
    const situations = getUrgencySituations(trade)
    const urgencyBlock = buildUrgencyBlock(situations, trade)

    // Trouver le message système dans le prompt VAPI
    const messages: any[] = assistant.model?.messages ?? []
    const sysIndex = messages.findIndex((m: any) => m.role === 'system')

    if (sysIndex !== -1) {
      const currentPrompt: string = messages[sysIndex].content ?? ''
      const updatedPrompt = injectUrgencyInPrompt(currentPrompt, urgencyBlock)
      const updatedMessages = [...messages]
      updatedMessages[sysIndex] = { ...messages[sysIndex], content: updatedPrompt }
      patch.model = { ...(patch.model ?? assistant.model), messages: updatedMessages }
    } else {
      // Pas de message système — on crée le bloc comme premier message
      const newMessages = [
        { role: 'system', content: MARKER_START + '\n' + urgencyBlock + '\n' + MARKER_END },
        ...messages,
      ]
      patch.model = { ...(patch.model ?? assistant.model), messages: newMessages }
    }
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
          prompt: "Rédige un résumé concis en français de cet appel. Indique : (1) la raison de l'appel, (2) les informations importantes (nom, téléphone, adresse si mentionnés), (3) si c'est urgent ou non, (4) la prochaine action à faire. Maximum 3 phrases. Réponds UNIQUEMENT en français, même si le client a parlé dans une autre langue.",
        },
      }
    }
  }

  // ── PATCH VAPI ────────────────────────────────────────────────────────────────
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
        JSON.stringify({ error: 'Erreur lors de la mise à jour de l\'assistant VAPI' }),
        { status: 502, headers: { ...CORS, 'Content-Type': 'application/json' } }
      )
    }
  }

  // ── Sauvegarder dans profiles ─────────────────────────────────────────────────
  const profileUpdate: Record<string, any> = {}
  if (body.transfer_enabled !== undefined) {
    const phoneToUse = body.transfer_phone || profile.phone
    profileUpdate.transfer_phone = body.transfer_enabled && phoneToUse
      ? normalizePhone(phoneToUse)
      : null
  }
  if (Object.keys(profileUpdate).length > 0) {
    await supabase.from('profiles').update(profileUpdate).eq('id', user.id)
  }

  return new Response(
    JSON.stringify({ success: true }),
    { headers: { ...CORS, 'Content-Type': 'application/json' } }
  )
})
