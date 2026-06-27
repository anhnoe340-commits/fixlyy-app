import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import { trackEvent } from '@/utils/pixel'

const BRAND         = '#3B5BFA'
const TEXT          = '#1A1A2E'
const MUTED         = '#6B7280'
const BORDER        = '#E5E7EB'
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
        trackEvent('CompleteRegistration')
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
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 24, padding: '24px 0', textAlign: 'center' }}>
        <div style={{
          width: 64, height: 64, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 28,
          background: 'rgba(239,68,68,0.10)', border: '2px solid rgba(239,68,68,0.3)',
        }}>⏱</div>
        <div>
          <h2 style={{ fontSize: 20, fontWeight: 800, color: TEXT, marginBottom: 8 }}>Provisioning en cours…</h2>
          <p style={{ fontSize: 14, color: MUTED }}>
            La configuration prend plus de temps que prévu. Réessayez dans quelques instants.
          </p>
        </div>
        <button
          onClick={() => setPollKey(k => k + 1)}
          style={{ width: '100%', padding: '14px', borderRadius: 10, background: BRAND, color: '#fff', fontSize: 14, fontWeight: 700, border: 'none', cursor: 'pointer' }}
        >
          Réessayer
        </button>
        <a href="mailto:support@fixlyy.fr" style={{ fontSize: 13, color: MUTED, textDecoration: 'underline' }}>
          Contacter le support
        </a>
      </div>
    )
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 28, padding: '24px 0' }}>
      <div style={{ position: 'relative', width: 96, height: 96 }}>
        <div style={{
          position: 'absolute', inset: 0, borderRadius: '50%',
          background: BRAND, opacity: 0.15,
          animation: 'ping 1.5s cubic-bezier(0,0,0.2,1) infinite',
        }} />
        <div style={{
          position: 'relative', width: 96, height: 96, borderRadius: '50%',
          display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 36,
          background: `rgba(59,91,250,0.10)`, border: `2px solid rgba(59,91,250,0.3)`,
        }}>📞</div>
      </div>

      <div style={{ textAlign: 'center' }}>
        <h2 style={{ fontSize: 20, fontWeight: 800, color: TEXT, marginBottom: 6 }}>Paiement confirmé !</h2>
        <p style={{ fontSize: 14, color: MUTED }}>
          Création de votre assistante Mia{'.'.repeat(dots)}
        </p>
      </div>

      <div style={{
        width: '100%', background: '#fff', border: `1px solid ${BORDER}`,
        borderRadius: 14, padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: 14,
        boxShadow: '0 1px 6px rgba(0,0,0,0.04)',
      }}>
        {[
          { label: 'Paiement confirmé',     done: true  },
          { label: 'Réservation du numéro', done: false },
          { label: 'Configuration de Mia',  done: false },
        ].map((step, i) => (
          <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={{ width: 22, height: 22, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              {step.done
                ? <div style={{ width: 20, height: 20, borderRadius: '50%', background: '#059669', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontSize: 11, fontWeight: 700 }}>✓</div>
                : <div style={{ width: 14, height: 14, borderRadius: '50%', background: BRAND, opacity: 0.6, animation: `pulse 1.5s ease-in-out ${i * 0.3}s infinite` }} />
              }
            </div>
            <span style={{ fontSize: 14, fontWeight: 600, color: step.done ? '#059669' : MUTED }}>
              {step.label}
            </span>
          </div>
        ))}
      </div>

      <p style={{ fontSize: 12, color: '#9CA3AF', textAlign: 'center' }}>
        Généralement moins de 30 secondes
      </p>

      <style>{`
        @keyframes ping { 75%,100% { transform: scale(1.8); opacity: 0; } }
        @keyframes pulse { 0%,100% { opacity: 0.6; } 50% { opacity: 0.2; } }
      `}</style>
    </div>
  )
}
