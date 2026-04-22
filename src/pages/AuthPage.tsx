import { useState } from 'react'
import { useAuth } from '@/contexts/AuthContext'
import { supabase } from '@/lib/supabase'

const BRAND = '#2850c8'
const NAVY  = '#0F172A'

export default function AuthPage() {
  const { signIn, signUp } = useAuth()
  const [mode, setMode] = useState<'login' | 'signup' | 'forgot'>('login')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setSuccess('')

    if (mode === 'forgot') {
      setLoading(true)
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/reset-password`,
      })
      setLoading(false)
      if (error) setError('Une erreur est survenue. Vérifiez l\'adresse email.')
      else setSuccess('Email envoyé ! Consultez votre boîte mail pour réinitialiser votre mot de passe.')
      return
    }

    if (mode === 'signup' && password !== confirm) {
      setError('Les mots de passe ne correspondent pas.')
      return
    }
    setLoading(true)
    if (mode === 'login') {
      const { error } = await signIn(email, password)
      if (error) setError('Email ou mot de passe incorrect.')
    } else {
      const { error } = await signUp(email, password)
      if (error) setError(error)
      else setSuccess('Compte créé ! Vérifiez vos emails pour confirmer.')
    }
    setLoading(false)
  }

  function switchMode(m: 'login' | 'signup' | 'forgot') {
    setMode(m); setError(''); setSuccess('')
  }

  return (
    <div className="flex w-screen min-h-screen overflow-x-hidden">
      {/* ── Left panel ── */}
      <div
        className="hidden md:flex w-[420px] flex-shrink-0 flex-col justify-between p-10"
        style={{ background: NAVY }}
      >
        {/* Logo */}
        <div className="flex items-center gap-3">
          <img src="/logo-icon.png" alt="Fixlyy" className="h-10 w-10 object-contain" />
          <span className="text-white font-bold text-xl tracking-tight">Fixlyy</span>
        </div>

        {/* Headline */}
        <div>
          <h1 className="text-white font-bold text-3xl leading-tight mb-4">
            {mode === 'login' ? 'Bon retour 👋' : 'Votre secrétaire IA vous attend'}
          </h1>
          <p className="text-white/70 text-base leading-relaxed">
            {mode === 'login'
              ? 'Connectez-vous pour gérer vos appels, vos contacts et générer vos devis.'
              : 'Mia répond à vos appels 24/7, génère des devis en 2 minutes et vous envoie un résumé par SMS en 30 secondes.'}
          </p>
          <div className="mt-8 flex flex-col gap-3">
            {['Secrétaire IA 24/7', 'Devis sur mesure en 2 min', 'SMS résumé instantané', 'Garantie 30 jours'].map(f => (
              <div key={f} className="flex items-center gap-3 text-white/80 text-sm">
                <div
                  className="w-5 h-5 rounded-full flex items-center justify-center text-white text-[10px] font-bold flex-shrink-0"
                  style={{ background: BRAND }}
                >
                  ✓
                </div>
                {f}
              </div>
            ))}
          </div>
        </div>

        <p className="text-white/30 text-xs">© 2026 Fixlyy — support@fixlyy.fr</p>
      </div>

      {/* ── Right panel ── */}
      <div className="flex-1 flex items-center justify-center bg-white p-8">
        <div className="w-full max-w-sm">
          {/* Mobile logo */}
          <div className="md:hidden mb-8">
            <img src="/logo-full.jpg" alt="Fixlyy" className="h-9 object-contain" />
          </div>

          <h2 className="text-2xl font-bold mb-1 tracking-tight">
            {mode === 'login' ? 'Connexion à votre compte' : mode === 'signup' ? 'Créer un compte' : 'Mot de passe oublié'}
          </h2>
          <p className="text-sm text-gray-500 mb-6">
            {mode === 'login' ? 'Gérez vos appels et vos devis.'
              : mode === 'signup' ? 'Commencez votre essai gratuit de 7 jours.'
              : 'Entrez votre email pour recevoir un lien de réinitialisation.'}
          </p>

          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            <div>
              <label className="text-xs font-medium text-gray-600 block mb-1">Email</label>
              <input
                type="email" required value={email}
                onChange={e => setEmail(e.target.value)}
                placeholder="vous@exemple.fr"
                className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm outline-none transition-colors"
                style={{ '--tw-ring-color': BRAND } as React.CSSProperties}
                onFocus={e => (e.target.style.borderColor = BRAND)}
                onBlur={e => (e.target.style.borderColor = '')}
              />
            </div>
            {mode !== 'forgot' && (
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="text-xs font-medium text-gray-600">Mot de passe</label>
                  {mode === 'login' && (
                    <button type="button" onClick={() => switchMode('forgot')}
                      className="text-xs hover:underline" style={{ color: BRAND }}>
                      Mot de passe oublié ?
                    </button>
                  )}
                </div>
                <input
                  type="password" required value={password}
                  onChange={e => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm outline-none transition-colors"
                  onFocus={e => (e.target.style.borderColor = BRAND)}
                  onBlur={e => (e.target.style.borderColor = '')}
                />
              </div>
            )}
            {mode === 'signup' && (
              <div>
                <label className="text-xs font-medium text-gray-600 block mb-1">Confirmer le mot de passe</label>
                <input
                  type="password" required value={confirm}
                  onChange={e => setConfirm(e.target.value)}
                  placeholder="••••••••"
                  className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm outline-none transition-colors"
                  onFocus={e => (e.target.style.borderColor = BRAND)}
                  onBlur={e => (e.target.style.borderColor = '')}
                />
              </div>
            )}

            {error && (
              <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{error}</p>
            )}
            {success && (
              <p className="text-xs text-green-700 bg-green-50 border border-green-200 rounded-lg px-3 py-2">{success}</p>
            )}

            <button
              type="submit" disabled={loading}
              className="w-full text-white rounded-lg py-2.5 text-sm font-semibold transition-opacity disabled:opacity-50 hover:opacity-90"
              style={{ background: BRAND }}
            >
              {loading ? 'Chargement...'
                : mode === 'login' ? 'Se connecter'
                : mode === 'signup' ? 'Créer mon compte'
                : 'Envoyer le lien'}
            </button>
          </form>

          <p className="text-center text-xs text-gray-500 mt-5">
            {mode === 'forgot' ? (
              <>
                <button onClick={() => switchMode('login')} className="font-medium hover:underline" style={{ color: BRAND }}>
                  ← Retour à la connexion
                </button>
              </>
            ) : (
              <>
                {mode === 'login' ? 'Pas encore de compte ? ' : 'Déjà un compte ? '}
                <button onClick={() => switchMode(mode === 'login' ? 'signup' : 'login')}
                  className="font-medium hover:underline" style={{ color: BRAND }}>
                  {mode === 'login' ? "S'inscrire" : 'Se connecter'}
                </button>
              </>
            )}
          </p>
        </div>
      </div>
    </div>
  )
}
