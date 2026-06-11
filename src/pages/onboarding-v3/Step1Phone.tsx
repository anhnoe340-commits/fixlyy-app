import { useState, useRef, useEffect } from 'react'
import { supabase } from '@/lib/supabase'

const BRAND = '#3B5BF5'

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

interface Props {
  onDone: (userId: string, phone: string) => void
}

export default function Step1Phone({ onDone }: Props) {
  const [phone, setPhone] = useState('')
  const [otp, setOtp]     = useState('')
  const [phase, setPhase] = useState<'phone' | 'otp'>('phone')
  const [loading, setLoading]     = useState(false)
  const [error, setError]         = useState('')
  const [cooldown, setCooldown]   = useState(0)
  const otpRef    = useRef<HTMLInputElement>(null)
  const timerRef  = useRef<ReturnType<typeof setInterval> | null>(null)

  const e164       = normalizePhone(phone)
  const phoneValid = isValidFrMobile(e164)

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
    if (!phoneValid) return
    setLoading(true); setError('')
    try {
      const { error: err } = await supabase.auth.signInWithOtp({ phone: e164, options: { channel: 'sms' } })
      if (err) throw err
      setPhase('otp')
      startCooldown()
    } catch (e: any) {
      setError(e.message || 'Impossible d\'envoyer le code.')
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

      await supabase.from('profiles').upsert({
        id: data.user.id,
        phone: e164,
        source: 'self_serve',
        onboarding_step: 1,
        trial_status: 'active',
        trial_ends_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
      })

      onDone(data.user.id, e164)
    } catch (e: any) {
      const msg = e.message || ''
      if (msg.includes('invalid') || msg.includes('expired')) {
        setError('Code incorrect ou expiré.')
      } else {
        setError(msg || 'Erreur lors de la vérification.')
      }
    } finally {
      setLoading(false)
    }
  }

  if (phase === 'otp') {
    return (
      <div className="flex flex-col gap-7">
        <div>
          <h2 className="text-2xl font-bold text-white mb-1">Votre code SMS</h2>
          <p className="text-sm" style={{ color: 'rgba(148,163,184,0.85)' }}>
            Code à 6 chiffres envoyé au <span className="text-white font-medium">{phone}</span>
          </p>
        </div>

        <div className="flex flex-col gap-2">
          <label className="text-xs font-semibold uppercase tracking-wider" style={{ color: 'rgba(148,163,184,0.7)' }}>
            Code reçu par SMS
          </label>
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
              if (v.length === 6) setTimeout(verifyOtp, 50)
            }}
            placeholder="123456"
            className="v3-input w-full rounded-xl px-4 py-4 text-2xl font-bold text-center tracking-[0.5em]"
          />
        </div>

        {error && <p className="text-sm text-red-400 bg-red-500/10 border border-red-500/20 rounded-xl px-4 py-3">{error}</p>}

        <button
          onClick={verifyOtp}
          disabled={otp.length !== 6 || loading}
          className="w-full py-4 rounded-xl text-white text-sm font-bold transition-all disabled:opacity-40 flex items-center justify-center gap-2"
          style={{ background: BRAND }}
        >
          {loading && <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />}
          Vérifier →
        </button>

        <div className="flex flex-col items-center gap-2">
          <button
            onClick={() => { if (cooldown > 0) return; setLoading(true); sendOtp().finally(() => setLoading(false)) }}
            disabled={cooldown > 0 || loading}
            className="text-sm disabled:opacity-40 transition-colors"
            style={{ color: 'rgba(148,163,184,0.7)' }}
          >
            {cooldown > 0 ? `Renvoyer dans ${cooldown}s` : 'Renvoyer le code'}
          </button>
          <button onClick={() => { setPhase('phone'); setOtp(''); setError('') }} className="text-sm" style={{ color: 'rgba(148,163,184,0.5)' }}>
            ← Modifier mon numéro
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-7">
      <div>
        <h2 className="text-2xl font-bold text-white mb-1">Votre mobile pro</h2>
        <p className="text-sm" style={{ color: 'rgba(148,163,184,0.85)' }}>
          Vous recevrez vos résumés d'appel sur ce numéro.
        </p>
      </div>

      <div className="flex flex-col gap-2">
        <label className="text-xs font-semibold uppercase tracking-wider" style={{ color: 'rgba(148,163,184,0.7)' }}>Numéro de téléphone</label>
        <div className="flex overflow-hidden rounded-xl" style={{ border: '1px solid rgba(255,255,255,0.12)' }}>
          <div className="flex items-center gap-1.5 px-3 py-3.5 flex-shrink-0" style={{ borderRight: '1px solid rgba(255,255,255,0.10)', background: 'rgba(255,255,255,0.04)' }}>
            <span>🇫🇷</span>
            <span className="text-sm" style={{ color: 'rgba(148,163,184,0.8)' }}>+33</span>
          </div>
          <input
            type="tel"
            inputMode="tel"
            autoFocus
            placeholder="6 12 34 56 78"
            value={phone}
            onChange={e => setPhone(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && phoneValid && sendOtp()}
            className="flex-1 bg-transparent px-3 py-3.5 text-sm text-white placeholder:text-white/30 outline-none"
          />
        </div>
        {phone && !phoneValid && (
          <p className="text-xs text-red-400 mt-0.5">Format attendu : 06 ou 07 XXXXXXXX</p>
        )}
      </div>

      {error && <p className="text-sm text-red-400 bg-red-500/10 border border-red-500/20 rounded-xl px-4 py-3">{error}</p>}

      <button
        onClick={sendOtp}
        disabled={!phoneValid || loading}
        className="w-full py-4 rounded-xl text-white text-sm font-bold transition-all disabled:opacity-40 flex items-center justify-center gap-2"
        style={{ background: BRAND }}
      >
        {loading && <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />}
        Continuer →
      </button>

      <p className="text-xs text-center" style={{ color: 'rgba(148,163,184,0.5)' }}>
        Essai gratuit 7 jours · Sans carte bancaire · Résiliable à tout moment
      </p>
    </div>
  )
}
