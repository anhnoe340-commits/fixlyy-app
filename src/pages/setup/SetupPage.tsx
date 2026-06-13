import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import Step4Number from '@/pages/onboarding-v3/Step4Number'
import Step5Forwarding from '@/pages/onboarding-v3/Step5Forwarding'
import Step6Install from '@/pages/onboarding-v3/Step6Install'

const BRAND = '#3B5BF5'
const SB_URL = import.meta.env.VITE_SUPABASE_URL as string

const STEP_LABELS = ['Liaison', 'Numéro', 'Renvoi', 'Installation', 'Récap']
const TOTAL = 5

function toE164(raw: string): string {
  const digits = raw.replace(/\D/g, '')
  if (digits.startsWith('33') && digits.length >= 11) return `+${digits}`
  if (digits.startsWith('0')) return `+33${digits.slice(1)}`
  return `+${digits}`
}

// ─── Step 1 : OTP + claim + attente provisioning ──────────────────────────────

type Phase1 = 'phone' | 'otp' | 'claiming' | 'provisioning' | 'no_claim' | 'no_claim_email'

interface Step1Props {
  onDone: (userId: string, fixlyyNumber: string, artisanPhone: string) => void
}

function SetupStep1({ onDone }: Step1Props) {
  const [phase,   setPhase]   = useState<Phase1>('phone')
  const [phone,   setPhone]   = useState('')
  const [email,   setEmail]   = useState('')
  const [otp,     setOtp]     = useState('')
  const [e164,    setE164]    = useState('')
  const [error,   setError]   = useState('')
  const [loading, setLoading] = useState(false)
  const [userId,  setUserId]  = useState('')
  const [dots,    setDots]    = useState(1)

  // Animation de points
  useEffect(() => {
    if (phase !== 'claiming' && phase !== 'provisioning') return
    const t = setInterval(() => setDots(d => (d % 3) + 1), 600)
    return () => clearInterval(t)
  }, [phase])

  // Polling provisioning
  useEffect(() => {
    if (phase !== 'provisioning' || !userId) return
    const iv = setInterval(async () => {
      const { data } = await supabase
        .from('profiles')
        .select('provisioning_status, twilio_number, phone')
        .eq('id', userId)
        .single()
      if (data?.provisioning_status === 'done' && data?.twilio_number) {
        clearInterval(iv)
        onDone(userId, data.twilio_number, data.phone ?? e164)
      }
    }, 2000)
    return () => clearInterval(iv)
  }, [phase, userId])

  async function sendOtp() {
    setError('')
    const normalized = toE164(phone.trim())
    if (!/^\+[1-9]\d{7,14}$/.test(normalized)) {
      setError('Numéro invalide — format attendu : 06 12 34 56 78')
      return
    }
    setLoading(true)
    setE164(normalized)
    const { error: otpErr } = await supabase.auth.signInWithOtp({ phone: normalized })
    setLoading(false)
    if (otpErr) { setError(otpErr.message); return }
    setPhase('otp')
  }

  async function verifyOtp() {
    setError('')
    setLoading(true)
    const { data, error: verifyErr } = await supabase.auth.verifyOtp({
      phone: e164, token: otp.trim(), type: 'sms',
    })
    setLoading(false)
    if (verifyErr || !data.user) {
      setError(verifyErr?.message ?? 'Code invalide')
      return
    }
    const uid   = data.user.id
    const token = data.session?.access_token ?? ''
    setUserId(uid)
    setPhase('claiming')
    await claimProfile(uid, token, null)
  }

  async function claimWithEmail() {
    setError('')
    if (!email.trim() || !userId) return
    setLoading(true)
    const { data: { session } } = await supabase.auth.getSession()
    setLoading(false)
    setPhase('claiming')
    await claimProfile(userId, session?.access_token ?? '', email.trim().toLowerCase())
  }

  async function claimProfile(uid: string, token: string, fallbackEmail: string | null) {
    const { data: { session } } = await supabase.auth.getSession()
    const accessToken = token || session?.access_token || ''

    const res = await fetch(`${SB_URL}/functions/v1/claim-prospection-profile`, {
      method:  'POST',
      headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
      body:    JSON.stringify(fallbackEmail ? { email: fallbackEmail } : {}),
    })

    const result = await res.json().catch(() => ({}))

    if (!res.ok) {
      if (result.error === 'no_pending_claim') {
        setPhase('no_claim')
      } else {
        setError(result.error ?? `Erreur ${res.status}`)
        setPhase('otp')
      }
      return
    }

    if (result.already_claimed) {
      if (result.provisioning === 'done' && result.twilio_number) {
        const { data: profile } = await supabase
          .from('profiles').select('phone').eq('id', uid).single()
        onDone(uid, result.twilio_number, profile?.phone ?? e164)
      } else {
        setUserId(uid)
        setPhase('provisioning')
      }
      return
    }

    setPhase('provisioning')
  }

  // ── Saisie du numéro ──────────────────────────────────────────────────────
  if (phase === 'phone') return (
    <div className="flex flex-col gap-6">
      <div>
        <h2 className="text-2xl font-bold text-white mb-1">Activez votre compte</h2>
        <p className="text-sm" style={{ color: 'rgba(148,163,184,0.8)' }}>
          Entrez le numéro utilisé lors de votre paiement pour lier votre abonnement.
        </p>
      </div>
      <div className="v3-card rounded-2xl p-5">
        <label className="text-xs font-semibold uppercase tracking-widest mb-2 block"
          style={{ color: 'rgba(148,163,184,0.7)' }}>Numéro de téléphone</label>
        <input
          type="tel" inputMode="tel" value={phone}
          onChange={e => setPhone(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && !loading && sendOtp()}
          placeholder="06 12 34 56 78"
          className="w-full bg-transparent text-white text-lg font-medium border-0 outline-none placeholder:opacity-30"
        />
      </div>
      {error && <p className="text-sm text-red-400">{error}</p>}
      <button onClick={sendOtp} disabled={loading || !phone.trim()}
        className="w-full py-5 rounded-2xl text-white text-base font-bold transition-all active:scale-95 disabled:opacity-50"
        style={{ background: loading ? 'rgba(59,91,245,0.5)' : `linear-gradient(135deg, ${BRAND}, #6366f1)` }}>
        {loading ? 'Envoi en cours…' : 'Recevoir le code SMS →'}
      </button>
    </div>
  )

  // ── Saisie du code OTP ────────────────────────────────────────────────────
  if (phase === 'otp') return (
    <div className="flex flex-col gap-6">
      <div>
        <h2 className="text-2xl font-bold text-white mb-1">Code SMS reçu ?</h2>
        <p className="text-sm" style={{ color: 'rgba(148,163,184,0.8)' }}>
          Saisissez le code envoyé au <span className="text-white font-medium">{e164}</span>.
        </p>
      </div>
      <div className="v3-card rounded-2xl p-5">
        <input
          type="tel" inputMode="numeric" maxLength={6} value={otp}
          onChange={e => setOtp(e.target.value.replace(/\D/g, ''))}
          onKeyDown={e => e.key === 'Enter' && !loading && otp.length >= 4 && verifyOtp()}
          placeholder="123456"
          className="w-full bg-transparent text-white text-3xl font-bold text-center border-0 outline-none tracking-widest placeholder:opacity-20"
        />
      </div>
      {error && <p className="text-sm text-red-400 text-center">{error}</p>}
      <button onClick={verifyOtp} disabled={loading || otp.length < 4}
        className="w-full py-5 rounded-2xl text-white text-base font-bold transition-all active:scale-95 disabled:opacity-50"
        style={{ background: loading ? 'rgba(59,91,245,0.5)' : `linear-gradient(135deg, ${BRAND}, #6366f1)` }}>
        {loading ? 'Vérification…' : 'Confirmer le code →'}
      </button>
      <button onClick={() => { setPhase('phone'); setOtp(''); setError('') }}
        className="text-sm text-center underline underline-offset-2"
        style={{ color: 'rgba(148,163,184,0.5)' }}>
        Changer de numéro
      </button>
    </div>
  )

  // ── Liaison en cours ──────────────────────────────────────────────────────
  if (phase === 'claiming') return (
    <div className="flex flex-col items-center gap-8 py-6">
      <div className="relative w-24 h-24">
        <div className="absolute inset-0 rounded-full animate-ping opacity-20" style={{ background: BRAND }} />
        <div className="relative w-24 h-24 rounded-full flex items-center justify-center text-4xl"
          style={{ background: 'rgba(59,91,245,0.15)', border: '2px solid rgba(59,91,245,0.4)' }}>🔗</div>
      </div>
      <div className="text-center">
        <h2 className="text-xl font-bold text-white mb-2">Liaison en cours{'.'.repeat(dots)}</h2>
        <p className="text-sm" style={{ color: 'rgba(148,163,184,0.8)' }}>
          On rattache votre abonnement à votre compte.
        </p>
      </div>
    </div>
  )

  // ── Provisioning en cours ─────────────────────────────────────────────────
  if (phase === 'provisioning') return (
    <div className="flex flex-col items-center gap-8 py-6">
      <div className="relative w-24 h-24">
        <div className="absolute inset-0 rounded-full animate-ping opacity-20" style={{ background: BRAND }} />
        <div className="relative w-24 h-24 rounded-full flex items-center justify-center text-4xl"
          style={{ background: 'rgba(59,91,245,0.15)', border: '2px solid rgba(59,91,245,0.4)' }}>📞</div>
      </div>
      <div className="text-center">
        <h2 className="text-xl font-bold text-white mb-2">Création de Mia{'.'.repeat(dots)}</h2>
        <p className="text-sm" style={{ color: 'rgba(148,163,184,0.8)' }}>
          Généralement moins de 30 secondes.
        </p>
      </div>
      <div className="w-full v3-card rounded-2xl px-6 py-4 flex flex-col gap-3">
        {[
          { label: 'Paiement confirmé', done: true },
          { label: 'Compte lié',        done: true },
          { label: 'Numéro Mia en cours d\'attribution', done: false },
        ].map((item, i) => (
          <div key={i} className="flex items-center gap-3">
            <div className="w-5 h-5 flex-shrink-0 flex items-center justify-center">
              {item.done
                ? <div className="w-4 h-4 rounded-full flex items-center justify-center text-[10px] font-bold text-white" style={{ background: '#10B981' }}>✓</div>
                : <div className="w-3 h-3 rounded-full animate-pulse" style={{ background: BRAND, animationDelay: `${i * 0.3}s` }} />
              }
            </div>
            <span className="text-sm" style={{ color: item.done ? '#10B981' : 'rgba(148,163,184,0.7)' }}>
              {item.label}
            </span>
          </div>
        ))}
      </div>
    </div>
  )

  // ── Abonnement introuvable + fallback email ───────────────────────────────
  if (phase === 'no_claim_email') return (
    <div className="flex flex-col gap-6">
      <div>
        <h2 className="text-2xl font-bold text-white mb-1">Essayons avec votre email</h2>
        <p className="text-sm" style={{ color: 'rgba(148,163,184,0.8)' }}>
          Entrez l'adresse email utilisée lors de votre paiement Stripe.
        </p>
      </div>
      <div className="v3-card rounded-2xl p-5">
        <label className="text-xs font-semibold uppercase tracking-widest mb-2 block"
          style={{ color: 'rgba(148,163,184,0.7)' }}>Adresse email</label>
        <input
          type="email" inputMode="email" value={email}
          onChange={e => setEmail(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && !loading && claimWithEmail()}
          placeholder="vous@exemple.fr"
          className="w-full bg-transparent text-white text-base border-0 outline-none placeholder:opacity-30"
        />
      </div>
      {error && <p className="text-sm text-red-400">{error}</p>}
      <button onClick={claimWithEmail} disabled={loading || !email.trim()}
        className="w-full py-5 rounded-2xl text-white text-base font-bold transition-all active:scale-95 disabled:opacity-50"
        style={{ background: loading ? 'rgba(59,91,245,0.5)' : `linear-gradient(135deg, ${BRAND}, #6366f1)` }}>
        {loading ? 'Recherche…' : 'Rechercher mon abonnement →'}
      </button>
      <button onClick={() => { setPhase('phone'); setError('') }}
        className="text-sm text-center underline underline-offset-2"
        style={{ color: 'rgba(148,163,184,0.5)' }}>
        ← Réessayer avec un autre numéro
      </button>
    </div>
  )

  // ── Abonnement introuvable ─────────────────────────────────────────────────
  return (
    <div className="flex flex-col items-center gap-6 py-6 text-center">
      <div className="w-16 h-16 rounded-full flex items-center justify-center text-3xl"
        style={{ background: 'rgba(239,68,68,0.12)', border: '2px solid rgba(239,68,68,0.3)' }}>❗</div>
      <div>
        <h2 className="text-xl font-bold text-white mb-2">Abonnement introuvable</h2>
        <p className="text-sm" style={{ color: 'rgba(148,163,184,0.8)' }}>
          Aucun abonnement trouvé pour le numéro{' '}
          <span className="text-white font-medium">{e164}</span>.
        </p>
        <p className="text-xs mt-2" style={{ color: 'rgba(148,163,184,0.6)' }}>
          Vérifiez que c'est bien le numéro entré lors de votre paiement.
        </p>
      </div>
      <button
        onClick={() => setPhase('no_claim_email')}
        className="w-full py-4 rounded-xl text-white text-sm font-bold"
        style={{ background: BRAND }}>
        Essayer avec mon email →
      </button>
      <button onClick={() => { setPhase('phone'); setOtp(''); setError(''); setPhone('') }}
        className="text-sm underline underline-offset-2"
        style={{ color: 'rgba(148,163,184,0.5)' }}>
        Changer de numéro
      </button>
      <a href="mailto:support@fixlyy.fr" className="text-sm underline underline-offset-2"
        style={{ color: 'rgba(148,163,184,0.5)' }}>
        Contacter le support
      </a>
    </div>
  )
}

// ─── Step 5 : Récap abonnement ────────────────────────────────────────────────

function SetupRecap({ userId, onDone }: { userId: string; onDone: () => void }) {
  const [trialEnd, setTrialEnd] = useState<string | null>(null)
  const [plan,     setPlan]     = useState('pro')

  useEffect(() => {
    supabase.from('profiles')
      .select('subscription_trial_end, subscription_plan')
      .eq('id', userId)
      .single()
      .then(({ data }) => {
        if (data?.subscription_trial_end) setTrialEnd(data.subscription_trial_end)
        if (data?.subscription_plan)      setPlan(data.subscription_plan)
      })
  }, [userId])

  const planPrices: Record<string, number> = { solo: 97, pro: 197, max: 347 }
  const price = planPrices[plan] ?? 197
  const trialDate = trialEnd
    ? new Date(trialEnd).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' })
    : null

  return (
    <div className="flex flex-col gap-7">
      <div className="text-center">
        <div className="w-20 h-20 rounded-full mx-auto mb-4 flex items-center justify-center text-4xl"
          style={{ background: 'rgba(16,185,129,0.12)', border: '2px solid rgba(16,185,129,0.3)' }}>🎉</div>
        <h2 className="text-2xl font-bold text-white mb-1">Vous êtes opérationnel !</h2>
        <p className="text-sm" style={{ color: 'rgba(148,163,184,0.85)' }}>
          Mia répond à vos clients dès maintenant.
        </p>
      </div>

      <div className="v3-card rounded-2xl p-5 flex flex-col gap-3">
        {[
          { icon: '📞', label: 'Numéro Mia dédié attribué' },
          { icon: '🔄', label: "Renvoi d'appel configuré" },
          { icon: '📩', label: 'SMS récap en moins de 30 secondes' },
          { icon: '🔒', label: 'CB enregistrée · essai gratuit 7 jours' },
        ].map(item => (
          <div key={item.label} className="flex items-center gap-3">
            <span className="text-base flex-shrink-0">{item.icon}</span>
            <span className="text-sm text-white/80">{item.label}</span>
          </div>
        ))}
      </div>

      <div className="rounded-2xl p-4" style={{ background: 'rgba(59,91,245,0.08)', border: '1px solid rgba(59,91,245,0.25)' }}>
        <p className="text-xs font-semibold uppercase tracking-widest mb-2"
          style={{ color: 'rgba(148,163,184,0.6)' }}>Votre abonnement</p>
        <p className="text-white font-semibold text-sm mb-1 capitalize">Plan {plan}</p>
        {trialDate ? (
          <p className="text-xs" style={{ color: 'rgba(148,163,184,0.7)' }}>
            Essai gratuit jusqu'au <strong className="text-white">{trialDate}</strong>,<br />
            puis <strong className="text-white">{price}€/mois</strong>
          </p>
        ) : (
          <p className="text-xs" style={{ color: 'rgba(148,163,184,0.7)' }}>
            <strong className="text-white">{price}€/mois</strong>
          </p>
        )}
      </div>

      <button onClick={onDone}
        className="w-full py-4 rounded-xl text-white text-sm font-bold"
        style={{ background: `linear-gradient(135deg, ${BRAND}, #6366f1)` }}>
        Accéder au tableau de bord →
      </button>
    </div>
  )
}

// ─── Page principale ──────────────────────────────────────────────────────────

interface SetupState {
  step:         number
  userId:       string | null
  fixlyyNumber: string | null
  artisanPhone: string | null
}

export default function SetupPage() {
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null)
  const [state, setState] = useState<SetupState>({
    step: 1, userId: null, fixlyyNumber: null, artisanPhone: null,
  })

  useEffect(() => {
    const handler = (e: any) => { e.preventDefault(); setDeferredPrompt(e) }
    window.addEventListener('beforeinstallprompt', handler)
    return () => window.removeEventListener('beforeinstallprompt', handler)
  }, [])

  // Reprise si déjà authentifié
  useEffect(() => {
    supabase.auth.getUser().then(async ({ data: { user } }) => {
      if (!user) return
      const { data: p } = await supabase
        .from('profiles')
        .select('provisioning_status, twilio_number, onboarding_completed, phone')
        .eq('id', user.id)
        .maybeSingle()

      if (!p) return
      if (p.onboarding_completed) { window.location.replace('/'); return }
      if (p.provisioning_status === 'done' && p.twilio_number) {
        setState({ step: 2, userId: user.id, fixlyyNumber: p.twilio_number, artisanPhone: p.phone ?? null })
      }
    })
  }, [])

  function next(patch: Partial<SetupState> = {}) {
    setState(s => ({ ...s, ...patch, step: s.step + 1 }))
  }

  const progressPct = ((state.step - 1) / (TOTAL - 1)) * 100

  return (
    <div className="min-h-screen dashboard-bg flex flex-col">

      {/* Header */}
      <div className="flex items-center justify-between px-6 pt-6 pb-4">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-lg flex items-center justify-center text-white font-black text-sm"
            style={{ background: BRAND }}>F</div>
          <span className="font-bold text-white text-sm">Fixlyy</span>
        </div>
        <span className="text-xs font-medium" style={{ color: 'rgba(148,163,184,0.6)' }}>
          Étape {state.step}/{TOTAL} — {STEP_LABELS[state.step - 1]}
        </span>
      </div>

      {/* Barre de progression */}
      <div className="px-6 mb-6">
        <div className="h-1 rounded-full" style={{ background: 'rgba(255,255,255,0.06)' }}>
          <div className="h-1 rounded-full transition-all duration-500"
            style={{ background: `linear-gradient(90deg, ${BRAND}, #6366f1)`, width: `${progressPct}%` }} />
        </div>
      </div>

      {/* Contenu */}
      <div className="flex-1 overflow-y-auto px-6 pb-8">
        {state.step === 1 && (
          <SetupStep1
            onDone={(userId, fixlyyNumber, artisanPhone) =>
              setState(s => ({ ...s, step: 2, userId, fixlyyNumber, artisanPhone }))
            }
          />
        )}
        {state.step === 2 && state.userId && state.fixlyyNumber && (
          <Step4Number
            userId={state.userId}
            fixlyyNumber={state.fixlyyNumber}
            artisanPhone={state.artisanPhone ?? ''}
            onDone={() => next()}
          />
        )}
        {state.step === 3 && state.userId && (
          <Step5Forwarding
            userId={state.userId}
            fixlyyNumber={state.fixlyyNumber}
            onDone={() => next()}
          />
        )}
        {state.step === 4 && state.userId && (
          <Step6Install
            userId={state.userId}
            deferredPrompt={deferredPrompt}
            onDone={() => next()}
          />
        )}
        {state.step === 5 && state.userId && (
          <SetupRecap
            userId={state.userId}
            onDone={() => window.location.replace('/')}
          />
        )}
      </div>
    </div>
  )
}
