import { useState, useEffect } from 'react'

const BRAND = '#3B5BF5'

function formatFrPhone(e164: string): string {
  const local = e164.replace('+33', '0')
  return local.replace(/(\d{2})(?=\d)/g, '$1 ').trim()
}

interface Props {
  fixlyyNumber: string
  onDone: (number: string) => void
}

export default function Step4Number({ fixlyyNumber, onDone }: Props) {
  const [revealed, setRevealed] = useState(false)

  useEffect(() => {
    const t = setTimeout(() => setRevealed(true), 300)
    return () => clearTimeout(t)
  }, [])

  return (
    <div className="flex flex-col gap-7">
      <div className="text-center">
        <div
          className="w-16 h-16 rounded-full mx-auto mb-4 flex items-center justify-center transition-all duration-500"
          style={{
            background: 'rgba(16,185,129,0.15)',
            border: '2px solid rgba(16,185,129,0.4)',
            opacity: revealed ? 1 : 0,
            transform: revealed ? 'scale(1)' : 'scale(0.8)',
          }}
        >
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
          {formatFrPhone(fixlyyNumber)}
        </p>
        <p className="text-xs" style={{ color: 'rgba(148,163,184,0.55)' }}>
          Mia répond sur ce numéro 24h/24 à votre place
        </p>
      </div>

      <div className="v3-card rounded-2xl px-5 py-4">
        <p className="text-xs font-semibold text-white mb-2">À l'étape suivante :</p>
        <p className="text-sm" style={{ color: 'rgba(148,163,184,0.8)' }}>
          On configure le renvoi d'appel pour que vos clients atteignent Mia quand vous ne pouvez pas répondre.
        </p>
      </div>

      <button
        onClick={() => onDone(fixlyyNumber)}
        className="w-full py-4 rounded-xl text-white text-sm font-bold flex items-center justify-center gap-2"
        style={{ background: BRAND }}
      >
        Configurer le renvoi →
      </button>
    </div>
  )
}
