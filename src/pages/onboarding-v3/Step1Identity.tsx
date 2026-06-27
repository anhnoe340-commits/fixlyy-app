import { useState, useEffect, useRef } from 'react'
import { supabase } from '@/lib/supabase'
import SocialProofToast, { useSocialProof } from '@/components/SocialProofToast'
import ScarcityBadge from '@/components/ScarcityBadge'
import OnboardingVideo from '@/components/OnboardingVideo'
import { ONBOARDING_VIDEOS } from '@/config/onboarding-videos'

const BRAND  = '#3B5BFA'
const TEXT   = '#1A1A2E'
const MUTED  = '#6B7280'
const BORDER = '#E5E7EB'

const TRADES = [
  { label: '🔧 Plombier',     value: 'Plomberie / Chauffage' },
  { label: '⚡ Électricien',  value: 'Électricité' },
  { label: '🔒 Serrurier',    value: 'Serrurerie' },
  { label: '🔥 Chauffagiste', value: 'Chauffage / Climatisation' },
  { label: '🪵 Menuisier',    value: 'Menuiserie / Charpenterie' },
  { label: '🚗 Garagiste',    value: 'Garage / Mécanique' },
  { label: '✏️ Autre',        value: 'Autre' },
]

function normalizePhone(raw: string): string {
  const digits = raw.replace(/\D/g, '')
  if (digits.startsWith('33') && digits.length === 11) return '+' + digits
  if (digits.startsWith('0') && digits.length === 10) return '+33' + digits.slice(1)
  if (digits.length === 9) return '+33' + digits
  return raw
}

function isValidFrPhone(e164: string): boolean {
  return /^\+33[67]\d{8}$/.test(e164)
}

const inputStyle: React.CSSProperties = {
  width: '100%',
  background: '#F9FAFB',
  border: `1px solid ${BORDER}`,
  borderRadius: 10,
  padding: '12px 14px',
  fontSize: 14,
  color: TEXT,
  outline: 'none',
  transition: 'border-color 0.15s',
}

const labelStyle: React.CSSProperties = {
  fontSize: 11,
  fontWeight: 700,
  textTransform: 'uppercase',
  letterSpacing: '0.06em',
  color: MUTED,
  marginBottom: 4,
  display: 'block',
}

interface Props {
  onDone: (userId: string, phone: string, fullName: string, trade: string, companyName: string, email: string) => void
}

export default function Step1Identity({ onDone }: Props) {
  const { remaining, loading: slotsLoading, decrement } = useSocialProof()
  const [phase, setPhase]                   = useState<'form' | 'otp'>('form')
  const [fullName, setFullName]             = useState('')
  const [trade, setTrade]                   = useState(TRADES[0].value)
  const [companyName, setCompanyName]       = useState('')
  const [companyTouched, setCompanyTouched] = useState(false)
  const [phone, setPhone]                   = useState('')
  const [email, setEmail]                   = useState('')
  const [otp, setOtp]                       = useState('')
  const [loading, setLoading]               = useState(false)
  const [error, setError]                   = useState('')
  const [cooldown, setCooldown]             = useState(0)
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const otpRef   = useRef<HTMLInputElement>(null)

  const e164       = normalizePhone(phone)
  const phoneValid = isValidFrPhone(e164)
  const emailValid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())
  const canSubmit  = fullName.trim().length >= 2 && companyName.trim().length >= 2 && phoneValid && emailValid

  useEffect(() => {
    if (!companyTouched && fullName.trim()) {
      const first      = fullName.trim().split(' ')[0]
      const tradeShort = trade.split('/')[0].trim()
      setCompanyName(`${tradeShort} ${first}`)
    }
  }, [fullName, trade, companyTouched])

  useEffect(() => {
    if (phase === 'otp') setTimeout(() => otpRef.current?.focus(), 100)
  }, [phase])

  useEffect(() => () => { if (timerRef.current) clearInterval(timerRef.current) }, [])

  function startCooldown() {
    setCooldown(30)
    timerRef.current = setInterval(() => {
      setCooldown(n => { if (n <= 1) { clearInterval(timerRef.current!); return 0 } return n - 1 })
    }, 1000)
  }

  async function sendOtp() {
    if (!canSubmit) return
    setLoading(true); setError('')
    try {
      const { error: err } = await supabase.auth.signInWithOtp({ phone: e164, options: { channel: 'sms' } })
      if (err) throw err
      setPhase('otp')
      startCooldown()
    } catch (e: any) {
      setError(e.message || "Impossible d'envoyer le code SMS.")
    } finally {
      setLoading(false)
    }
  }

  async function verifyOtp() {
    if (otp.length !== 6) return
    setLoading(true); setError('')
    try {
      const { data, error: err } = await supabase.auth.verifyOtp({ phone: e164, token: otp, type: 'sms' })
      if (err) throw err
      if (!data.user) throw new Error('Authentification échouée')

      const userId    = data.user.id
      const firstName = fullName.trim().split(' ')[0]
      const company   = companyName.trim()

      const { error: profileErr } = await supabase.from('profiles').upsert({
        id: userId,
        phone: e164,
        email: email.trim().toLowerCase(),
        full_name: fullName.trim(),
        company_name: company,
        company_type: trade,
        assistant_name: 'Mia',
        assistant_voice: 'female-warm',
        resume_token: crypto.randomUUID(),
        source: 'self_serve',
        onboarding_step: 2,
        greeting_open: `Bonjour, vous êtes bien chez ${company}. Je suis Mia. Comment puis-je vous aider ?`,
        greeting_closed: `Bonjour, vous êtes bien chez ${company}. Nous sommes actuellement fermés. Je suis Mia, je peux prendre votre message et ${firstName} vous rappellera dès que possible.`,
      })
      if (profileErr) throw profileErr

      onDone(userId, e164, fullName.trim(), trade, company, email.trim().toLowerCase())
    } catch (e: any) {
      const msg = e.message || ''
      setError(
        msg.includes('invalid') || msg.includes('expired')
          ? 'Code incorrect ou expiré.'
          : msg || 'Erreur lors de la vérification.'
      )
    } finally {
      setLoading(false)
    }
  }

  if (phase === 'otp') {
    return (
      <div className="flex flex-col gap-5">
        <div>
          <h2 className="text-2xl font-bold mb-1" style={{ color: TEXT }}>Vérifiez votre mobile</h2>
          <p className="text-sm" style={{ color: MUTED }}>
            Code envoyé au <span className="font-semibold" style={{ color: TEXT }}>{phone}</span>
          </p>
        </div>

        <div className="flex flex-col gap-1">
          <label style={labelStyle}>Code à 6 chiffres</label>
          <input
            ref={otpRef}
            type="text" inputMode="numeric" pattern="[0-9]*" maxLength={6}
            value={otp}
            onChange={e => {
              const v = e.target.value.replace(/\D/g, '')
              setOtp(v)
              if (v.length === 6) setTimeout(verifyOtp, 50)
            }}
            placeholder="123456"
            style={{ ...inputStyle, fontSize: 24, fontWeight: 700, textAlign: 'center', letterSpacing: '0.5em' }}
          />
        </div>

        {error && (
          <p className="text-sm rounded-xl px-4 py-3" style={{ color: '#EF4444', background: 'rgba(239,68,68,0.07)', border: '1px solid rgba(239,68,68,0.2)' }}>{error}</p>
        )}

        <button
          onClick={verifyOtp}
          disabled={otp.length !== 6 || loading}
          className="w-full py-4 rounded-xl text-white text-sm font-bold disabled:opacity-40 flex items-center justify-center gap-2"
          style={{ background: BRAND, boxShadow: '0 4px 16px rgba(59,91,250,0.25)' }}
        >
          {loading && <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />}
          Valider →
        </button>

        <div className="flex flex-col items-center gap-2">
          <button
            onClick={() => { if (cooldown > 0 || loading) return; sendOtp() }}
            disabled={cooldown > 0 || loading}
            className="text-sm disabled:opacity-40"
            style={{ color: MUTED }}
          >
            {cooldown > 0 ? `Renvoyer dans ${cooldown}s` : 'Renvoyer le code'}
          </button>
          <button
            onClick={() => { setPhase('form'); setOtp(''); setError('') }}
            className="text-sm"
            style={{ color: '#9CA3AF' }}
          >
            ← Modifier mes informations
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-5">
      {/* Vidéo */}
      <OnboardingVideo
        videoUrl={ONBOARDING_VIDEOS.step1}
        placeholderMessage={"Bienvenue, je suis Noé fondateur de Fixlyy.\nEn 2 minutes on va activer Mia pour ton activité.\nCommence par renseigner tes infos."}
      />

      <div>
        <h2 className="text-xl font-bold mb-1" style={{ color: TEXT }}>Votre activité</h2>
        <p className="text-sm" style={{ color: MUTED }}>
          Mia se présentera avec ces informations à vos clients.
        </p>
      </div>

      {/* Prénom + nom */}
      <div className="flex flex-col gap-1">
        <label style={labelStyle}>Prénom et nom</label>
        <input
          type="text" autoFocus placeholder="Jean Dupont"
          value={fullName}
          onChange={e => setFullName(e.target.value)}
          style={inputStyle}
        />
      </div>

      {/* Métier */}
      <div className="flex flex-col gap-1">
        <label style={labelStyle}>Votre métier</label>
        <div className="flex flex-wrap gap-2">
          {TRADES.map(t => (
            <button
              key={t.value}
              type="button"
              onClick={() => setTrade(t.value)}
              className="px-3 py-2 rounded-xl text-sm font-medium transition-all"
              style={{
                background: trade === t.value ? 'rgba(59,91,250,0.10)' : '#F3F4F6',
                border: trade === t.value ? `1.5px solid rgba(59,91,250,0.6)` : `1px solid ${BORDER}`,
                color: trade === t.value ? BRAND : TEXT,
              }}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {/* Nom activité */}
      <div className="flex flex-col gap-1">
        <label style={labelStyle}>Nom de l'activité</label>
        <input
          type="text" placeholder="Ex : Plomberie Dupont"
          value={companyName}
          onChange={e => { setCompanyName(e.target.value); setCompanyTouched(true) }}
          style={inputStyle}
        />
        {companyName && (
          <p className="text-xs mt-1" style={{ color: '#9CA3AF' }}>
            Mia répondra : « {companyName}, bonjour ! »
          </p>
        )}
      </div>

      {/* Email */}
      <div className="flex flex-col gap-1">
        <label style={labelStyle}>Email pro</label>
        <input
          type="email" inputMode="email"
          placeholder="jean@plomberie-dupont.fr"
          value={email}
          onChange={e => setEmail(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && canSubmit && sendOtp()}
          style={inputStyle}
        />
        {email && !emailValid && (
          <p className="text-xs mt-1" style={{ color: '#EF4444' }}>Adresse email invalide</p>
        )}
      </div>

      {/* Téléphone */}
      <div className="flex flex-col gap-1">
        <label style={labelStyle}>Mobile pro</label>
        <div style={{ display: 'flex', overflow: 'hidden', borderRadius: 10, border: `1px solid ${BORDER}` }}>
          <div style={{
            display: 'flex', alignItems: 'center', gap: 6,
            padding: '12px', flexShrink: 0,
            borderRight: `1px solid ${BORDER}`, background: '#F3F4F6',
          }}>
            <span>🇫🇷</span>
            <span style={{ fontSize: 13, color: MUTED }}>+33</span>
          </div>
          <input
            type="tel" inputMode="tel"
            placeholder="6 12 34 56 78"
            value={phone}
            onChange={e => setPhone(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && canSubmit && sendOtp()}
            style={{ flex: 1, background: '#F9FAFB', border: 'none', outline: 'none', padding: '12px', fontSize: 14, color: TEXT }}
          />
        </div>
        {phone && !phoneValid && (
          <p className="text-xs mt-1" style={{ color: '#EF4444' }}>Format attendu : 06 ou 07 XXXXXXXX</p>
        )}
      </div>

      {error && (
        <p className="text-sm rounded-xl px-4 py-3" style={{ color: '#EF4444', background: 'rgba(239,68,68,0.07)', border: '1px solid rgba(239,68,68,0.2)' }}>{error}</p>
      )}

      <button
        onClick={sendOtp}
        disabled={!canSubmit || loading}
        className="w-full py-4 rounded-xl text-white text-sm font-bold disabled:opacity-40 flex items-center justify-center gap-2"
        style={{ background: BRAND, boxShadow: canSubmit ? '0 4px 16px rgba(59,91,250,0.25)' : 'none' }}
      >
        {loading && <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />}
        Continuer →
      </button>

      <div className="flex justify-center">
        <ScarcityBadge remaining={remaining} loading={slotsLoading} />
      </div>
      <SocialProofToast onDecrement={decrement} />

      <p className="text-xs text-center" style={{ color: '#9CA3AF' }}>
        Déjà inscrit ?{' '}
        <a href="/connexion" style={{ color: MUTED, textDecoration: 'underline' }}>
          Se reconnecter
        </a>
      </p>
    </div>
  )
}
