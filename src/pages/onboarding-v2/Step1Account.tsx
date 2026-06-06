import { useState, useRef, useEffect } from 'react'
import { supabase } from '@/lib/supabase'

const BRAND = '#2850c8'

const TRADES = [
  'Plomberie / Chauffage',
  'Électricité',
  'Menuiserie / Charpenterie',
  'Peinture / Décoration',
  'Serrurerie',
  'Jardinage / Paysagisme',
  'Multi-services',
  'Autre',
]

function normalizePhone(raw: string): string {
  const digits = raw.replace(/\D/g, '')
  if (digits.startsWith('33') && digits.length === 11) return '+' + digits
  if (digits.startsWith('0') && digits.length === 10) return '+33' + digits.slice(1)
  if (digits.length === 9) return '+33' + digits
  return raw
}

function isValidFrMobile(e164: string): boolean {
  return /^\+33[67]\d{8}$/.test(e164)
}

function generateResumeToken(): string {
  return crypto.randomUUID()
}

interface Props {
  onDone: (userId: string) => void
}

export default function Step1Account({ onDone }: Props) {
  const [phase, setPhase] = useState<'form' | 'otp'>('form')
  const [isLogin, setIsLogin] = useState(false)
  const [fullName, setFullName] = useState('')
  const [phone, setPhone] = useState('')
  const [trade, setTrade] = useState(TRADES[0])
  const [companyName, setCompanyName] = useState('')
  const [companyNameTouched, setCompanyNameTouched] = useState(false)
  const [otp, setOtp] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [resendCooldown, setResendCooldown] = useState(0)
  const otpRef = useRef<HTMLInputElement>(null)
  const cooldownRef = useRef<ReturnType<typeof setInterval> | null>(null)

  useEffect(() => {
    if (phase === 'otp') {
      setTimeout(() => otpRef.current?.focus(), 100)
      startCooldown()
    }
  }, [phase])

  useEffect(() => () => { if (cooldownRef.current) clearInterval(cooldownRef.current) }, [])

  // Pré-remplit company_name si l'utilisateur n'a pas encore touché au champ
  useEffect(() => {
    if (!companyNameTouched && fullName.trim()) {
      const firstName = fullName.trim().split(' ')[0]
      const tradeShort = trade.split('/')[0].trim()
      setCompanyName(`${tradeShort} ${firstName}`)
    }
  }, [fullName, trade, companyNameTouched])

  function startCooldown() {
    setResendCooldown(30)
    cooldownRef.current = setInterval(() => {
      setResendCooldown(s => {
        if (s <= 1) { clearInterval(cooldownRef.current!); return 0 }
        return s - 1
      })
    }, 1000)
  }

  const e164 = normalizePhone(phone)
  const phoneValid = isValidFrMobile(e164)

  async function handleSendOtp() {
    if (!phoneValid) return
    if (!isLogin && !fullName.trim()) return
    setLoading(true); setError('')
    try {
      const { error: otpError } = await supabase.auth.signInWithOtp({
        phone: e164,
        options: { channel: 'sms' },
      })
      if (otpError) throw otpError
      setPhase('otp')
    } catch (e: any) {
      setError(e.message || 'Impossible d\'envoyer le code. Vérifiez votre numéro.')
    } finally {
      setLoading(false)
    }
  }

  async function handleVerifyOtp() {
    if (otp.length !== 6) return
    setLoading(true); setError('')
    try {
      const { data, error: verifyError } = await supabase.auth.verifyOtp({
        phone: e164,
        token: otp,
        type: 'sms',
      })
      if (verifyError) throw verifyError
      if (!data.user) throw new Error('Authentification échouée')

      const userId = data.user.id

      if (isLogin) {
        // Reconnexion : pas d'upsert, on laisse App.tsx router selon le profil existant
        onDone(userId)
        return
      }

      const resumeToken = generateResumeToken()
      const firstName = fullName.trim().split(' ')[0]

      // Upsert du profil avec les infos de base et les valeurs par défaut V2
      const { error: upsertError } = await supabase.from('profiles').upsert({
        id: userId,
        phone: e164,
        full_name: fullName.trim(),
        company_name: companyName.trim() || `${trade.split('/')[0].trim()} ${firstName}`,
        company_type: trade,
        assistant_name: 'Mia',
        assistant_voice: 'female-warm',
        resume_token: resumeToken,
        onboarding_step: 2,
        trial_status: 'active',
        trial_ends_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
        greeting_open: `Bonjour, vous êtes bien chez ${firstName}. Je suis Mia, son assistante. Il est actuellement en intervention. Comment puis-je vous aider ?`,
        greeting_closed: `Bonjour, vous êtes bien chez ${firstName}. Nous sommes actuellement fermés. Je suis Mia, je peux prendre votre message et ${firstName} vous rappellera dès que possible.`,
      })
      if (upsertError) throw upsertError

      onDone(userId)
    } catch (e: any) {
      if (e.message?.includes('invalid') || e.message?.includes('expired')) {
        setError('Code incorrect ou expiré. Vérifiez le SMS ou demandez un nouveau code.')
      } else {
        setError(e.message || 'Erreur lors de la vérification.')
      }
    } finally {
      setLoading(false)
    }
  }

  async function handleResend() {
    if (resendCooldown > 0) return
    setLoading(true); setError('')
    try {
      const { error: otpError } = await supabase.auth.signInWithOtp({
        phone: e164,
        options: { channel: 'sms' },
      })
      if (otpError) throw otpError
      startCooldown()
    } catch (e: any) {
      setError('Impossible de renvoyer le code.')
    } finally {
      setLoading(false)
    }
  }

  // ── Phase OTP ────────────────────────────────────────────────────────────────
  if (phase === 'otp') {
    return (
      <div className="max-w-sm mx-auto glass-light rounded-2xl p-6">
      <div className="flex flex-col gap-6">
        <div>
          <h2 className="text-2xl font-bold text-gray-900 mb-1">Code de vérification</h2>
          <p className="text-sm text-gray-500">
            On a envoyé un code à 6 chiffres au <span className="font-medium text-gray-700">{phone}</span>
          </p>
        </div>

        <div className="flex flex-col gap-2">
          <label className="text-xs font-semibold text-gray-500">Code reçu par SMS</label>
          <input
            ref={otpRef}
            type="text"
            inputMode="numeric"
            pattern="[0-9]*"
            maxLength={6}
            value={otp}
            onChange={e => {
              const v = e.target.value.replace(/\D/g, '')
              setOtp(v)
              if (v.length === 6) setTimeout(() => handleVerifyOtp(), 50)
            }}
            placeholder="123456"
            className="w-full border border-gray-200 rounded-xl px-4 py-4 text-2xl font-bold text-center tracking-[0.5em] outline-none focus:border-[#2850c8] transition-colors"
          />
        </div>

        {error && (
          <div className="px-4 py-3 bg-red-50 border border-red-100 rounded-xl text-sm text-red-600">
            {error}
          </div>
        )}

        <button
          onClick={handleVerifyOtp}
          disabled={otp.length !== 6 || loading}
          className="w-full py-4 rounded-xl text-white text-sm font-semibold transition-all disabled:opacity-40 flex items-center justify-center gap-2"
          style={{ background: `linear-gradient(135deg, ${BRAND}, #4070e8)` }}
        >
          {loading && <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />}
          Vérifier le code
        </button>

        <div className="text-center">
          <button
            onClick={handleResend}
            disabled={resendCooldown > 0 || loading}
            className="text-sm text-gray-400 disabled:opacity-50 hover:text-gray-600 transition-colors"
          >
            {resendCooldown > 0
              ? `Renvoyer le code dans ${resendCooldown}s`
              : 'Renvoyer le code'}
          </button>
        </div>

        <button onClick={() => { setPhase('form'); setOtp(''); setError('') }}
          className="text-sm text-center text-gray-400 hover:text-gray-600">
          ← Modifier mon numéro
        </button>
      </div>
      </div>
    )
  }

  // ── Phase login ──────────────────────────────────────────────────────────────
  if (isLogin) {
    return (
      <div className="max-w-sm mx-auto glass-light rounded-2xl p-6">
      <div className="flex flex-col gap-6">
        <div>
          <h2 className="text-2xl font-bold text-gray-900 mb-1">Bon retour !</h2>
          <p className="text-sm text-gray-500">Entrez votre numéro pour recevoir un code SMS.</p>
        </div>

        <div>
          <label className="text-xs font-semibold text-gray-500 block mb-1.5">Votre mobile pro</label>
          <input
            value={phone}
            onChange={e => setPhone(e.target.value)}
            placeholder="06 12 34 56 78"
            type="tel"
            inputMode="tel"
            autoFocus
            className={`w-full border rounded-xl px-4 py-3.5 text-sm outline-none transition-colors ${
              phone && !phoneValid
                ? 'border-red-300 focus:border-red-400'
                : 'border-gray-200 focus:border-[#2850c8]'
            }`}
          />
          {phone && !phoneValid && (
            <p className="text-xs text-red-500 mt-1">Format attendu : 06 ou 07.</p>
          )}
        </div>

        {error && (
          <div className="px-4 py-3 bg-red-50 border border-red-100 rounded-xl text-sm text-red-600">{error}</div>
        )}

        <button
          onClick={handleSendOtp}
          disabled={!phoneValid || loading}
          className="w-full py-4 rounded-xl text-white text-sm font-semibold transition-all disabled:opacity-40 flex items-center justify-center gap-2"
          style={{ background: `linear-gradient(135deg, ${BRAND}, #4070e8)` }}
        >
          {loading && <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />}
          Envoyer le code →
        </button>

        <p className="text-[11px] text-gray-400 text-center">
          Pas encore inscrit ?{' '}
          <button onClick={() => { setIsLogin(false); setPhone(''); setError('') }} className="underline">
            Créer un compte
          </button>
        </p>
      </div>
      </div>
    )
  }

  return (
    <div className="grid md:grid-cols-2 gap-12 items-center">

      {/* ── Colonne gauche — marketing (desktop uniquement) ── */}
      <div className="hidden md:flex flex-col gap-8 py-8">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg flex items-center justify-center text-white text-sm font-bold" style={{ background: BRAND }}>F</div>
          <span className="text-base font-semibold text-gray-800">Fixlyy</span>
        </div>
        <div>
          <h1 className="text-4xl font-bold text-gray-900 leading-tight mb-6">
            Votre secrétaire IA<br />en 10 minutes.
          </h1>
          <ul className="flex flex-col gap-4">
            {[
              'Répond 24h/24 à vos appels',
              'SMS récap en 30 secondes',
              'Sans engagement · 7 jours gratuits',
            ].map(item => (
              <li key={item} className="flex items-center gap-3 text-sm text-gray-600">
                <div className="w-5 h-5 rounded-full flex items-center justify-center text-white text-xs flex-shrink-0" style={{ background: BRAND }}>✓</div>
                {item}
              </li>
            ))}
          </ul>
        </div>
        <div className="inline-flex items-center gap-2 px-3 py-1.5 bg-white/60 border border-gray-100 rounded-xl text-xs text-gray-400 w-fit">
          🔒 Données sécurisées · Hébergé en Europe
        </div>
      </div>

      {/* ── Colonne droite — formulaire ── */}
      <div className="glass-light rounded-2xl p-6">
      <div className="flex flex-col gap-6">
      <div>
        <h2 className="text-2xl font-bold text-gray-900 mb-1">Activons Mia en 3 minutes</h2>
        <p className="text-sm text-gray-500">3 infos. Pas de carte bancaire.</p>
      </div>

      <div className="flex flex-col gap-4">
        <div>
          <label className="text-xs font-semibold text-gray-500 block mb-1.5">Votre nom complet</label>
          <input
            value={fullName}
            onChange={e => setFullName(e.target.value)}
            placeholder="Jean Dupont"
            autoFocus
            className="w-full border border-gray-200 rounded-xl px-4 py-3.5 text-sm outline-none focus:border-[#2850c8] transition-colors"
          />
        </div>

        <div>
          <label className="text-xs font-semibold text-gray-500 block mb-1.5">Votre métier</label>
          <select
            value={trade}
            onChange={e => setTrade(e.target.value)}
            className="w-full border border-gray-200 rounded-xl px-4 py-3.5 text-sm outline-none focus:border-[#2850c8] bg-white appearance-none"
          >
            {TRADES.map(t => <option key={t}>{t}</option>)}
          </select>
        </div>

        <div>
          <label className="text-xs font-semibold text-gray-500 block mb-1.5">Nom de votre activité</label>
          <input
            value={companyName}
            onChange={e => { setCompanyName(e.target.value); setCompanyNameTouched(true) }}
            placeholder="Ex : Plomberie Dupont"
            className="w-full border border-gray-200 rounded-xl px-4 py-3.5 text-sm outline-none focus:border-[#2850c8] transition-colors"
          />
          <p className="text-[11px] text-gray-400 mt-1">Mia se présentera avec ce nom</p>
        </div>

        <div>
          <label className="text-xs font-semibold text-gray-500 block mb-1.5">Votre mobile pro</label>
          <input
            value={phone}
            onChange={e => setPhone(e.target.value)}
            placeholder="06 12 34 56 78"
            type="tel"
            inputMode="tel"
            className={`w-full border rounded-xl px-4 py-3.5 text-sm outline-none transition-colors ${
              phone && !phoneValid
                ? 'border-red-300 focus:border-red-400'
                : 'border-gray-200 focus:border-[#2850c8]'
            }`}
          />
          {phone && !phoneValid && (
            <p className="text-xs text-red-500 mt-1">
              Ce numéro ne ressemble pas à un mobile français. Format attendu : 06 ou 07.
            </p>
          )}
          <p className="text-[11px] text-gray-400 mt-1">On vous envoie les résumés d'appel ici</p>
        </div>
      </div>

      {error && (
        <div className="px-4 py-3 bg-red-50 border border-red-100 rounded-xl text-sm text-red-600">
          {error}
        </div>
      )}

      <button
        onClick={handleSendOtp}
        disabled={!fullName.trim() || !phoneValid || loading}
        className="w-full py-4 rounded-xl text-white text-sm font-semibold transition-all disabled:opacity-40 flex items-center justify-center gap-2"
        style={{ background: `linear-gradient(135deg, ${BRAND}, #4070e8)` }}
      >
        {loading && <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />}
        Continuer →
      </button>

      <p className="text-[11px] text-gray-400 text-center leading-relaxed">
        Déjà inscrit ?{' '}
        <button onClick={() => { setIsLogin(true); setPhone(''); setError('') }} className="underline">
          Se reconnecter
        </button>
        {' '}· Essai gratuit 7 jours, sans CB.
      </p>
      </div>
      </div>
    </div>
  )
}
