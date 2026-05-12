import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'

const BRAND = '#2850c8'

// Extrait le token depuis /r/{token}
function getToken(): string | null {
  const path = window.location.pathname
  const match = path.match(/^\/r\/([a-zA-Z0-9_-]+)$/)
  return match ? match[1] : null
}

type Phase = 'loading' | 'otp' | 'error'

export default function ResumePage() {
  const [phase, setPhase] = useState<Phase>('loading')
  const [phone, setPhone] = useState('')
  const [firstName, setFirstName] = useState('')
  const [onboardingStep, setOnboardingStep] = useState(1)
  const [otp, setOtp] = useState('')
  const [verifying, setVerifying] = useState(false)
  const [errorMsg, setErrorMsg] = useState('')

  useEffect(() => {
    const token = getToken()
    if (!token) { setPhase('error'); setErrorMsg('Lien invalide.'); return }

    fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/resume-session?token=${token}`, {
      headers: { apikey: import.meta.env.VITE_SUPABASE_ANON_KEY },
    })
      .then(r => r.json())
      .then(data => {
        if (data.error) { setPhase('error'); setErrorMsg('Ce lien a expiré ou est invalide.'); return }
        setPhone(data.phone)
        setFirstName(data.first_name || '')
        setOnboardingStep(data.onboarding_step || 1)
        setPhase('otp')
      })
      .catch(() => { setPhase('error'); setErrorMsg('Erreur réseau, réessayez.') })
  }, [])

  async function handleVerify() {
    if (otp.length !== 6) return
    setVerifying(true)
    setErrorMsg('')
    const { error } = await supabase.auth.verifyOtp({ phone, token: otp, type: 'sms' })
    if (error) {
      setErrorMsg('Code incorrect. Vérifiez le SMS.')
      setVerifying(false)
      return
    }
    // Redirige vers l'app — App.tsx reprend l'onboarding au bon step
    window.location.href = '/'
  }

  if (phase === 'loading') {
    return (
      <div className="min-h-screen flex items-center justify-center dashboard-bg">
        <div className="w-8 h-8 border-2 border-t-transparent rounded-full animate-spin" style={{ borderColor: BRAND }} />
      </div>
    )
  }

  if (phase === 'error') {
    return (
      <div className="min-h-screen flex items-center justify-center dashboard-bg p-4">
        <div className="glass-light rounded-2xl p-6 max-w-sm w-full text-center">
          <p className="text-gray-500 text-sm">{errorMsg}</p>
          <a href="/" className="mt-4 inline-block text-sm font-medium" style={{ color: BRAND }}>
            Retour à l'accueil
          </a>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen flex items-center justify-center dashboard-bg p-4" style={{ fontFamily: 'system-ui, sans-serif' }}>
      <div className="w-full max-w-sm">
        <div className="flex items-center justify-center gap-2 mb-8">
          <div className="w-8 h-8 rounded-lg flex items-center justify-center text-white text-sm font-bold" style={{ background: BRAND }}>F</div>
          <span className="text-base font-semibold text-gray-800">Fixlyy</span>
        </div>

        <div className="glass-light rounded-2xl p-6">
          <h2 className="text-base font-semibold text-gray-900 mb-1">
            {firstName ? `Bonjour ${firstName} !` : 'Reprenez votre inscription'}
          </h2>
          <p className="text-sm text-gray-500 mb-5">
            Un code SMS a été envoyé au <span className="font-medium text-gray-700">{phone}</span>.
          </p>

          <input
            type="text"
            inputMode="numeric"
            placeholder="123456"
            maxLength={6}
            value={otp}
            onChange={e => {
              const v = e.target.value.replace(/\D/g, '').slice(0, 6)
              setOtp(v)
              if (v.length === 6) setTimeout(() => handleVerify(), 50)
            }}
            className="w-full text-center text-2xl font-bold tracking-[0.4em] border border-gray-200 rounded-xl px-4 py-3 focus:outline-none focus:ring-2 focus:ring-blue-100 mb-3"
            style={{ letterSpacing: '0.4em' }}
          />

          {errorMsg && <p className="text-xs text-red-500 text-center mb-3">{errorMsg}</p>}

          <button
            onClick={handleVerify}
            disabled={otp.length !== 6 || verifying}
            className="w-full py-3 rounded-xl text-white text-sm font-semibold disabled:opacity-50 flex items-center justify-center gap-2"
            style={{ background: BRAND }}
          >
            {verifying && <div className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin" />}
            Continuer
          </button>
        </div>
      </div>
    </div>
  )
}
