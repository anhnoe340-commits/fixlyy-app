import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'

const BRAND = '#2850c8'
const NAVY  = '#0F172A'

export default function ResetPasswordPage() {
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [error, setError] = useState('')
  const [success, setSuccess] = useState(false)
  const [loading, setLoading] = useState(false)
  const [ready, setReady] = useState(false)

  // Supabase envoie le token dans le hash : #access_token=...&type=recovery
  useEffect(() => {
    // Vérification immédiate du hash (évite la race condition si l'événement a déjà été traité)
    if (window.location.hash.includes('type=recovery')) {
      setReady(true)
      return
    }
    // Fallback : écoute l'événement si le hash n'est pas encore traité
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'PASSWORD_RECOVERY') setReady(true)
    })
    return () => subscription.unsubscribe()
  }, [])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    if (password !== confirm) { setError('Les mots de passe ne correspondent pas.'); return }
    if (password.length < 6) { setError('Le mot de passe doit contenir au moins 6 caractères.'); return }
    setLoading(true)
    const { error } = await supabase.auth.updateUser({ password })
    setLoading(false)
    if (error) setError('Une erreur est survenue. Le lien est peut-être expiré.')
    else setSuccess(true)
  }

  return (
    <div className="flex w-screen min-h-screen overflow-x-hidden">
      {/* Left panel */}
      <div className="hidden md:flex w-[420px] flex-shrink-0 flex-col justify-between p-10" style={{ background: NAVY }}>
        <div className="flex items-center gap-3">
          <img src="/logo-icon.png" alt="Fixlyy" className="h-10 w-10 object-contain" />
          <span className="text-white font-bold text-xl tracking-tight">Fixlyy</span>
        </div>
        <div>
          <h1 className="text-white font-bold text-3xl leading-tight mb-4">Réinitialisation du mot de passe</h1>
          <p className="text-white/70 text-base leading-relaxed">
            Choisissez un nouveau mot de passe sécurisé pour accéder à votre compte.
          </p>
        </div>
        <p className="text-white/30 text-xs">© 2026 Fixlyy — support@fixlyy.fr</p>
      </div>

      {/* Right panel */}
      <div className="flex-1 flex items-center justify-center bg-white p-8">
        <div className="w-full max-w-sm">
          <div className="md:hidden mb-8">
            <img src="/logo-full.jpg" alt="Fixlyy" className="h-9 object-contain" />
          </div>

          {success ? (
            <div className="text-center">
              <div className="w-14 h-14 rounded-full flex items-center justify-center mx-auto mb-4"
                style={{ background: BRAND + '15' }}>
                <svg className="w-7 h-7" fill="none" stroke={BRAND} viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
              </div>
              <h2 className="text-2xl font-bold mb-2 tracking-tight">Mot de passe mis à jour</h2>
              <p className="text-sm text-gray-500 mb-6">Vous pouvez maintenant vous connecter avec votre nouveau mot de passe.</p>
              <a href="/" className="block w-full text-white rounded-lg py-2.5 text-sm font-semibold text-center transition-opacity hover:opacity-90"
                style={{ background: BRAND }}>
                Se connecter
              </a>
            </div>
          ) : !ready ? (
            <div className="text-center">
              <div className="w-6 h-6 border-2 border-t-transparent rounded-full animate-spin mx-auto mb-4"
                style={{ borderColor: BRAND, borderTopColor: 'transparent' }} />
              <p className="text-sm text-gray-500">Vérification du lien en cours…</p>
              <p className="text-xs text-gray-400 mt-2">
                Si cette page ne se charge pas,{' '}
                <a href="/" className="underline" style={{ color: BRAND }}>retournez à la connexion</a>.
              </p>
            </div>
          ) : (
            <>
              <h2 className="text-2xl font-bold mb-1 tracking-tight">Nouveau mot de passe</h2>
              <p className="text-sm text-gray-500 mb-6">Choisissez un mot de passe d'au moins 6 caractères.</p>

              <form onSubmit={handleSubmit} className="flex flex-col gap-4">
                <div>
                  <label className="text-xs font-medium text-gray-600 block mb-1">Nouveau mot de passe</label>
                  <input type="password" required value={password} onChange={e => setPassword(e.target.value)}
                    placeholder="••••••••" autoFocus
                    className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm outline-none transition-colors"
                    onFocus={e => (e.target.style.borderColor = BRAND)}
                    onBlur={e => (e.target.style.borderColor = '')} />
                </div>
                <div>
                  <label className="text-xs font-medium text-gray-600 block mb-1">Confirmer le mot de passe</label>
                  <input type="password" required value={confirm} onChange={e => setConfirm(e.target.value)}
                    placeholder="••••••••"
                    className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm outline-none transition-colors"
                    onFocus={e => (e.target.style.borderColor = BRAND)}
                    onBlur={e => (e.target.style.borderColor = '')} />
                </div>

                {error && <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{error}</p>}

                <button type="submit" disabled={loading}
                  className="w-full text-white rounded-lg py-2.5 text-sm font-semibold transition-opacity disabled:opacity-50 hover:opacity-90"
                  style={{ background: BRAND }}>
                  {loading ? 'Chargement...' : 'Enregistrer le mot de passe'}
                </button>
              </form>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
