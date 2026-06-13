import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'

const BRAND         = '#3B5BF5'
const POLL_INTERVAL = 2000
const POLL_TIMEOUT  = 30000

interface Props {
  userId: string
  onDone: (twilio_number: string) => void
}

export default function Step3Provisioning({ userId, onDone }: Props) {
  const [timedOut, setTimedOut] = useState(false)
  const [dots, setDots]         = useState(1)
  const [pollKey, setPollKey]   = useState(0)

  useEffect(() => {
    setTimedOut(false)
    const startTime = Date.now()

    const poll = setInterval(async () => {
      if (Date.now() - startTime > POLL_TIMEOUT) {
        clearInterval(poll)
        setTimedOut(true)
        return
      }
      const { data } = await supabase
        .from('profiles')
        .select('provisioning_status, twilio_number')
        .eq('id', userId)
        .single()
      if (data?.provisioning_status === 'done' && data?.twilio_number) {
        clearInterval(poll)
        onDone(data.twilio_number)
      }
    }, POLL_INTERVAL)

    return () => clearInterval(poll)
  }, [userId, pollKey])

  useEffect(() => {
    if (timedOut) return
    const t = setInterval(() => setDots(d => (d % 3) + 1), 600)
    return () => clearInterval(t)
  }, [timedOut])

  if (timedOut) {
    return (
      <div className="flex flex-col items-center gap-6 py-6 text-center">
        <div
          className="w-16 h-16 rounded-full flex items-center justify-center text-3xl"
          style={{ background: 'rgba(239,68,68,0.12)', border: '2px solid rgba(239,68,68,0.3)' }}
        >
          ⏱
        </div>
        <div>
          <h2 className="text-xl font-bold text-white mb-2">Provisioning en cours…</h2>
          <p className="text-sm" style={{ color: 'rgba(148,163,184,0.8)' }}>
            La configuration prend plus de temps que prévu. Réessayez dans quelques instants.
          </p>
        </div>
        <button
          onClick={() => setPollKey(k => k + 1)}
          className="w-full py-4 rounded-xl text-white text-sm font-bold"
          style={{ background: BRAND }}
        >
          Réessayer
        </button>
        <a
          href="mailto:support@fixlyy.fr"
          className="text-sm underline underline-offset-2"
          style={{ color: 'rgba(148,163,184,0.6)' }}
        >
          Contacter le support
        </a>
      </div>
    )
  }

  return (
    <div className="flex flex-col items-center gap-8 py-6">
      <div className="relative w-24 h-24">
        <div className="absolute inset-0 rounded-full animate-ping opacity-20" style={{ background: BRAND }} />
        <div
          className="relative w-24 h-24 rounded-full flex items-center justify-center text-4xl"
          style={{ background: 'rgba(59,91,245,0.15)', border: '2px solid rgba(59,91,245,0.4)' }}
        >
          📞
        </div>
      </div>

      <div className="text-center">
        <h2 className="text-xl font-bold text-white mb-2">Paiement confirmé !</h2>
        <p className="text-sm" style={{ color: 'rgba(148,163,184,0.8)' }}>
          Création de votre assistante Mia{'.'.repeat(dots)}
        </p>
      </div>

      <div className="w-full v3-card rounded-2xl px-6 py-4 flex flex-col gap-3">
        {[
          { label: 'Paiement confirmé',    done: true  },
          { label: 'Réservation du numéro', done: false },
          { label: 'Configuration de Mia',  done: false },
        ].map((step, i) => (
          <div key={i} className="flex items-center gap-3">
            <div className="w-5 h-5 rounded-full flex-shrink-0 flex items-center justify-center">
              {step.done
                ? <div className="w-4 h-4 rounded-full flex items-center justify-center text-[10px] font-bold text-white" style={{ background: '#10B981' }}>✓</div>
                : <div className="w-3 h-3 rounded-full animate-pulse" style={{ background: BRAND, animationDelay: `${i * 0.3}s` }} />
              }
            </div>
            <span className="text-sm" style={{ color: step.done ? '#10B981' : 'rgba(148,163,184,0.7)' }}>
              {step.label}
            </span>
          </div>
        ))}
      </div>

      <p className="text-xs text-center" style={{ color: 'rgba(148,163,184,0.45)' }}>
        Généralement moins de 30 secondes
      </p>
    </div>
  )
}
