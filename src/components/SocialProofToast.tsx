import { useState, useEffect, useRef, useCallback } from 'react'

const SUPABASE_URL = 'https://hxkpmmekaotwmzgqxafp.supabase.co'

const FAKE_SIGNUPS = [
  { name: 'Martin',  trade: 'Plombier',        city: 'Lyon' },
  { name: 'Thomas',  trade: 'Électricien',      city: 'Marseille' },
  { name: 'Léa',     trade: 'Peintre',          city: 'Bordeaux' },
  { name: 'Kevin',   trade: 'Serrurier',        city: 'Toulouse' },
  { name: 'David',   trade: 'Chauffagiste',     city: 'Nantes' },
  { name: 'Sophie',  trade: 'Maçon',            city: 'Lille' },
  { name: 'Julien',  trade: 'Garagiste',        city: 'Strasbourg' },
  { name: 'Ahmed',   trade: 'Menuisier',        city: 'Nice' },
  { name: 'Pierre',  trade: 'Plombier',         city: 'Rennes' },
  { name: 'Marie',   trade: 'Électricienne',    city: 'Montpellier' },
  { name: 'Karim',   trade: 'Serrurier',        city: 'Paris' },
  { name: 'Lucas',   trade: 'Chauffagiste',     city: 'Grenoble' },
]

export function useSocialProof() {
  const [remaining, setRemaining] = useState(10)
  const [loading, setLoading]     = useState(true)

  useEffect(() => {
    fetch(`${SUPABASE_URL}/functions/v1/get-slots-remaining`)
      .then(r => r.json())
      .then(d => { setRemaining(d.remaining ?? 10); setLoading(false) })
      .catch(() => { setRemaining(10); setLoading(false) })
  }, [])

  const decrement = useCallback(() => {
    setRemaining(prev => Math.max(1, prev - 1))
  }, [])

  return { remaining, loading, decrement }
}

interface Props {
  onDecrement: () => void
}

export default function SocialProofToast({ onDecrement }: Props) {
  const [visible, setVisible] = useState(false)
  const [current, setCurrent] = useState<typeof FAKE_SIGNUPS[0] | null>(null)
  const lastIdx  = useRef(-1)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const aliveRef = useRef(true)

  const scheduleNext = useCallback(() => {
    const delay = 25_000 + Math.random() * 20_000
    timerRef.current = setTimeout(() => {
      if (!aliveRef.current) return
      let idx: number
      do { idx = Math.floor(Math.random() * FAKE_SIGNUPS.length) }
      while (idx === lastIdx.current)
      lastIdx.current = idx
      setCurrent(FAKE_SIGNUPS[idx])
      setVisible(true)
      setTimeout(() => { if (aliveRef.current) onDecrement() }, 2_000)
      setTimeout(() => {
        if (!aliveRef.current) return
        setVisible(false)
        scheduleNext()
      }, 4_000)
    }, delay)
  }, [onDecrement])

  useEffect(() => {
    aliveRef.current = true
    scheduleNext()
    return () => {
      aliveRef.current = false
      if (timerRef.current) clearTimeout(timerRef.current)
    }
  }, [scheduleNext])

  if (!visible || !current) return null

  return (
    <>
      <style>{`
        @keyframes spSlideIn {
          from { transform: translateX(-110%); opacity: 0; }
          to   { transform: translateX(0);     opacity: 1; }
        }
      `}</style>
      <div style={{
        position: 'fixed', bottom: 24, left: 24, zIndex: 9999,
        display: 'flex', alignItems: 'center', gap: 12,
        padding: '12px 16px', borderRadius: 12,
        background: '#1A1A2E', border: '1px solid #3B5BFA',
        color: '#fff', boxShadow: '0 8px 32px rgba(0,0,0,0.4)',
        animation: 'spSlideIn 0.35s ease', maxWidth: 320,
      }}>
        <div style={{
          width: 36, height: 36, borderRadius: '50%', flexShrink: 0,
          background: 'linear-gradient(135deg,#4A6EFF,#3B5BF5)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontWeight: 900, fontSize: 14, color: '#fff',
        }}>
          {current.name.charAt(0)}
        </div>
        <div>
          <p style={{ fontSize: 13, fontWeight: 600, margin: 0, lineHeight: 1.3 }}>
            ✅ {current.name} ({current.trade}, {current.city})
          </p>
          <p style={{ fontSize: 11, color: 'rgba(255,255,255,0.6)', margin: 0 }}>
            vient de rejoindre Fixlyy
          </p>
        </div>
      </div>
    </>
  )
}
