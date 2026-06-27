import { useEffect, useRef, useState } from 'react'

interface Props {
  remaining: number
  loading?: boolean
}

export default function ScarcityBadge({ remaining, loading = false }: Props) {
  const [display, setDisplay] = useState(remaining)
  const [flash, setFlash]     = useState(false)
  const prevRef               = useRef(remaining)

  useEffect(() => {
    if (remaining !== prevRef.current) {
      setFlash(true)
      const t = setTimeout(() => { setDisplay(remaining); setFlash(false) }, 200)
      prevRef.current = remaining
      return () => clearTimeout(t)
    } else {
      setDisplay(remaining)
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
        display: 'inline-flex', alignItems: 'center', gap: 8,
        padding: '8px 14px', borderRadius: 8,
        background: 'rgba(251,146,60,0.12)', border: '1px solid rgba(251,146,60,0.40)',
        animation: 'scarcityPulse 2.5s ease-in-out infinite',
      }}>
        <span style={{ fontSize: 14 }}>⚠️</span>
        <span style={{ fontSize: 13, fontWeight: 700, color: '#FB923C', lineHeight: 1.3 }}>
          Il ne reste que{' '}
          <span style={{
            animation: flash ? 'scarcityFlash 0.4s ease' : 'none',
            display: 'inline-block',
          }}>
            {display}
          </span>
          {' '}place{display > 1 ? 's' : ''} ce mois-ci —{' '}
          Prix fondateurs <strong style={{ color: '#fff' }}>197€</strong>
        </span>
      </div>
    </>
  )
}
