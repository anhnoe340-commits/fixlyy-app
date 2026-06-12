import { useState } from 'react'
import { supabase } from '@/lib/supabase'

const BRAND = '#3B5BF5'

interface Props {
  userId: string
  deferredPrompt: any
  onDone: () => void
}

export default function Step6Install({ userId, deferredPrompt, onDone }: Props) {
  const [installing, setInstalling] = useState(false)
  const [installed, setInstalled]   = useState(false)

  async function markDone() {
    await supabase.from('profiles').update({
      onboarding_step: 7,
      onboarding_completed: true,
    }).eq('id', userId)
    onDone()
  }

  async function handleInstall() {
    if (!deferredPrompt) { await markDone(); return }
    setInstalling(true)
    try {
      deferredPrompt.prompt()
      const { outcome } = await deferredPrompt.userChoice
      if (outcome === 'accepted') setInstalled(true)
    } catch { /* ignore */ }
    setInstalling(false)
    await markDone()
  }

  const checklist = [
    { icon: '📞', label: 'Numéro Mia dédié attribué' },
    { icon: '✅', label: 'Renvoi d\'appel configuré' },
    { icon: '📩', label: 'SMS récap activé (30 secondes)' },
    { icon: '🔒', label: 'CB enregistrée · aucun prélèvement avant 7 jours' },
  ]

  return (
    <div className="flex flex-col gap-7">
      <div className="text-center">
        <div className="w-20 h-20 rounded-full mx-auto mb-4 flex items-center justify-center text-4xl" style={{ background: 'rgba(59,91,245,0.15)', border: '2px solid rgba(59,91,245,0.35)' }}>
          🎉
        </div>
        <h2 className="text-2xl font-bold text-white mb-1">Mia est prête !</h2>
        <p className="text-sm" style={{ color: 'rgba(148,163,184,0.85)' }}>
          Votre secrétaire IA répond dès maintenant.
        </p>
      </div>

      {/* Récapitulatif */}
      <div className="v3-card rounded-2xl p-5 flex flex-col gap-3">
        {checklist.map(item => (
          <div key={item.label} className="flex items-center gap-3">
            <span className="text-base flex-shrink-0">{item.icon}</span>
            <span className="text-sm text-white/80">{item.label}</span>
          </div>
        ))}
      </div>

      {/* PWA install */}
      {deferredPrompt && !installed ? (
        <div className="flex flex-col gap-3">
          <div className="rounded-2xl p-4 text-center" style={{ background: 'rgba(59,91,245,0.10)', border: '1px solid rgba(59,91,245,0.25)' }}>
            <p className="text-sm font-semibold text-white mb-1">📲 Installer Fixlyy sur votre téléphone</p>
            <p className="text-xs" style={{ color: 'rgba(148,163,184,0.7)' }}>
              Accédez à vos résumés d'appel en 1 tap, sans navigateur.
            </p>
          </div>
          <button
            onClick={handleInstall}
            disabled={installing}
            className="w-full py-4 rounded-xl text-white text-sm font-bold flex items-center justify-center gap-2"
            style={{ background: BRAND }}
          >
            {installing && <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />}
            Installer l'app
          </button>
          <button onClick={markDone} className="text-sm text-center underline underline-offset-2" style={{ color: 'rgba(148,163,184,0.5)' }}>
            Accéder au tableau de bord →
          </button>
        </div>
      ) : (
        <button
          onClick={markDone}
          className="w-full py-4 rounded-xl text-white text-sm font-bold flex items-center justify-center gap-2"
          style={{ background: BRAND }}
        >
          Accéder au tableau de bord →
        </button>
      )}

    </div>
  )
}
