import { useState } from 'react'
import { supabase } from '@/lib/supabase'

const BRAND = '#2850c8'

// ── Types ─────────────────────────────────────────────────────────────────────
type DaySlot = { day: string; open: string; close: string; on: boolean }
type Appointment = { id: number; date: string; time: string; duration: string; description: string }

interface OnboardingData {
  // Étape 2
  company_name: string
  company_type: string
  phone: string
  email: string
  address: string
  // Étape 3
  assistant_name: string
  assistant_voice: string
  greeting_open: string
  greeting_closed: string
  // Étape 4
  hours: DaySlot[]
  // Étape 5
  appointments: Appointment[]
  appointment_notes: string
  appointment_mode: 'manual' | 'paste' | 'skip'
}

const DEFAULT_HOURS: DaySlot[] = [
  { day: 'Lundi', open: '09:00', close: '18:00', on: true },
  { day: 'Mardi', open: '09:00', close: '18:00', on: true },
  { day: 'Mercredi', open: '09:00', close: '18:00', on: true },
  { day: 'Jeudi', open: '09:00', close: '18:00', on: true },
  { day: 'Vendredi', open: '09:00', close: '18:00', on: true },
  { day: 'Samedi', open: '09:00', close: '12:00', on: false },
  { day: 'Dimanche', open: '', close: '', on: false },
]

const BUSINESS_TYPES = [
  'Plomberie / Chauffage / Climatisation',
  'Électricité / Solaire',
  'Services à domicile',
  'Menuiserie / Charpenterie',
  'Peinture / Décoration',
  'Serrurerie',
  'Jardinage / Paysagisme',
  'Multi-services',
  'Autre',
]

const VOICE_OPTIONS = [
  { value: 'Féminin conviviale', label: '👩 Féminin — conviviale', desc: 'Chaleureuse et accessible' },
  { value: 'Féminin professionnelle', label: '👩‍💼 Féminin — professionnelle', desc: 'Formelle et rassurante' },
  { value: 'Masculin convivial', label: '👨 Masculin — convivial', desc: 'Détendu et sympa' },
]

const PLANS = [
  { id: 'starter', name: 'Solo', price: '79€', priceId: 'price_1TJv9uB5dBerNSsDbvCQFO2P', calls: '150 appels/mois', features: ['Secrétaire IA 24/7', 'SMS résumé en 30 sec', 'Prise de RDV'] },
  { id: 'pro', name: 'Pro', price: '149€', priceId: 'price_1TJv9uB5dBerNSsDpOIyE2UP', calls: 'Appels illimités', features: ['Tout Solo inclus', 'Transfert d\'appel', 'Statistiques'], popular: true },
  { id: 'expert', name: 'Équipe', price: '249€', priceId: 'price_1TJv9vB5dBerNSsDlnsXltWh', calls: 'Illimité · jusqu\'à 5 artisans', features: ['Tout Pro inclus', 'Multi-artisans', 'Support prioritaire'] },
]

interface Props { userEmail: string }

export default function OnboardingPage({ userEmail }: Props) {
  const [step, setStep] = useState(1)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [selectedPlan, setSelectedPlan] = useState('pro')

  const [data, setData] = useState<OnboardingData>({
    company_name: '',
    company_type: 'Plomberie / Chauffage / Climatisation',
    phone: '',
    email: userEmail,
    address: '',
    assistant_name: 'Mia',
    assistant_voice: 'Féminin conviviale',
    greeting_open: "Bonjour, vous avez bien joint {NOM_ENTREPRISE}. Je suis {NOM_ASSISTANTE}, l'assistante de votre artisan. Comment puis-je vous aider ?",
    greeting_closed: "Bonjour, vous avez bien joint {NOM_ENTREPRISE}. Nous sommes actuellement fermés. Laissez-moi votre message et votre artisan vous rappellera dès que possible.",
    hours: DEFAULT_HOURS,
    appointments: [],
    appointment_notes: '',
    appointment_mode: 'skip',
  })

  const [newAppt, setNewAppt] = useState({ date: '', time: '', duration: '1h', description: '' })

  const TOTAL_STEPS = 6
  const progress = ((step - 1) / (TOTAL_STEPS - 1)) * 100

  const update = (patch: Partial<OnboardingData>) => setData(prev => ({ ...prev, ...patch }))

  const updateHour = (i: number, field: keyof DaySlot, value: string | boolean) => {
    update({ hours: data.hours.map((d, idx) => idx === i ? { ...d, [field]: value } : d) })
  }

  const addAppointment = () => {
    if (!newAppt.date || !newAppt.time || !newAppt.description) return
    update({ appointments: [...data.appointments, { id: Date.now(), ...newAppt }] })
    setNewAppt({ date: '', time: '', duration: '1h', description: '' })
  }

  const removeAppointment = (id: number) => {
    update({ appointments: data.appointments.filter(a => a.id !== id) })
  }

  // Interpolation des variables dans les messages
  const interpolate = (text: string) =>
    text
      .replace(/{NOM_ENTREPRISE}/g, data.company_name || 'votre entreprise')
      .replace(/{NOM_ASSISTANTE}/g, data.assistant_name || 'Mia')

  async function handleLaunch() {
    setLoading(true); setError('')
    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session?.access_token) throw new Error('Session expirée, veuillez vous reconnecter.')

      // Sauvegarder les infos dans le profil
      const profileUpdate = {
        company_name: data.company_name,
        company_type: data.company_type,
        phone: data.phone,
        email: data.email,
        address: data.address,
        assistant_name: data.assistant_name,
        assistant_voice: data.assistant_voice,
        greeting_open: interpolate(data.greeting_open),
        greeting_closed: interpolate(data.greeting_closed),
        hours: JSON.stringify(data.hours),
        // Stocker les rendez-vous comme notes pour l'IA
        onboarding_calendar: data.appointment_mode === 'paste'
          ? data.appointment_notes
          : data.appointments.map(a =>
              `${a.date} à ${a.time} (${a.duration}) — ${a.description}`
            ).join('\n'),
      }

      await supabase.from('profiles').update(profileUpdate).eq('id', session.user.id)

      // Créer la session Stripe
      const plan = PLANS.find(p => p.id === selectedPlan)!
      const res = await fetch('https://hxkpmmekaotwmzgqxafp.supabase.co/functions/v1/create-checkout-session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${session.access_token}` },
        body: JSON.stringify({ priceId: plan.priceId, trade: data.company_type, company: data.company_name, email: data.email }),
      })
      const result = await res.json()
      if (!res.ok || result.error) throw new Error(result.error || result.message || `Erreur ${res.status}`)
      if (!result.url) throw new Error('URL de paiement manquante')
      window.location.href = result.url
    } catch (e: any) { setError(e.message); setLoading(false) }
  }

  async function handleSignOut() {
    await supabase.auth.signOut()
    window.location.reload()
  }

  // ── Step guards ──────────────────────────────────────────────────────────────
  const canNext: Record<number, boolean> = {
    1: true,
    2: !!data.company_name.trim() && !!data.phone.trim(),
    3: !!data.assistant_name.trim(),
    4: true,
    5: true,
    6: true,
  }

  const STEP_LABELS = ['Bienvenue', 'Entreprise', 'Assistante', 'Horaires', 'Agenda', 'Lancement']

  return (
    <div className="min-h-screen bg-[#F5F5F4] flex flex-col items-center justify-center p-4" style={{ fontFamily: 'system-ui, sans-serif' }}>
      <div className="w-full max-w-xl">

        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg flex items-center justify-center text-white text-xs font-bold" style={{ background: BRAND }}>F</div>
            <span className="text-sm font-semibold text-gray-700">Fixlyy</span>
          </div>
          <button onClick={handleSignOut} className="text-xs text-gray-400 hover:text-gray-600">Se déconnecter</button>
        </div>

        {/* Progress bar + labels */}
        {step > 1 && (
          <div className="mb-6">
            <div className="flex items-center justify-between mb-2">
              {STEP_LABELS.map((label, i) => (
                <div key={i} className="flex flex-col items-center flex-1">
                  <div className={`w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold mb-1 transition-all ${
                    step > i + 1 ? 'text-white' : step === i + 1 ? 'text-white' : 'bg-gray-200 text-gray-400'
                  }`} style={step >= i + 1 ? { background: BRAND } : {}}>
                    {step > i + 1 ? '✓' : i + 1}
                  </div>
                  <span className={`text-[9px] font-medium ${step === i + 1 ? 'text-gray-700' : 'text-gray-400'}`}>{label}</span>
                </div>
              ))}
            </div>
            <div className="w-full bg-gray-200 rounded-full h-1">
              <div className="h-1 rounded-full transition-all duration-500" style={{ width: `${progress}%`, background: BRAND }} />
            </div>
          </div>
        )}

        {/* ── Étape 1 : Bienvenue ── */}
        {step === 1 && (
          <div className="bg-white rounded-2xl p-8 shadow-sm border border-gray-100 text-center">
            <div className="w-16 h-16 rounded-2xl flex items-center justify-center mx-auto mb-5 shadow-lg"
              style={{ background: `linear-gradient(135deg, ${BRAND}, #4070e8)` }}>
              <svg width="32" height="32" viewBox="0 0 32 32" fill="none">
                <circle cx="16" cy="16" r="12" stroke="white" strokeWidth="2" opacity="0.4"/>
                <circle cx="16" cy="16" r="7" stroke="white" strokeWidth="2"/>
                <path d="M16 10v6l3 3" stroke="white" strokeWidth="2" strokeLinecap="round"/>
              </svg>
            </div>
            <h1 className="text-2xl font-bold text-gray-900 mb-2">Bienvenue sur Fixlyy</h1>
            <p className="text-gray-500 text-sm mb-6 max-w-sm mx-auto leading-relaxed">
              Votre secrétaire IA répond à vos appels quand vous ne pouvez pas. Elle prend les messages, note les urgences et vous envoie un résumé par SMS.
            </p>

            <div className="grid grid-cols-3 gap-3 mb-8">
              {[
                { icon: '📞', title: 'Répond 24/7', desc: 'Même la nuit et le week-end' },
                { icon: '💬', title: 'SMS en 30 sec', desc: 'Résumé dès la fin de l\'appel' },
                { icon: '📅', title: 'Prend des RDV', desc: 'Sans double-booking' },
              ].map((f, i) => (
                <div key={i} className="bg-gray-50 rounded-xl p-3 text-center">
                  <div className="text-xl mb-1">{f.icon}</div>
                  <p className="text-xs font-semibold text-gray-700">{f.title}</p>
                  <p className="text-[10px] text-gray-400 mt-0.5">{f.desc}</p>
                </div>
              ))}
            </div>

            <button onClick={() => setStep(2)}
              className="w-full py-3 rounded-xl text-white text-sm font-semibold transition-all hover:opacity-90"
              style={{ background: `linear-gradient(135deg, ${BRAND}, #4070e8)` }}>
              Configurer mon assistante →
            </button>
            <p className="text-[11px] text-gray-400 mt-3">Configuration en 5 minutes · 7 jours gratuits</p>
          </div>
        )}

        {/* ── Étape 2 : Entreprise ── */}
        {step === 2 && (
          <div className="bg-white rounded-2xl p-7 shadow-sm border border-gray-100">
            <h2 className="text-xl font-bold mb-1">Votre entreprise</h2>
            <p className="text-sm text-gray-400 mb-6">Ces infos serviront à votre assistante pour se présenter aux clients.</p>

            <div className="flex flex-col gap-4">
              <div>
                <label className="text-xs font-semibold text-gray-500 block mb-1.5">Nom de l'entreprise *</label>
                <input value={data.company_name} onChange={e => update({ company_name: e.target.value })}
                  placeholder="Dupont Plomberie" autoFocus
                  className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm outline-none focus:border-[#2850c8] transition-colors" />
              </div>

              <div>
                <label className="text-xs font-semibold text-gray-500 block mb-1.5">Type d'activité</label>
                <select value={data.company_type} onChange={e => update({ company_type: e.target.value })}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm outline-none focus:border-[#2850c8] bg-white">
                  {BUSINESS_TYPES.map(t => <option key={t}>{t}</option>)}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-semibold text-gray-500 block mb-1.5">Téléphone pro *</label>
                  <input value={data.phone} onChange={e => update({ phone: e.target.value })}
                    placeholder="+33 6 00 00 00 00" type="tel"
                    className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm outline-none focus:border-[#2850c8] transition-colors" />
                  <p className="text-[10px] text-gray-400 mt-1">Recevez les SMS de résumé d'appel ici</p>
                </div>
                <div>
                  <label className="text-xs font-semibold text-gray-500 block mb-1.5">Email pro</label>
                  <input value={data.email} onChange={e => update({ email: e.target.value })}
                    placeholder="contact@entreprise.fr" type="email"
                    className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm outline-none focus:border-[#2850c8] transition-colors" />
                </div>
              </div>

              <div>
                <label className="text-xs font-semibold text-gray-500 block mb-1.5">Adresse (optionnel)</label>
                <input value={data.address} onChange={e => update({ address: e.target.value })}
                  placeholder="12 rue de la Paix, 75001 Paris"
                  className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm outline-none focus:border-[#2850c8] transition-colors" />
              </div>
            </div>

            <StepNav step={step} total={TOTAL_STEPS} onBack={() => setStep(1)} onNext={() => setStep(3)} canNext={canNext[2]} />
          </div>
        )}

        {/* ── Étape 3 : Assistante ── */}
        {step === 3 && (
          <div className="bg-white rounded-2xl p-7 shadow-sm border border-gray-100">
            <h2 className="text-xl font-bold mb-1">Votre assistante IA</h2>
            <p className="text-sm text-gray-400 mb-6">Personnalisez comment elle se présente et répond à vos clients.</p>

            <div className="flex flex-col gap-5">
              {/* Prénom */}
              <div>
                <label className="text-xs font-semibold text-gray-500 block mb-1.5">Prénom de votre assistante *</label>
                <input value={data.assistant_name} onChange={e => {
                  update({ assistant_name: e.target.value })
                }}
                  placeholder="Mia"
                  className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm outline-none focus:border-[#2850c8] transition-colors" />
              </div>

              {/* Type de voix */}
              <div>
                <label className="text-xs font-semibold text-gray-500 block mb-2">Type de voix</label>
                <div className="flex flex-col gap-2">
                  {VOICE_OPTIONS.map(v => (
                    <button key={v.value} onClick={() => update({ assistant_voice: v.value })}
                      className={`flex items-center gap-3 px-4 py-3 rounded-xl border-2 text-left transition-all ${data.assistant_voice === v.value ? 'border-[#2850c8] bg-[#2850c8]/5' : 'border-gray-200 hover:border-gray-300'}`}>
                      <div className="flex-1">
                        <p className="text-sm font-medium">{v.label}</p>
                        <p className="text-xs text-gray-400">{v.desc}</p>
                      </div>
                      {data.assistant_voice === v.value && (
                        <div className="w-5 h-5 rounded-full flex items-center justify-center flex-shrink-0" style={{ background: BRAND }}>
                          <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
                            <path d="M2 5l2 2 4-4" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                          </svg>
                        </div>
                      )}
                    </button>
                  ))}
                </div>
              </div>

              {/* Message d'accueil */}
              <div>
                <label className="text-xs font-semibold text-gray-500 block mb-1.5">Message pendant vos heures d'ouverture</label>
                <textarea value={data.greeting_open} onChange={e => update({ greeting_open: e.target.value })}
                  rows={3} className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm outline-none focus:border-[#2850c8] resize-none transition-colors" />
                {data.company_name && (
                  <div className="mt-1.5 px-3 py-2 bg-blue-50 rounded-lg">
                    <p className="text-[10px] text-blue-500 font-medium mb-0.5">Aperçu :</p>
                    <p className="text-xs text-blue-700 italic">"{interpolate(data.greeting_open)}"</p>
                  </div>
                )}
              </div>

              {/* Message hors horaires */}
              <div>
                <label className="text-xs font-semibold text-gray-500 block mb-1.5">Message hors horaires d'ouverture</label>
                <textarea value={data.greeting_closed} onChange={e => update({ greeting_closed: e.target.value })}
                  rows={3} className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm outline-none focus:border-[#2850c8] resize-none transition-colors" />
              </div>
            </div>

            <StepNav step={step} total={TOTAL_STEPS} onBack={() => setStep(2)} onNext={() => setStep(4)} canNext={canNext[3]} />
          </div>
        )}

        {/* ── Étape 4 : Horaires ── */}
        {step === 4 && (
          <div className="bg-white rounded-2xl p-7 shadow-sm border border-gray-100">
            <h2 className="text-xl font-bold mb-1">Vos horaires d'ouverture</h2>
            <p className="text-sm text-gray-400 mb-6">
              En dehors de ces plages, votre assistante prévient les clients que vous êtes fermé et prend leurs messages.
            </p>

            <div className="flex flex-col gap-3">
              {data.hours.map((d, i) => (
                <div key={d.day} className={`flex items-center gap-3 py-2 px-3 rounded-lg transition-colors ${d.on ? 'bg-blue-50/60' : 'bg-gray-50'}`}>
                  <span className="text-sm font-medium w-24 text-gray-700">{d.day}</span>
                  {d.on ? (
                    <div className="flex items-center gap-2 flex-1">
                      <input type="time" value={d.open} onChange={e => updateHour(i, 'open', e.target.value)}
                        className="border border-gray-200 rounded-md px-2 py-1.5 text-xs text-center outline-none focus:border-[#2850c8] bg-white" />
                      <span className="text-gray-300 text-xs">–</span>
                      <input type="time" value={d.close} onChange={e => updateHour(i, 'close', e.target.value)}
                        className="border border-gray-200 rounded-md px-2 py-1.5 text-xs text-center outline-none focus:border-[#2850c8] bg-white" />
                    </div>
                  ) : (
                    <span className="text-xs text-gray-400 italic flex-1">Fermé — assistante en mode nuit</span>
                  )}
                  <button onClick={() => updateHour(i, 'on', !d.on)}
                    className="relative w-9 h-5 rounded-full transition-colors flex-shrink-0"
                    style={{ background: d.on ? BRAND : '#D1D5DB' }}>
                    <span className={`absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform ${d.on ? 'translate-x-[18px]' : 'translate-x-0.5'}`} />
                  </button>
                </div>
              ))}
            </div>

            <div className="mt-4 px-3 py-2.5 bg-amber-50 border border-amber-100 rounded-lg">
              <p className="text-xs text-amber-700">
                <span className="font-semibold">Astuce :</span> Votre assistante répond également les jours fermés — elle indique simplement que vous êtes indisponible et prend le message.
              </p>
            </div>

            <StepNav step={step} total={TOTAL_STEPS} onBack={() => setStep(3)} onNext={() => setStep(5)} canNext={canNext[4]} />
          </div>
        )}

        {/* ── Étape 5 : Agenda ── */}
        {step === 5 && (
          <div className="bg-white rounded-2xl p-7 shadow-sm border border-gray-100">
            <h2 className="text-xl font-bold mb-1">Vos rendez-vous du mois</h2>
            <p className="text-sm text-gray-400 mb-2">
              Partagez vos RDV déjà planifiés. Votre assistante évitera de réserver un créneau déjà occupé.
            </p>
            <div className="px-3 py-2.5 bg-blue-50 border border-blue-100 rounded-lg mb-5">
              <p className="text-xs text-blue-700">
                <span className="font-semibold">Pourquoi c'est important :</span> Si un client appelle pour un RDV à 14h mardi et que vous avez déjà une intervention, l'IA propose automatiquement un autre créneau.
              </p>
            </div>

            {/* Mode sélection */}
            <div className="flex flex-col gap-2 mb-5">
              {[
                { mode: 'manual' as const, label: '✏️ Saisie manuelle', desc: 'J\'ajoute mes RDV un par un' },
                { mode: 'paste' as const, label: '📋 Coller mes notes', desc: 'Je colle le texte depuis mon téléphone ou mes notes' },
                { mode: 'skip' as const, label: '⏭ Passer cette étape', desc: 'Je configurerai l\'agenda plus tard' },
              ].map(opt => (
                <button key={opt.mode} onClick={() => update({ appointment_mode: opt.mode })}
                  className={`flex items-center gap-3 px-4 py-3 rounded-xl border-2 text-left transition-all ${data.appointment_mode === opt.mode ? 'border-[#2850c8] bg-[#2850c8]/5' : 'border-gray-200 hover:border-gray-300'}`}>
                  <div className="flex-1">
                    <p className="text-sm font-medium">{opt.label}</p>
                    <p className="text-xs text-gray-400">{opt.desc}</p>
                  </div>
                  {data.appointment_mode === opt.mode && (
                    <div className="w-5 h-5 rounded-full flex items-center justify-center flex-shrink-0" style={{ background: BRAND }}>
                      <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
                        <path d="M2 5l2 2 4-4" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                      </svg>
                    </div>
                  )}
                </button>
              ))}
            </div>

            {/* Mode manuel */}
            {data.appointment_mode === 'manual' && (
              <div>
                <div className="flex flex-col gap-3 mb-3 p-4 bg-gray-50 rounded-xl">
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="text-[10px] font-semibold text-gray-500 block mb-1">Date</label>
                      <input type="date" value={newAppt.date} onChange={e => setNewAppt(a => ({ ...a, date: e.target.value }))}
                        className="w-full border border-gray-200 rounded-lg px-2.5 py-2 text-xs outline-none focus:border-[#2850c8] bg-white" />
                    </div>
                    <div>
                      <label className="text-[10px] font-semibold text-gray-500 block mb-1">Heure</label>
                      <input type="time" value={newAppt.time} onChange={e => setNewAppt(a => ({ ...a, time: e.target.value }))}
                        className="w-full border border-gray-200 rounded-lg px-2.5 py-2 text-xs outline-none focus:border-[#2850c8] bg-white" />
                    </div>
                  </div>
                  <div>
                    <label className="text-[10px] font-semibold text-gray-500 block mb-1">Description du RDV</label>
                    <input value={newAppt.description} onChange={e => setNewAppt(a => ({ ...a, description: e.target.value }))}
                      placeholder="Ex : Installation chauffe-eau Mme Dupont, plomberie Martin..."
                      className="w-full border border-gray-200 rounded-lg px-2.5 py-2 text-xs outline-none focus:border-[#2850c8] bg-white" />
                  </div>
                  <div>
                    <label className="text-[10px] font-semibold text-gray-500 block mb-1">Durée estimée</label>
                    <select value={newAppt.duration} onChange={e => setNewAppt(a => ({ ...a, duration: e.target.value }))}
                      className="border border-gray-200 rounded-lg px-2.5 py-2 text-xs outline-none bg-white">
                      {['30min', '1h', '2h', '3h', '4h', 'Demi-journée', 'Journée entière'].map(d => <option key={d}>{d}</option>)}
                    </select>
                  </div>
                  <button onClick={addAppointment} disabled={!newAppt.date || !newAppt.time || !newAppt.description}
                    className="text-xs px-4 py-2 rounded-lg text-white font-medium disabled:opacity-40 self-start"
                    style={{ background: BRAND }}>
                    + Ajouter ce rendez-vous
                  </button>
                </div>

                {data.appointments.length > 0 && (
                  <div className="flex flex-col gap-1.5">
                    {data.appointments.map(a => (
                      <div key={a.id} className="flex items-center gap-2 px-3 py-2 bg-blue-50 rounded-lg">
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-medium text-gray-700">{new Date(a.date + 'T' + a.time).toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'short' })} à {a.time}</p>
                          <p className="text-[10px] text-gray-500 truncate">{a.description} · {a.duration}</p>
                        </div>
                        <button onClick={() => removeAppointment(a.id)} className="text-gray-300 hover:text-red-500 text-sm flex-shrink-0">×</button>
                      </div>
                    ))}
                    <p className="text-[10px] text-gray-400 mt-1">{data.appointments.length} rendez-vous ajouté{data.appointments.length > 1 ? 's' : ''}</p>
                  </div>
                )}
              </div>
            )}

            {/* Mode coller */}
            {data.appointment_mode === 'paste' && (
              <div>
                <label className="text-xs font-semibold text-gray-500 block mb-2">
                  Collez vos notes ou votre agenda ici
                </label>
                <textarea value={data.appointment_notes} onChange={e => update({ appointment_notes: e.target.value })}
                  rows={8}
                  placeholder={`Exemple :\nLundi 14 → 9h Martin fuite évier (2h)\nMercredi 16 → après-midi Mme Leroy installation WC\nVendredi 18 → matin pose radiateur M. Bernard\n...`}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm outline-none focus:border-[#2850c8] resize-none font-mono transition-colors" />
                <p className="text-[10px] text-gray-400 mt-1.5">
                  Format libre — copiez simplement vos notes depuis WhatsApp, votre calendrier, ou votre carnet.
                </p>
              </div>
            )}

            {/* Mode skip */}
            {data.appointment_mode === 'skip' && (
              <div className="px-4 py-4 bg-gray-50 rounded-xl text-center">
                <p className="text-sm text-gray-500">Pas de problème — vous pourrez ajouter vos rendez-vous depuis le dashboard après la configuration.</p>
              </div>
            )}

            <StepNav step={step} total={TOTAL_STEPS} onBack={() => setStep(4)} onNext={() => setStep(6)} canNext={canNext[5]} />
          </div>
        )}

        {/* ── Étape 6 : Plan + Lancement ── */}
        {step === 6 && (
          <div className="bg-white rounded-2xl p-7 shadow-sm border border-gray-100">
            <h2 className="text-xl font-bold mb-1">Choisissez votre plan</h2>
            <p className="text-sm text-gray-400 mb-5">7 jours gratuits · Aucun débit maintenant · Annulation à tout moment</p>

            {/* Résumé de config */}
            <div className="mb-5 px-4 py-3.5 bg-gray-50 rounded-xl border border-gray-100">
              <p className="text-xs font-semibold text-gray-500 mb-2.5">Votre configuration</p>
              <div className="flex flex-col gap-1.5">
                {[
                  { icon: '🏢', label: data.company_name || '—', sub: data.company_type },
                  { icon: '📞', label: data.phone || '—', sub: 'Numéro de notification SMS' },
                  { icon: '🤖', label: data.assistant_name, sub: `Voix : ${data.assistant_voice}` },
                  { icon: '🕐', label: `${data.hours.filter(h => h.on).length} jours d'ouverture configurés`, sub: data.hours.filter(h => h.on).map(h => h.day.slice(0, 3)).join(', ') },
                  ...(data.appointment_mode !== 'skip' ? [{
                    icon: '📅',
                    label: data.appointment_mode === 'manual'
                      ? `${data.appointments.length} rendez-vous importé${data.appointments.length > 1 ? 's' : ''}`
                      : 'Notes d\'agenda importées',
                    sub: 'L\'IA respectera ces créneaux'
                  }] : []),
                ].map((item, i) => (
                  <div key={i} className="flex items-center gap-2.5">
                    <span className="text-sm">{item.icon}</span>
                    <div>
                      <span className="text-xs font-medium text-gray-700">{item.label}</span>
                      {item.sub && <span className="text-[10px] text-gray-400 ml-1.5">{item.sub}</span>}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Plans */}
            <div className="flex flex-col gap-2.5 mb-5">
              {PLANS.map(p => (
                <button key={p.id} onClick={() => setSelectedPlan(p.id)}
                  className={`relative p-4 rounded-xl border-2 text-left transition-all ${selectedPlan === p.id ? 'border-[#2850c8] bg-[#2850c8]/5' : 'border-gray-200 hover:border-gray-300'}`}>
                  {p.popular && (
                    <span className="absolute top-3 right-3 text-[10px] font-bold px-2 py-0.5 rounded-full text-white" style={{ background: BRAND }}>
                      Populaire
                    </span>
                  )}
                  <div className="flex items-baseline gap-1.5 mb-1">
                    <span className="text-lg font-bold">{p.price}</span>
                    <span className="text-xs text-gray-400">/mois</span>
                    <span className="text-sm font-semibold text-gray-700 ml-1">{p.name}</span>
                    <span className="text-xs text-gray-400">· {p.calls}</span>
                  </div>
                  <div className="flex flex-wrap gap-2 mt-1.5">
                    {p.features.map((f, j) => (
                      <span key={j} className="text-[10px] text-gray-500 flex items-center gap-1">
                        <span className="text-emerald-500">✓</span> {f}
                      </span>
                    ))}
                  </div>
                </button>
              ))}
            </div>

            {error && (
              <div className="mb-4 p-3 bg-red-50 border border-red-100 rounded-lg text-xs text-red-600">{error}</div>
            )}

            <button onClick={handleLaunch} disabled={loading}
              className="w-full py-3.5 rounded-xl text-white text-sm font-semibold transition-all hover:opacity-90 disabled:opacity-50 flex items-center justify-center gap-2"
              style={{ background: `linear-gradient(135deg, ${BRAND}, #4070e8)` }}>
              {loading && <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />}
              {loading ? 'Enregistrement en cours...' : 'Lancer mon assistante — 7 jours gratuits →'}
            </button>
            <p className="text-center text-[11px] text-gray-400 mt-2">
              Satisfait ou remboursé 30 jours · Annulation à tout moment
            </p>

            <button onClick={() => setStep(5)} className="w-full text-center text-xs text-gray-400 mt-3 hover:text-gray-600">← Retour</button>
          </div>
        )}
      </div>
    </div>
  )
}

// ── Navigation bas de page ─────────────────────────────────────────────────────
function StepNav({ step, total, onBack, onNext, canNext }: { step: number; total: number; onBack: () => void; onNext: () => void; canNext: boolean }) {
  return (
    <div className="flex items-center justify-between mt-7 pt-5 border-t border-gray-100">
      <button onClick={onBack} className="text-sm text-gray-400 hover:text-gray-600 transition-colors flex items-center gap-1.5">
        ← Retour
      </button>
      <span className="text-xs text-gray-300">{step} / {total}</span>
      <button onClick={onNext} disabled={!canNext}
        className="text-sm px-5 py-2.5 rounded-lg text-white font-medium disabled:opacity-40 transition-all hover:opacity-90"
        style={{ background: BRAND }}>
        Continuer →
      </button>
    </div>
  )
}
