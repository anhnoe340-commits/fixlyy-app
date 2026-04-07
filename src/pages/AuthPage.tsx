import { useState } from 'react'
import { useAuth } from '@/contexts/AuthContext'

export default function AuthPage() {
  const { signIn, signUp } = useAuth()
  const [mode, setMode] = useState<'login' | 'signup'>('login')
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

  return (
    <div className="flex min-h-screen">
      {/* Left panel */}
      <div className="hidden md:flex w-[420px] bg-[#FF6B35] flex-col justify-between p-10 flex-shrink-0">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 bg-white/20 rounded-lg flex items-center justify-center text-white font-bold text-sm">F</div>
          <span className="text-white font-semibold text-lg">Fixlyy</span>
        </div>
        <div>
          <h1 className="text-white font-bold text-3xl leading-tight mb-4">
            {mode === 'login' ? 'Bon retour 👋' : 'Votre secrétaire IA vous attend'}
          </h1>
          <p className="text-white/80 text-base leading-relaxed">
            {mode === 'login'
              ? 'Connectez-vous pour gérer vos appels, vos contacts et générer vos devis.'
              : "Mia répond à vos appels 24/7, génère des devis en 2 minutes et vous envoie un résumé par SMS en 30 secondes."}
          </p>
          <div className="mt-8 flex flex-col gap-3">
            {['Secrétaire IA 24/7', 'Devis sur mesure en 2 min', 'SMS résumé instantané', 'Garantie 30 jours'].map(f => (
              <div key={f} className="flex items-center gap-2 text-white/90 text-sm">
                <div className="w-4 h-4 rounded-full bg-white/20 flex items-center justify-center text-[10px]">✓</div>
                {f}
              </div>
            ))}
          </div>
        </div>
        <p className="text-white/40 text-xs">© 2026 Fixlyy — support@fixlyy.fr</p>
      </div>

      {/* Right panel */}
      <div className="flex-1 flex items-center justify-center bg-white p-8">
        <div className="w-full max-w-sm">
          <div className="md:hidden flex items-center gap-2 mb-8">
            <div className="w-7 h-7 bg-[#FF6B35] rounded-lg flex items-center justify-center text-white font-bold text-xs">F</div>
            <span className="font-semibold text-base">Fixlyy</span>
          </div>

          <h2 className="text-2xl font-bold mb-1 tracking-tight">
            {mode === 'login' ? 'Connexion à votre compte' : 'Créer un compte'}
          </h2>
          <p className="text-sm text-gray-500 mb-6">
            {mode === 'login' ? 'Gérez vos appels et vos devis.' : 'Commencez votre essai gratuit de 7 jours.'}
          </p>

          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            <div>
              <label className="text-xs font-medium text-gray-600 block mb-1">Email</label>
              <input
                type="email" required value={email}
                onChange={e => setEmail(e.target.value)}
                placeholder="vous@exemple.fr"
                className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm outline-none focus:border-[#FF6B35] transition-colors"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-gray-600 block mb-1">Mot de passe</label>
              <input
                type="password" required value={password}
                onChange={e => setPassword(e.target.value)}
                placeholder="••••••••"
                className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm outline-none focus:border-[#FF6B35] transition-colors"
              />
            </div>
            {mode === 'signup' && (
              <div>
                <label className="text-xs font-medium text-gray-600 block mb-1">Confirmer le mot de passe</label>
                <input
                  type="password" required value={confirm}
                  onChange={e => setConfirm(e.target.value)}
                  placeholder="••••••••"
                  className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm outline-none focus:border-[#FF6B35] transition-colors"
                />
              </div>
            )}

            {error && <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{error}</p>}
            {success && <p className="text-xs text-green-700 bg-green-50 border border-green-200 rounded-lg px-3 py-2">{success}</p>}

            <button
              type="submit" disabled={loading}
              className="w-full bg-[#FF6B35] hover:opacity-90 text-white rounded-lg py-2.5 text-sm font-medium transition-opacity disabled:opacity-50"
            >
              {loading ? 'Chargement...' : mode === 'login' ? 'Se connecter' : "Créer mon compte"}
            </button>
          </form>

          <p className="text-center text-xs text-gray-500 mt-5">
            {mode === 'login' ? "Pas encore de compte ? " : "Déjà un compte ? "}
            <button onClick={() => { setMode(mode === 'login' ? 'signup' : 'login'); setError(''); setSuccess('') }}
              className="text-[#FF6B35] font-medium hover:underline">
              {mode === 'login' ? "S'inscrire" : 'Se connecter'}
            </button>
          </p>
        </div>
      </div>
    </div>
  )
}
