import { useState, useEffect, useRef } from 'react'
import { supabase } from '@/lib/supabase'

const BRAND = '#3B5BF5'
const CALL_POLL_INTERVAL = 3000
const CALL_TIMEOUT_MS    = 180_000 // 3 min max

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
  const [phase, setPhase]     = useState<Phase>('revealing')
  const [revealed, setRevealed] = useState(false)
  const [callError, setCallError] = useState('')
  const pollRef    = useRef<ReturnType<typeof setInterval> | null>(null)
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const callStartRef = useRef<string>('')

  useEffect(() => {
    const t = setTimeout(() => {
      setRevealed(true)
      // Lancer l'appel 1.5s après la révélation du numéro
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
          body: JSON.stringify({
            target_phone:   artisanPhone,
            onboarding_call: true,
          }),
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

    // Timeout global 3 min
    timeoutRef.current = setTimeout(() => {
      if (pollRef.current) clearInterval(pollRef.current)
      setPhase('call_ended') // on laisse avancer même sans détection
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
    <div className="flex flex-col gap-7">

      {/* Numéro Mia */}
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

      {/* État de l'appel Mia */}
      {phase === 'revealing' && (
        <div className="v3-card rounded-2xl px-5 py-4 flex items-center gap-3">
          <div className="w-4 h-4 border-2 border-t-transparent rounded-full animate-spin flex-shrink-0" style={{ borderColor: BRAND }} />
          <p className="text-sm" style={{ color: 'rgba(148,163,184,0.8)' }}>Préparation de votre appel…</p>
        </div>
      )}

      {phase === 'calling' && (
        <div className="v3-card rounded-2xl px-5 py-4 flex items-center gap-3">
          <div className="w-4 h-4 border-2 border-t-transparent rounded-full animate-spin flex-shrink-0" style={{ borderColor: BRAND }} />
          <p className="text-sm" style={{ color: 'rgba(148,163,184,0.8)' }}>Mia vous appelle…</p>
        </div>
      )}

      {phase === 'call_active' && (
        <div
          className="rounded-2xl px-5 py-4 flex flex-col gap-3"
          style={{ background: 'rgba(16,185,129,0.08)', border: '1.5px solid rgba(16,185,129,0.3)' }}
        >
          <div className="flex items-center gap-3">
            <div className="relative flex-shrink-0">
              <div className="w-3 h-3 rounded-full" style={{ background: '#10B981' }} />
              <div className="absolute inset-0 w-3 h-3 rounded-full animate-ping opacity-60" style={{ background: '#10B981' }} />
            </div>
            <p className="text-sm font-medium text-white">
              Mia vous appelle depuis {formatFrPhone(fixlyyNumber)}
            </p>
          </div>
          <p className="text-xs" style={{ color: 'rgba(148,163,184,0.7)' }}>
            Décrochez — elle va se présenter et vous expliquer votre formule.
          </p>
          <button
            onClick={retryCall}
            className="text-xs underline underline-offset-2 text-left mt-1"
            style={{ color: 'rgba(148,163,184,0.5)' }}
          >
            Je n'ai pas reçu l'appel → Rappeler
          </button>
        </div>
      )}

      {phase === 'call_ended' && (
        <div
          className="rounded-2xl px-5 py-4 flex flex-col gap-2"
          style={{ background: 'rgba(59,91,245,0.08)', border: '1.5px solid rgba(59,91,245,0.3)' }}
        >
          <p className="text-sm font-medium text-white">Vous avez rencontré Mia !</p>
          <p className="text-xs" style={{ color: 'rgba(148,163,184,0.7)' }}>
            Configurez maintenant le renvoi d'appel pour que Mia prenne le relais.
          </p>
        </div>
      )}

      {phase === 'call_failed' && (
        <div
          className="rounded-2xl px-5 py-4 flex flex-col gap-3"
          style={{ background: 'rgba(239,68,68,0.08)', border: '1.5px solid rgba(239,68,68,0.3)' }}
        >
          <p className="text-sm" style={{ color: 'rgba(239,68,68,0.9)' }}>
            L'appel n'a pas pu aboutir. Vérifiez votre connexion et réessayez.
          </p>
          <button
            onClick={retryCall}
            className="text-xs font-semibold underline underline-offset-2"
            style={{ color: BRAND }}
          >
            Relancer l'appel
          </button>
        </div>
      )}

      {/* CTA */}
      {(phase === 'call_ended' || phase === 'call_failed') && (
        <button
          onClick={() => onDone(fixlyyNumber)}
          className="w-full py-4 rounded-xl text-white text-sm font-bold flex items-center justify-center gap-2"
          style={{ background: BRAND }}
        >
          Configurer le renvoi →
        </button>
      )}

      {/* Passer l'appel si call_active depuis longtemps */}
      {phase === 'call_active' && (
        <button
          onClick={() => onDone(fixlyyNumber)}
          className="text-xs text-center underline underline-offset-2"
          style={{ color: 'rgba(148,163,184,0.4)' }}
        >
          Passer cette étape
        </button>
      )}
    </div>
  )
}
