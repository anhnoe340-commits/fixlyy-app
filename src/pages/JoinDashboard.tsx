import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'

const BRAND = '#2850c8'
const SB_URL = import.meta.env.VITE_SUPABASE_URL as string

export default function JoinDashboard() {
  const token = new URLSearchParams(window.location.search).get('token') ?? ''

  const [step, setStep] = useState<'loading' | 'form' | 'error'>('loading')
  const [company, setCompany] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [isNewUser, setIsNewUser] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [errorMsg, setErrorMsg] = useState('')

  useEffect(() => {
    if (!token) { setErrorMsg("Lien d'invitation invalide."); setStep('error'); return }
    fetch(`${SB_URL}/functions/v1/accept-team-invitation?token=${token}`)
      .then(r => r.json())
      .then(d => {
        if (!d.ok) { setErrorMsg(d.error || "Invitation invalide."); setStep('error'); return }
        setCompany(d.company)
        setEmail(d.email)
        setStep('form')
      })
      .catch(() => { setErrorMsg("Erreur réseau. Réessayez."); setStep('error') })
  }, [token])

  const handleSubmit = async () => {
    setErrorMsg(''); setSubmitting(true)
    try {
      if (isNewUser) {
        const { error } = await supabase.auth.signUp({ email, password })
        if (error) { setErrorMsg(error.message); setSubmitting(false); return }
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password })
        if (error) { setErrorMsg(error.message); setSubmitting(false); return }
      }

      const { data: { session } } = await supabase.auth.getSession()
      if (!session?.access_token) { setErrorMsg("Session introuvable."); setSubmitting(false); return }

      const res = await fetch(`${SB_URL}/functions/v1/accept-team-invitation`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${session.access_token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ token }),
      })
      const d = await res.json()
      if (!res.ok) { setErrorMsg(d.error || "Erreur lors de l'activation."); setSubmitting(false); return }

      window.location.href = '/'
    } catch (e: any) {
      setErrorMsg(e.message || "Erreur inattendue.")
      setSubmitting(false)
    }
  }

  if (step === 'loading') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-white">
        <div className="w-8 h-8 border-2 border-t-transparent rounded-full animate-spin" style={{ borderColor: `${BRAND}40`, borderTopColor: BRAND }} />
      </div>
    )
  }

  if (step === 'error') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-8 max-w-sm w-full text-center">
          <div className="w-12 h-12 rounded-2xl bg-red-50 flex items-center justify-center mx-auto mb-4">
            <svg className="w-6 h-6 text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z"/>
            </svg>
          </div>
          <p className="text-sm font-semibold text-gray-800 mb-1">Invitation invalide</p>
          <p className="text-xs text-gray-500">{errorMsg}</p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-8 max-w-sm w-full">
        <p className="text-[11px] font-semibold uppercase tracking-widest text-gray-400 mb-1">Invitation Fixlyy</p>
        <h1 className="text-xl font-bold text-gray-900 mb-1">{company}</h1>
        <p className="text-sm text-gray-500 mb-6">vous invite à accéder à leur dashboard.</p>

        <div className="flex gap-2 mb-5 bg-gray-50 p-1 rounded-xl">
          {['Créer un compte', 'Se connecter'].map((label, i) => (
            <button key={i} onClick={() => setIsNewUser(i === 0)}
              className={`flex-1 py-2 rounded-lg text-sm font-medium transition-all ${(isNewUser ? i === 0 : i === 1) ? 'bg-white shadow-sm text-gray-900' : 'text-gray-400'}`}>
              {label}
            </button>
          ))}
        </div>

        <div className="flex flex-col gap-3">
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1.5">Email</label>
            <input value={email} onChange={e => setEmail(e.target.value)} type="email"
              className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm outline-none focus:border-blue-400" />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1.5">Mot de passe</label>
            <input value={password} onChange={e => setPassword(e.target.value)} type="password"
              placeholder={isNewUser ? 'Choisissez un mot de passe' : 'Votre mot de passe'}
              onKeyDown={e => e.key === 'Enter' && handleSubmit()}
              className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm outline-none focus:border-blue-400" />
          </div>

          {errorMsg && <p className="text-xs text-red-500 bg-red-50 border border-red-100 rounded-lg px-3 py-2">{errorMsg}</p>}

          <button onClick={handleSubmit} disabled={submitting || !email || !password}
            className="w-full py-3 rounded-xl text-white text-sm font-semibold flex items-center justify-center gap-2 disabled:opacity-50 mt-1"
            style={{ background: BRAND }}>
            {submitting && <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />}
            {isNewUser ? "Créer le compte et rejoindre" : "Se connecter et rejoindre"}
          </button>
        </div>
      </div>
    </div>
  )
}
