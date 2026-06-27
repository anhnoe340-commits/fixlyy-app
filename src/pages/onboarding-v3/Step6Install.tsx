import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import OnboardingVideo from '@/components/OnboardingVideo'
import { ONBOARDING_VIDEOS } from '@/config/onboarding-videos'

const BRAND = '#3B5BFA'
const TEXT  = '#1A1A2E'
const MUTED = '#6B7280'

interface Props {
  userId: string
  deferredPrompt: any
  onDone: () => void
}

const CHECKLIST = [
  '✓ Ton équipe et leurs disponibilités',
  '✓ Tes clients réguliers',
  '✓ Tes tarifs et tes prestations',
  '✓ Tes horaires et indisponibilités',
  '✓ Ta façon de travailler',
]

export default function Step6Install({ userId, onDone }: Props) {
  const [done, setDone]       = useState(false)
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    // Entrée animée
    const t = setTimeout(() => setVisible(true), 80)
    return () => clearTimeout(t)
  }, [])

  async function handleConfigureMia() {
    if (done) return
    setDone(true)
    try {
      await supabase.from('profiles').update({
        onboarding_step: 7,
        onboarding_completed: true,
      }).eq('id', userId)
    } catch { /* ignore — not blocking */ }
    window.location.href = '/dashboard/mon-activite?from=onboarding'
  }

  return (
    <div
      className="flex flex-col gap-5"
      style={{
        background: '#F0F4FF',
        borderRadius: 16,
        padding: '24px 20px',
        opacity: visible ? 1 : 0,
        transform: visible ? 'translateY(0)' : 'translateY(12px)',
        transition: 'opacity 0.4s ease, transform 0.4s ease',
      }}
    >
      {/* Vidéo */}
      <OnboardingVideo
        videoUrl={ONBOARDING_VIDEOS.step5}
        placeholderMessage={`Bienvenue dans la famille Fixlyy.\nJe te remercie sincèrement de faire confiance à Mia pour ton activité.\n\nMia est maintenant active. Mais pour qu'elle travaille vraiment POUR TOI — pas juste pour n'importe quel artisan — il faut lui présenter ton activité. Ça prend 5 minutes.\n\nEt après ça, Mia connaît ton équipe, tes clients, tes tarifs, ta façon de travailler.\nC'est ce qui fait toute la différence.`}
      />

      {/* Badge succès */}
      <div className="flex flex-col items-center gap-2 py-2">
        <div
          style={{
            width: 64, height: 64,
            borderRadius: '50%',
            background: 'rgba(5,150,105,0.12)',
            border: '2px solid rgba(5,150,105,0.3)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 28,
            transform: visible ? 'scale(1)' : 'scale(0)',
            transition: 'transform 0.5s cubic-bezier(0.34,1.56,0.64,1) 0.15s',
          }}
        >
          ✅
        </div>
        <p className="text-lg font-bold text-center" style={{ color: TEXT }}>Mia est active sur ton numéro</p>
        <p className="text-sm text-center" style={{ color: MUTED, maxWidth: 280 }}>
          Tu fais partie des artisans qui ne ratent plus jamais un appel.
        </p>
      </div>

      {/* Card config Mia — OBLIGATOIRE */}
      <div style={{
        background: '#fff',
        border: `2px solid ${BRAND}`,
        borderRadius: 12,
        overflow: 'hidden',
        boxShadow: '0 4px 20px rgba(59,91,250,0.12)',
      }}>
        {/* En-tête */}
        <div style={{ background: BRAND, padding: '14px 18px' }}>
          <p style={{ color: '#fff', fontWeight: 800, fontSize: 15 }}>🧠 Présente ton activité à Mia</p>
        </div>

        {/* Corps */}
        <div style={{ padding: '16px 18px', display: 'flex', flexDirection: 'column', gap: 12 }}>
          <p style={{ color: MUTED, fontSize: 13, fontStyle: 'italic', lineHeight: 1.5 }}>
            "Plus Mia te connaît, plus elle travaille comme une vraie secrétaire dédiée à toi."
          </p>

          <div className="flex flex-col gap-2">
            {CHECKLIST.map(item => (
              <p key={item} style={{ fontSize: 13, color: TEXT, lineHeight: 1.4 }}>
                <span style={{ color: '#059669', fontWeight: 700, marginRight: 4 }}>✓</span>
                {item.replace('✓ ', '')}
              </p>
            ))}
          </div>

          <button
            onClick={handleConfigureMia}
            disabled={done}
            style={{
              width: '100%', padding: '14px',
              background: done ? '#D1D5DB' : BRAND,
              color: '#fff', borderRadius: 10,
              border: 'none', fontWeight: 800, fontSize: 14,
              cursor: done ? 'default' : 'pointer',
              boxShadow: done ? 'none' : '0 4px 14px rgba(59,91,250,0.3)',
              marginTop: 4,
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
            }}
          >
            {done && <div style={{ width: 14, height: 14, border: '2px solid #fff', borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />}
            Configurer Mia maintenant →
          </button>
        </div>
      </div>
    </div>
  )
}
