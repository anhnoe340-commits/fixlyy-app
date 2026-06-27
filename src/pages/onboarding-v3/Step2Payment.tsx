import { useState } from 'react'
import OnboardingVideo from '@/components/OnboardingVideo'
import CGUModal from '@/pages/CGUModal'
import { ONBOARDING_VIDEOS } from '@/config/onboarding-videos'
import SocialProofToast, { useSocialProof } from '@/components/SocialProofToast'
import ScarcityBadge from '@/components/ScarcityBadge'

const BRAND  = '#3B5BFA'
const TEXT   = '#1A1A2E'
const MUTED  = '#6B7280'
const BORDER = '#E5E7EB'

interface Props {
  loading: boolean
  error: string
  onPay: () => void
}

export default function Step2Payment({ loading, error, onPay }: Props) {
  const { remaining, loading: slotsLoading, decrement } = useSocialProof()
  const [cguAccepted, setCguAccepted] = useState(false)
  const [showError, setShowError]     = useState(false)
  const [showCGU, setShowCGU]         = useState(false)

  function handlePay() {
    if (!cguAccepted) { setShowError(true); return }
    setShowError(false)
    onPay()
  }

  const features = [
    '✅ 7 jours gratuits',
    '✅ Engagement minimum 3 mois',
    '✅ Aucune carte débitée avant le 8ème jour',
  ]

  return (
    <div className="flex flex-col gap-5">
      {/* Titre */}
      <div>
        <h2 className="text-2xl font-bold mb-1" style={{ color: TEXT }}>Active Mia maintenant</h2>
        <p className="text-sm" style={{ color: MUTED }}>Tu es à un clic d'activer ton assistante IA.</p>
      </div>

      {/* Vidéo */}
      <OnboardingVideo
        videoUrl={ONBOARDING_VIDEOS.step2}
        placeholderMessage={"Tu es à un clic d'activer Mia.\n7 jours gratuits — aucune carte débitée maintenant."}
      />

      {/* Récap offre */}
      <div style={{
        background: '#fff',
        border: `1px solid ${BORDER}`,
        borderRadius: 12,
        padding: '20px 18px',
        boxShadow: '0 1px 6px rgba(0,0,0,0.05)',
      }}>
        {/* Badge fondateurs */}
        <div className="flex justify-center mb-4">
          <span style={{
            background: BRAND,
            color: '#fff',
            fontSize: 11,
            fontWeight: 800,
            letterSpacing: '0.08em',
            textTransform: 'uppercase',
            padding: '4px 12px',
            borderRadius: 20,
          }}>
            PRIX FONDATEURS
          </span>
        </div>

        {/* Prix */}
        <div className="text-center mb-4">
          <div className="flex items-center justify-center gap-3 mb-1">
            <span style={{ textDecoration: 'line-through', color: '#9CA3AF', fontSize: 18 }}>497€</span>
            <span style={{ color: BRAND, fontSize: 32, fontWeight: 900, lineHeight: 1 }}>197€</span>
          </div>
          <p style={{ color: MUTED, fontSize: 12 }}>le 1er mois · puis 497€/mois à partir du 2ème</p>
        </div>

        {/* Features */}
        <div className="flex flex-col gap-2">
          {features.map(f => (
            <p key={f} style={{ fontSize: 13, color: TEXT }}>{f}</p>
          ))}
        </div>
      </div>

      {/* CGU */}
      <div style={{
        background: '#F9FAFB',
        border: `1px solid ${showError && !cguAccepted ? '#EF4444' : BORDER}`,
        borderRadius: 10,
        padding: '14px 16px',
      }}>
        <label className="flex items-start gap-3 cursor-pointer">
          <div className="flex-shrink-0 mt-0.5">
            <input
              type="checkbox"
              checked={cguAccepted}
              onChange={e => { setCguAccepted(e.target.checked); if (e.target.checked) setShowError(false) }}
              style={{ width: 18, height: 18, accentColor: BRAND, cursor: 'pointer' }}
            />
          </div>
          <span style={{ fontSize: 13, color: TEXT, lineHeight: 1.5 }}>
            J'accepte les{' '}
            <button
              type="button"
              onClick={() => setShowCGU(true)}
              style={{ color: BRAND, fontWeight: 600, textDecoration: 'underline', background: 'none', border: 'none', cursor: 'pointer', fontSize: 13, padding: 0 }}
            >
              conditions générales d'utilisation
            </button>{' '}
            incluant l'engagement de 3 mois minimum.
          </span>
        </label>
        {showError && !cguAccepted && (
          <p className="mt-2 text-xs font-medium" style={{ color: '#EF4444' }}>
            Veuillez accepter les CGU pour continuer.
          </p>
        )}
      </div>

      {/* Erreur checkout */}
      {error && (
        <p className="text-sm rounded-xl px-4 py-3" style={{ color: '#EF4444', background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)' }}>
          {error}
        </p>
      )}

      {/* Bouton */}
      <button
        onClick={handlePay}
        disabled={loading}
        className="w-full py-4 rounded-xl text-white text-sm font-bold flex items-center justify-center gap-2 transition-all"
        style={{
          background: cguAccepted ? BRAND : '#D1D5DB',
          cursor: cguAccepted ? 'pointer' : 'not-allowed',
          boxShadow: cguAccepted ? '0 4px 16px rgba(59,91,250,0.28)' : 'none',
        }}
      >
        {loading && <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />}
        {loading ? 'Redirection…' : 'Activer Mia 7 jours gratuits →'}
      </button>

      {/* Scarcité */}
      <div className="flex flex-col items-center gap-2">
        <ScarcityBadge remaining={remaining} loading={slotsLoading} />
      </div>
      <SocialProofToast onDecrement={decrement} />

      {showCGU && <CGUModal onClose={() => setShowCGU(false)} />}
    </div>
  )
}
