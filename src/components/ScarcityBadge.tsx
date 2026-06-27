import { useEffect, useRef, useState } from 'react'

interface Props {
  remaining: number
  loading?: boolean
}

const MIN_DISPLAY = 5

export default function ScarcityBadge({ remaining, loading = false }: Props) {
  const clamped = Math.max(remaining, MIN_DISPLAY)
  const [display, setDisplay] = useState(clamped)
  const [flash, setFlash]     = useState(false)
  const prevRef               = useRef(clamped)

  useEffect(() => {
    const next = Math.max(remaining, MIN_DISPLAY)
    if (next !== prevRef.current) {
      setFlash(true)
      const t = setTimeout(() => { setDisplay(next); setFlash(false) }, 200)
      prevRef.current = next
      return () => clearTimeout(t)
    } else {
      setDisplay(next)
    }
  }, [remaining])

  if (loading) return null

  return (
    <>
      <style>{`
        @keyframes scarcityPulse {
          0%, 100% { opacity: 1; }
          50%       { opacity: 0.65; }
        }
        @keyframes scarcityFlash {
          0%   { opacity: 1; }
          40%  { opacity: 0.2; }
          100% { opacity: 1; }
        }
      `}</style>
      <div style={{
        display: 'flex', alignItems: 'center', gap: 10,
        padding: '12px 16px', borderRadius: 10,
        background: 'linear-gradient(135deg, #FFF3E0 0%, #FFE0B2 100%)',
        border: '2px solid #FB923C',
        boxShadow: '0 2px 12px rgba(251,146,60,0.25)',
        animation: 'scarcityPulse 2.5s ease-in-out infinite',
        width: '100%',
      }}>
        <span style={{ fontSize: 20, flexShrink: 0 }}>🔥</span>
        <span style={{ fontSize: 13, fontWeight: 700, color: '#C2410C', lineHeight: 1.4 }}>
          Il ne reste que{' '}
          <span style={{
            animation: flash ? 'scarcityFlash 0.4s ease' : 'none',
            display: 'inline-block',
            color: '#DC2626',
            fontSize: 15,
          }}>
            {display}
          </span>
          {' '}place{display > 1 ? 's' : ''} ce mois-ci{' '}
          —{' '}Prix fondateurs{' '}
          <strong style={{ color: '#C2410C', fontSize: 14 }}>197€</strong>
          {' '}<span style={{ fontSize: 12, fontWeight: 400, color: '#9A3412' }}>(au lieu de 497€)</span>
        </span>
      </div>
    </>
  )
}
