import { useState, useEffect, useRef } from 'react'
import { supabase } from '@/lib/supabase'

const BRAND            = '#3B5BFA'
const TEXT             = '#1A1A2E'
const MUTED            = '#6B7280'
const BORDER           = '#E5E7EB'
const CALL_POLL_INTERVAL = 3000
const CALL_TIMEOUT_MS    = 180_000

function formatFrPhone(e164: string): string {
  const local = e164.replace('+33', '0')
  return local.replace(/(\d{2})(?=\d)/g, '$1 ').trim()
}

type Phase = 'revealing' | 'calling' | 'call_active' | 'call_ended' | 'call_failed'

interface Props {
  fixlyyNumber: string
  artisanPhone: string
  userId: string
  onDone: (number: string) => void
}

export default function Step4Number({ fixlyyNumber, artisanPhone, userId, onDone }: Props) {
  const [phase, setPhase]       = useState<Phase>('revealing')
  const [revealed, setRevealed] = useState(false)
  const [callError, setCallError] = useState('')
  const pollRef    = useRef<ReturnType<typeof setInterval> | null>(null)
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const callStartRef = useRef<string>('')

  useEffect(() => {
    const t = setTimeout(() => {
      setRevealed(true)
      setTimeout(() => initiateCall(), 1500)
    }, 300)
    return () => clearTimeout(t)
  }, [])

  useEffect(() => () => {
    if (pollRef.current)    clearInterval(pollRef.current)
    if (timeoutRef.current) clearTimeout(timeoutRef.current)
  }, [])

  async function initiateCall() {
    setPhase('calling')
    callStartRef.current = new Date().toISOString()

    if (!artisanPhone || !/^\+[1-9]\d{7,14}$/.test(artisanPhone)) {
      setCallError(`phone_invalide: "${artisanPhone}"`)
      setPhase('call_failed')
      return
    }

    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) throw new Error('session_missing')

      const res = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/initiate-outbound-call`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${session.access_token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ target_phone: artisanPhone, onboarding_call: true }),
        },
      )

      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err.error || `HTTP ${res.status}`)
      }

      setPhase('call_active')
      startCallPolling()
    } catch (e: any) {
      console.error('[step4] initiate-outbound-call failed:', e.message)
      setCallError(e.message || 'Erreur lors de l\'appel')
      setPhase('call_failed')
    }
  }

  function startCallPolling() {
    const startTime = callStartRef.current
    timeoutRef.current = setTimeout(() => {
      if (pollRef.current) clearInterval(pollRef.current)
      setPhase('call_ended')
    }, CALL_TIMEOUT_MS)

    pollRef.current = setInterval(async () => {
      const { data } = await supabase
        .from('calls')
        .select('id')
        .eq('artisan_id', userId)
        .gte('created_at', startTime)
        .maybeSingle()

      if (data?.id) {
        clearInterval(pollRef.current!)
        clearTimeout(timeoutRef.current!)
        setPhase('call_ended')
      }
    }, CALL_POLL_INTERVAL)
  }

  function retryCall() {
    setCallError('')
    setPhase('calling')
    if (pollRef.current)    clearInterval(pollRef.current)
    if (timeoutRef.current) clearTimeout(timeoutRef.current)
    initiateCall()
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>

      {/* Badge succès + titre */}
      <div style={{ textAlign: 'center' }}>
        <div style={{
          width: 64, height: 64, borderRadius: '50%', margin: '0 auto 16px',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          background: 'rgba(5,150,105,0.12)', border: '2px solid rgba(5,150,105,0.35)',
          fontSize: 26,
          opacity: revealed ? 1 : 0,
          transform: revealed ? 'scale(1)' : 'scale(0.8)',
          transition: 'opacity 0.5s ease, transform 0.5s ease',
        }}>✓</div>
        <h2 style={{ fontSize: 22, fontWeight: 800, color: TEXT, marginBottom: 6 }}>
          Votre numéro Mia est prêt !
        </h2>
        <p style={{ fontSize: 14, color: MUTED }}>
          Mia répondra à vos clients sur ce numéro.
        </p>
      </div>

      {/* Carte numéro */}
      <div style={{
        borderRadius: 14, padding: '20px 24px', textAlign: 'center',
        background: `linear-gradient(135deg, rgba(59,91,250,0.08) 0%, rgba(59,91,250,0.04) 100%)`,
        border: `2px solid rgba(59,91,250,0.25)`,
        boxShadow: '0 2px 16px rgba(59,91,250,0.08)',
        opacity: revealed ? 1 : 0,
        transform: revealed ? 'scale(1)' : 'scale(0.95)',
        transition: 'opacity 0.7s ease, transform 0.7s ease',
      }}>
        <p style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.10em', color: MUTED, marginBottom: 10 }}>
          Votre numéro Mia dédié
        </p>
        <p style={{ fontSize: 34, fontWeight: 900, color: TEXT, letterSpacing: '0.04em', marginBottom: 8 }}>
          {formatFrPhone(fixlyyNumber)}
        </p>
        <p style={{ fontSize: 12, color: '#9CA3AF' }}>
          Mia répond sur ce numéro 24h/24 à votre place
        </p>
      </div>

      {/* État de l'appel */}
      {phase === 'revealing' && (
        <div style={{
          background: '#fff', border: `1px solid ${BORDER}`, borderRadius: 12,
          padding: '14px 16px', display: 'flex', alignItems: 'center', gap: 12,
        }}>
          <div style={{
            width: 16, height: 16, borderRadius: '50%', flexShrink: 0,
            border: `2px solid ${BRAND}`, borderTopColor: 'transparent',
            animation: 'spin 0.8s linear infinite',
          }} />
          <p style={{ fontSize: 14, color: MUTED }}>Préparation de votre appel…</p>
        </div>
      )}

      {phase === 'calling' && (
        <div style={{
          background: '#fff', border: `1px solid ${BORDER}`, borderRadius: 12,
          padding: '14px 16px', display: 'flex', alignItems: 'center', gap: 12,
        }}>
          <div style={{
            width: 16, height: 16, borderRadius: '50%', flexShrink: 0,
            border: `2px solid ${BRAND}`, borderTopColor: 'transparent',
            animation: 'spin 0.8s linear infinite',
          }} />
          <p style={{ fontSize: 14, color: MUTED }}>Mia vous appelle…</p>
        </div>
      )}

      {phase === 'call_active' && (
        <div style={{
          background: 'rgba(5,150,105,0.06)', border: '2px solid rgba(5,150,105,0.3)',
          borderRadius: 12, padding: '16px', display: 'flex', flexDirection: 'column', gap: 10,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{ position: 'relative', flexShrink: 0, width: 12, height: 12 }}>
              <div style={{ width: 12, height: 12, borderRadius: '50%', background: '#059669' }} />
              <div style={{
                position: 'absolute', inset: 0, borderRadius: '50%', background: '#059669',
                animation: 'ping 1.2s cubic-bezier(0,0,0.2,1) infinite', opacity: 0.5,
              }} />
            </div>
            <p style={{ fontSize: 14, fontWeight: 700, color: TEXT }}>
              Mia vous appelle depuis {formatFrPhone(fixlyyNumber)}
            </p>
          </div>
          <p style={{ fontSize: 13, color: MUTED }}>
            Décrochez — elle va se présenter et vous expliquer votre formule.
          </p>
          <button
            onClick={retryCall}
            style={{ fontSize: 12, color: MUTED, background: 'none', border: 'none', cursor: 'pointer', textAlign: 'left', textDecoration: 'underline', padding: 0 }}
          >
            Je n'ai pas reçu l'appel → Rappeler
          </button>
        </div>
      )}

      {phase === 'call_ended' && (
        <div style={{
          background: 'rgba(59,91,250,0.06)', border: `2px solid rgba(59,91,250,0.2)`,
          borderRadius: 12, padding: '16px', display: 'flex', flexDirection: 'column', gap: 6,
        }}>
          <p style={{ fontSize: 14, fontWeight: 700, color: TEXT }}>Vous avez rencontré Mia !</p>
          <p style={{ fontSize: 13, color: MUTED }}>
            Configurez maintenant le renvoi d'appel pour que Mia prenne le relais.
          </p>
        </div>
      )}

      {phase === 'call_failed' && (
        <div style={{
          background: 'rgba(239,68,68,0.06)', border: '1.5px solid rgba(239,68,68,0.3)',
          borderRadius: 12, padding: '16px', display: 'flex', flexDirection: 'column', gap: 10,
        }}>
          <p style={{ fontSize: 14, color: '#DC2626', fontWeight: 600 }}>
            L'appel n'a pas pu aboutir. Vérifiez votre connexion et réessayez.
          </p>
          {callError && (
            <p style={{ fontSize: 11, fontFamily: 'monospace', color: '#EF4444', wordBreak: 'break-all' }}>
              {callError}
            </p>
          )}
          <button
            onClick={retryCall}
            style={{ fontSize: 13, fontWeight: 700, color: BRAND, background: 'none', border: 'none', cursor: 'pointer', textAlign: 'left', textDecoration: 'underline', padding: 0 }}
          >
            Relancer l'appel
          </button>
        </div>
      )}

      {/* CTA principal */}
      {(phase === 'call_ended' || phase === 'call_failed') && (
        <button
          onClick={() => onDone(fixlyyNumber)}
          style={{
            width: '100%', padding: '15px', borderRadius: 10,
            background: BRAND, color: '#fff', fontSize: 15, fontWeight: 800,
            border: 'none', cursor: 'pointer',
            boxShadow: '0 4px 14px rgba(59,91,250,0.30)',
          }}
        >
          Configurer le renvoi →
        </button>
      )}

      {/* Passer si call_active */}
      {phase === 'call_active' && (
        <button
          onClick={() => onDone(fixlyyNumber)}
          style={{ fontSize: 13, color: '#9CA3AF', background: 'none', border: 'none', cursor: 'pointer', textDecoration: 'underline', textAlign: 'center' }}
        >
          Passer cette étape
        </button>
      )}

      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
        @keyframes ping { 75%,100% { transform: scale(2); opacity: 0; } }
      `}</style>
    </div>
  )
}
