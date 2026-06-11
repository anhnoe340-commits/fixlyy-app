import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'

const BRAND = '#3B5BF5'

function formatFrPhone(e164: string): string {
  const local = e164.replace('+33', '0')
  return local.replace(/(\d{2})(?=\d)/g, '$1 ').trim()
}

interface Props {
  userId: string
  onDone: (number: string) => void
}

export default function Step4Number({ userId, onDone }: Props) {
  const [number, setNumber]     = useState<string | null>(null)
  const [revealed, setRevealed] = useState(false)
  const [dots, setDots]         = useState(1)

  // Polling jusqu'à ce que twilio_number soit assigné
  useEffect(() => {
    const poll = setInterval(async () => {
      const { data } = await supabase
        .from('profiles')
        .select('twilio_number')
        .eq('id', userId)
        .single()
      if (data?.twilio_number) {
        clearInterval(poll)
        setNumber(data.twilio_number)
        setTimeout(() => setRevealed(true), 400)
      }
    }, 2000)
    return () => clearInterval(poll)
  }, [userId])

  // Animation des points de chargement
  useEffect(() => {
    if (number) return
    const t = setInterval(() => setDots(d => (d % 3) + 1), 600)
    return () => clearInterval(t)
  }, [number])

  if (!number) {
    return (
      <div className="flex flex-col items-center gap-8 py-6">
        <div className="relative w-24 h-24">
          <div className="absolute inset-0 rounded-full animate-ping opacity-20" style={{ background: BRAND }} />
          <div className="relative w-24 h-24 rounded-full flex items-center justify-center text-4xl" style={{ background: `rgba(59,91,245,0.15)`, border: `2px solid rgba(59,91,245,0.4)` }}>
            📞
          </div>
        </div>

        <div className="text-center">
          <h2 className="text-xl font-bold text-white mb-2">Attribution de votre numéro Mia</h2>
          <p className="text-sm" style={{ color: 'rgba(148,163,184,0.8)' }}>
            Création de votre assistant IA{'.'.repeat(dots)}
          </p>
        </div>

        <div className="w-full v3-card rounded-2xl px-6 py-4 flex flex-col gap-3">
          {['Réservation du numéro', 'Création de Mia', 'Configuration LiveKit'].map((step, i) => (
            <div key={i} className="flex items-center gap-3">
              <div className="w-5 h-5 rounded-full flex-shrink-0 flex items-center justify-center">
                <div className="w-3 h-3 rounded-full animate-pulse" style={{ background: BRAND, animationDelay: `${i * 0.3}s` }} />
              </div>
              <span className="text-sm" style={{ color: 'rgba(148,163,184,0.7)' }}>{step}</span>
            </div>
          ))}
        </div>

        <p className="text-xs text-center" style={{ color: 'rgba(148,163,184,0.45)' }}>
          Généralement moins de 30 secondes
        </p>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-7">
      <div className="text-center">
        <div className="w-16 h-16 rounded-full mx-auto mb-4 flex items-center justify-center" style={{ background: 'rgba(16,185,129,0.15)', border: '2px solid rgba(16,185,129,0.4)' }}>
          <span className="text-3xl">✓</span>
        </div>
        <h2 className="text-2xl font-bold text-white mb-1">Votre numéro Mia est prêt !</h2>
        <p className="text-sm" style={{ color: 'rgba(148,163,184,0.85)' }}>
          Mia répondra à vos clients sur ce numéro.
        </p>
      </div>

      <div
        className="rounded-2xl p-6 text-center transition-all duration-700"
        style={{
          background: 'rgba(59,91,245,0.10)',
          border: '2px solid rgba(59,91,245,0.40)',
          opacity: revealed ? 1 : 0,
          transform: revealed ? 'scale(1)' : 'scale(0.95)',
        }}
      >
        <p className="text-xs font-semibold uppercase tracking-widest mb-2" style={{ color: 'rgba(148,163,184,0.7)' }}>
          Votre numéro Mia dédié
        </p>
        <p className="text-4xl font-black text-white tracking-wide mb-2">
          {formatFrPhone(number)}
        </p>
        <p className="text-xs" style={{ color: 'rgba(148,163,184,0.55)' }}>
          Mia répond sur ce numéro 24h/24 à votre place
        </p>
      </div>

      <div className="v3-card rounded-2xl px-5 py-4">
        <p className="text-xs font-semibold text-white mb-2">À l'étape suivante :</p>
        <p className="text-sm" style={{ color: 'rgba(148,163,184,0.8)' }}>
          On va configurer le renvoi d'appel pour que vos clients atteignent Mia quand vous ne pouvez pas répondre.
        </p>
      </div>

      <button
        onClick={() => onDone(number)}
        className="w-full py-4 rounded-xl text-white text-sm font-bold transition-all flex items-center justify-center gap-2"
        style={{ background: BRAND }}
      >
        Configurer le renvoi →
      </button>
    </div>
  )
}
