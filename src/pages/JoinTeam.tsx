import { useState, useEffect } from 'react'

const BRAND = '#2850c8'
const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL

const DAYS = [
  { key: 'mon', label: 'Lun' },
  { key: 'tue', label: 'Mar' },
  { key: 'wed', label: 'Mer' },
  { key: 'thu', label: 'Jeu' },
  { key: 'fri', label: 'Ven' },
  { key: 'sat', label: 'Sam' },
  { key: 'sun', label: 'Dim' },
]

type DayHours = { enabled: boolean; from: string; to: string }
type Hours = Record<string, DayHours>

const DEFAULT_HOURS: Hours = {
  mon: { enabled: true,  from: '08:00', to: '18:00' },
  tue: { enabled: true,  from: '08:00', to: '18:00' },
  wed: { enabled: true,  from: '08:00', to: '18:00' },
  thu: { enabled: true,  from: '08:00', to: '18:00' },
  fri: { enabled: true,  from: '08:00', to: '18:00' },
  sat: { enabled: true,  from: '08:00', to: '12:00' },
  sun: { enabled: false, from: '09:00', to: '17:00' },
}

type InvitationData = {
  invitation: { id: string; first_name: string; phone: string; suggested_skills: string[] }
  company: { name: string; type: string }
}

function Spinner() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="w-8 h-8 border-2 border-t-transparent rounded-full animate-spin" style={{ borderColor: `${BRAND}40`, borderTopColor: BRAND }} />
    </div>
  )
}

function ErrorScreen({ message }: { message: string }) {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 p-6">
      <div className="text-center max-w-sm">
        <div className="text-4xl mb-4">🔗</div>
        <h1 className="text-xl font-bold text-gray-900 mb-2">Lien invalide</h1>
        <p className="text-gray-500 text-sm leading-relaxed mb-6">{message}</p>
        <p className="text-xs text-gray-400">Demandez à votre patron de vous renvoyer une invitation depuis son dashboard Fixlyy.</p>
      </div>
    </div>
  )
}

function ProgressDots({ step }: { step: number }) {
  return (
    <div className="flex items-center justify-center gap-2 mb-8">
      {[0, 1, 2].map(i => (
        <div
          key={i}
          className="rounded-full transition-all duration-300"
          style={{
            width: i === step ? 24 : 8, height: 8,
            background: i === step ? BRAND : '#e5e7eb',
          }}
        />
      ))}
    </div>
  )
}

export default function JoinTeam() {
  const token = window.location.pathname.split('/join/')[1]?.split('/')[0]

  const [status, setStatus] = useState<'loading' | 'error' | 'form' | 'done'>('loading')
  const [errorMsg, setErrorMsg] = useState('')
  const [data, setData] = useState<InvitationData | null>(null)
  const [step, setStep] = useState(0)

  // Form state — persisted in sessionStorage across refreshes
  const [lastName, setLastName] = useState(() => sessionStorage.getItem(`join_${token}_ln`) ?? '')
  const [email, setEmail] = useState(() => sessionStorage.getItem(`join_${token}_email`) ?? '')
  const [hours, setHours] = useState<Hours>(() => {
    try { return JSON.parse(sessionStorage.getItem(`join_${token}_hours`) ?? 'null') || DEFAULT_HOURS }
    catch { return DEFAULT_HOURS }
  })
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    if (!token) { setErrorMsg('Token manquant.'); setStatus('error'); return }

    fetch(`${SUPABASE_URL}/functions/v1/accept-team-invitation?token=${token}`)
      .then(r => r.json())
      .then(d => {
        if (!d.ok) { setErrorMsg(d.error || 'Lien invalide.'); setStatus('error'); return }
        setData(d)
        setStatus('form')
      })
      .catch(() => { setErrorMsg('Impossible de charger votre invitation.'); setStatus('error') })
  }, [token])

  // Persist to sessionStorage on change
  useEffect(() => { sessionStorage.setItem(`join_${token}_ln`, lastName) }, [lastName])
  useEffect(() => { sessionStorage.setItem(`join_${token}_email`, email) }, [email])
  useEffect(() => { sessionStorage.setItem(`join_${token}_hours`, JSON.stringify(hours)) }, [hours])

  const toggleDay = (key: string) =>
    setHours(h => ({ ...h, [key]: { ...h[key], enabled: !h[key].enabled } }))

  const setDayTime = (key: string, field: 'from' | 'to', val: string) =>
    setHours(h => ({ ...h, [key]: { ...h[key], [field]: val } }))

  const submit = async () => {
    setSubmitting(true)
    try {
      const res = await fetch(`${SUPABASE_URL}/functions/v1/complete-team-member-profile`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, last_name: lastName.trim(), email: email.trim() || undefined, hours_json: hours }),
      })
      const d = await res.json()
      if (!d.ok) throw new Error(d.error || 'Erreur inattendue')
      // Nettoyer sessionStorage
      sessionStorage.removeItem(`join_${token}_ln`)
      sessionStorage.removeItem(`join_${token}_email`)
      sessionStorage.removeItem(`join_${token}_hours`)
      setStatus('done')
    } catch (e: any) {
      alert(e.message)
    } finally {
      setSubmitting(false)
    }
  }

  if (status === 'loading') return <Spinner />
  if (status === 'error') return <ErrorScreen message={errorMsg} />

  if (status === 'done') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 p-6">
        <div className="text-center max-w-sm">
          <div className="w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4 text-3xl" style={{ background: `${BRAND}15` }}>
            ✅
          </div>
          <h1 className="text-xl font-bold text-gray-900 mb-2">Profil activé !</h1>
          <p className="text-gray-500 text-sm leading-relaxed">
            Vous allez maintenant recevoir vos appels qualifiés par SMS.
            Votre patron a été notifié que vous avez rejoint l'équipe.
          </p>
        </div>
      </div>
    )
  }

  const { invitation, company } = data!
  const firstName = invitation.first_name

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      {/* Header */}
      <div className="px-5 pt-8 pb-2">
        <div className="flex items-center gap-2 mb-1">
          <div className="w-7 h-7 rounded-lg flex items-center justify-center text-white text-xs font-bold flex-shrink-0" style={{ background: BRAND }}>
            {(company.name[0] || 'F').toUpperCase()}
          </div>
          <span className="text-sm font-semibold text-gray-700">{company.name}</span>
        </div>
        <p className="text-xs text-gray-400">Fixlyy — Secrétaire IA pour artisans</p>
      </div>

      <div className="flex-1 px-5 pb-8 flex flex-col max-w-md mx-auto w-full">
        <ProgressDots step={step} />

        {/* Écran 1 — Identité */}
        {step === 0 && (
          <div className="flex flex-col gap-5 animate-in fade-in duration-200">
            <div>
              <h1 className="text-2xl font-black text-gray-900">Bonjour {firstName} 👋</h1>
              <p className="text-sm text-gray-500 mt-1 leading-relaxed">
                {company.name} vous a ajouté à son équipe. Complétez votre profil pour recevoir vos appels.
              </p>
            </div>

            <div>
              <label className="block text-xs font-semibold text-gray-500 mb-1.5">Nom de famille *</label>
              <input
                autoFocus
                value={lastName}
                onChange={e => setLastName(e.target.value)}
                placeholder="Dupont"
                className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm outline-none focus:border-[#2850c8] transition-colors bg-white"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-gray-500 mb-1.5">
                Email <span className="font-normal text-gray-300">(optionnel)</span>
              </label>
              <input
                value={email}
                onChange={e => setEmail(e.target.value)}
                type="email"
                placeholder="jean.dupont@exemple.fr"
                className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm outline-none focus:border-[#2850c8] transition-colors bg-white"
              />
              <p className="text-xs text-gray-300 mt-1.5">Pour recevoir vos résumés d'appels par email en plus du SMS</p>
            </div>

            <button
              disabled={!lastName.trim()}
              onClick={() => setStep(1)}
              className="w-full py-4 rounded-xl font-bold text-white mt-2 transition-all disabled:opacity-40"
              style={{ background: BRAND }}
            >
              Continuer →
            </button>
          </div>
        )}

        {/* Écran 2 — Disponibilités */}
        {step === 1 && (
          <div className="flex flex-col gap-4 animate-in fade-in duration-200">
            <div>
              <h1 className="text-2xl font-black text-gray-900">Vos disponibilités</h1>
              <p className="text-sm text-gray-500 mt-1">Quand peut-on vous joindre ? Vous pourrez modifier ça à tout moment.</p>
            </div>

            <div className="flex flex-col gap-2">
              {DAYS.map(({ key, label }) => (
                <div key={key} className="flex items-center gap-3 bg-white rounded-xl px-4 py-3 border border-gray-100">
                  <button
                    onClick={() => toggleDay(key)}
                    className={`w-10 text-xs font-bold rounded-lg py-1 transition-all ${
                      hours[key].enabled ? 'text-white' : 'text-gray-400 bg-gray-100'
                    }`}
                    style={hours[key].enabled ? { background: BRAND } : {}}
                  >
                    {label}
                  </button>

                  {hours[key].enabled ? (
                    <div className="flex items-center gap-2 flex-1">
                      <input
                        type="time"
                        value={hours[key].from}
                        onChange={e => setDayTime(key, 'from', e.target.value)}
                        className="flex-1 text-xs border border-gray-200 rounded-lg px-2 py-1.5 outline-none focus:border-[#2850c8]"
                      />
                      <span className="text-xs text-gray-300">→</span>
                      <input
                        type="time"
                        value={hours[key].to}
                        onChange={e => setDayTime(key, 'to', e.target.value)}
                        className="flex-1 text-xs border border-gray-200 rounded-lg px-2 py-1.5 outline-none focus:border-[#2850c8]"
                      />
                    </div>
                  ) : (
                    <span className="text-xs text-gray-300 flex-1">Fermé</span>
                  )}
                </div>
              ))}
            </div>

            <div className="flex gap-3 mt-2">
              <button onClick={() => setStep(0)} className="flex-1 py-3.5 rounded-xl text-sm font-medium border border-gray-200 text-gray-500">
                ← Retour
              </button>
              <button
                onClick={() => setStep(2)}
                className="flex-1 py-3.5 rounded-xl font-bold text-white transition-all"
                style={{ background: BRAND }}
              >
                Continuer →
              </button>
            </div>
          </div>
        )}

        {/* Écran 3 — Récapitulatif */}
        {step === 2 && (
          <div className="flex flex-col gap-5 animate-in fade-in duration-200">
            <div>
              <h1 className="text-2xl font-black text-gray-900">Tout est prêt 🎉</h1>
              <p className="text-sm text-gray-500 mt-1">Vérifiez vos informations avant d'activer votre profil.</p>
            </div>

            <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
              <div className="px-4 py-3 border-b border-gray-50">
                <p className="text-xs text-gray-400 font-semibold uppercase tracking-wider mb-0.5">Votre profil</p>
                <p className="text-sm font-bold text-gray-900">{firstName} {lastName}</p>
                {email && <p className="text-xs text-gray-400 mt-0.5">{email}</p>}
                <p className="text-xs text-gray-400">{invitation.phone}</p>
              </div>
              {invitation.suggested_skills.length > 0 && (
                <div className="px-4 py-3 border-b border-gray-50">
                  <p className="text-xs text-gray-400 font-semibold uppercase tracking-wider mb-2">Compétences</p>
                  <div className="flex flex-wrap gap-1.5">
                    {invitation.suggested_skills.map(s => (
                      <span key={s} className="text-xs px-2.5 py-1 rounded-full font-medium text-white" style={{ background: BRAND }}>
                        {s}
                      </span>
                    ))}
                  </div>
                </div>
              )}
              <div className="px-4 py-3">
                <p className="text-xs text-gray-400 font-semibold uppercase tracking-wider mb-2">Disponibilités</p>
                <div className="flex flex-col gap-1">
                  {DAYS.filter(d => hours[d.key].enabled).map(({ key, label }) => (
                    <div key={key} className="flex items-center justify-between text-xs">
                      <span className="text-gray-500 w-8">{label}</span>
                      <span className="text-gray-700">{hours[key].from} – {hours[key].to}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <div className="flex gap-3">
              <button onClick={() => setStep(1)} className="flex-1 py-3.5 rounded-xl text-sm font-medium border border-gray-200 text-gray-500">
                ← Modifier
              </button>
              <button
                onClick={submit}
                disabled={submitting}
                className="flex-1 py-3.5 rounded-xl font-bold text-white text-sm transition-all disabled:opacity-60"
                style={{ background: BRAND }}
              >
                {submitting ? (
                  <span className="flex items-center justify-center gap-2">
                    <span className="w-3.5 h-3.5 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                    Activation…
                  </span>
                ) : 'C\'est parti, j\'active mon profil 🚀'}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
