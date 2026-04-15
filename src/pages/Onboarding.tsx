import { useEffect, useState, useRef } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'

const BRAND = '#2850c8'
const POLL_INTERVAL = 3000   // 3s entre chaque check
const POLL_TIMEOUT  = 120000 // 2 min max d'attente

interface Props {
  onDone: () => void
}

type StepStatus = 'pending' | 'loading' | 'done' | 'error'

export default function Onboarding({ onDone }: Props) {
  const { user } = useAuth()
  const [steps, setSteps] = useState([
    { label: 'Votre compte est prêt',             status: 'done'    as StepStatus },
    { label: 'Création de votre assistante IA',   status: 'loading' as StepStatus },
    { label: 'Attribution de votre numéro fixe',  status: 'pending' as StepStatus },
    { label: 'Configuration de votre espace',     status: 'pending' as StepStatus },
  ])
  const [timedOut, setTimedOut] = useState(false)
  const [retrying, setRetrying] = useState(false)
  const startedAt = useRef(Date.now())
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const setStep = (i: number, s: StepStatus) =>
    setSteps(prev => prev.map((st, idx) => idx === i ? { ...st, status: s } : st))

  function startPolling() {
    startedAt.current = Date.now()
    setTimedOut(false)
    setSteps([
      { label: 'Votre compte est prêt',             status: 'done'    },
      { label: 'Création de votre assistante IA',   status: 'loading' },
      { label: 'Attribution de votre numéro fixe',  status: 'pending' },
      { label: 'Configuration de votre espace',     status: 'pending' },
    ])

    if (pollRef.current) clearInterval(pollRef.current)

    pollRef.current = setInterval(async () => {
      if (!user) return

      // Timeout
      if (Date.now() - startedAt.current > POLL_TIMEOUT) {
        clearInterval(pollRef.current!)
        setTimedOut(true)
        setStep(1, 'error')
        return
      }

      const { data } = await supabase
        .from('profiles')
        .select('vapi_assistant_id, twilio_number')
        .eq('id', user.id)
        .single()

      if (data?.vapi_assistant_id) {
        // Assistant créé
        setStep(1, 'done')
        setStep(2, 'loading')

        await new Promise(r => setTimeout(r, 800))

        if (data.twilio_number) {
          setStep(2, 'done')
        } else {
          // Numéro pas dispo (bundle réglementaire ou erreur Twilio)
          setStep(2, 'error')
        }

        setStep(3, 'loading')
        await new Promise(r => setTimeout(r, 600))
        setStep(3, 'done')

        clearInterval(pollRef.current!)
        await new Promise(r => setTimeout(r, 1200))
        onDone()
      }
    }, POLL_INTERVAL)
  }

  async function handleRetry() {
    if (!user) return
    setRetrying(true)

    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) return

      await fetch(
        'https://hxkpmmekaotwmzgqxafp.supabase.co/functions/v1/provision-artisan',
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${session.access_token}`,
          },
        }
      )
    } catch (e) {
      console.error('Retry failed:', e)
    } finally {
      setRetrying(false)
      startPolling()
    }
  }

  useEffect(() => {
    startPolling()
    return () => { if (pollRef.current) clearInterval(pollRef.current) }
  }, [user])

  const doneCount = steps.filter(s => s.status === 'done').length
  const progress = (doneCount / steps.length) * 100

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-white px-4" style={{ fontFamily: 'system-ui, sans-serif' }}>
      <div className="w-full max-w-sm">
        {/* Logo animé */}
        <div className="flex justify-center mb-8">
          <div className="w-20 h-20 rounded-2xl flex items-center justify-center shadow-lg"
            style={{ background: `linear-gradient(135deg, ${BRAND}, #4070e8)` }}>
            <svg width="36" height="36" viewBox="0 0 36 36" fill="none">
              <circle cx="18" cy="18" r="14" stroke="white" strokeWidth="2.5" opacity="0.4" />
              <circle cx="18" cy="18" r="8" stroke="white" strokeWidth="2.5" />
              <path d="M18 10v8l4 4" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </div>
        </div>

        <h1 className="text-2xl font-bold text-center text-gray-900 mb-2">
          On prépare tout pour vous
        </h1>
        <p className="text-sm text-gray-500 text-center mb-8">
          Votre assistante IA et votre numéro fixe sont en cours de création. Cela prend moins d'une minute.
        </p>

        {/* Steps */}
        <div className="flex flex-col gap-3 mb-8">
          {steps.map((step, i) => (
            <div key={i} className="flex items-center gap-3 p-4 rounded-xl border transition-all"
              style={{
                borderColor: step.status === 'done' ? BRAND + '40' : step.status === 'loading' ? BRAND + '60' : step.status === 'error' ? '#FCA5A5' : '#F3F4F6',
                background: step.status === 'done' ? BRAND + '08' : step.status === 'loading' ? BRAND + '05' : step.status === 'error' ? '#FFF5F5' : '#FAFAFA',
              }}>
              <div className="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0">
                {step.status === 'done' && (
                  <div className="w-8 h-8 rounded-full flex items-center justify-center" style={{ background: BRAND }}>
                    <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                      <path d="M2.5 7l3 3 6-6" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  </div>
                )}
                {step.status === 'loading' && (
                  <div className="w-6 h-6 border-2 border-t-transparent rounded-full animate-spin"
                    style={{ borderColor: BRAND, borderTopColor: 'transparent' }} />
                )}
                {step.status === 'error' && (
                  <div className="w-8 h-8 rounded-full bg-amber-100 flex items-center justify-center">
                    <span className="text-amber-600 text-sm">⚠</span>
                  </div>
                )}
                {step.status === 'pending' && (
                  <div className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center">
                    <div className="w-2 h-2 rounded-full bg-gray-300" />
                  </div>
                )}
              </div>
              <div className="flex-1">
                <p className="text-sm font-medium text-gray-800">{step.label}</p>
                {i === 2 && step.status === 'error' && (
                  <p className="text-xs text-amber-600 mt-0.5">Numéro en cours d'attribution — contactez support@fixlyy.fr si le problème persiste</p>
                )}
                {i === 1 && step.status === 'loading' && (
                  <p className="text-xs text-gray-400 mt-0.5">Configuration personnalisée à votre activité…</p>
                )}
              </div>
            </div>
          ))}
        </div>

        {/* Barre de progression */}
        <div className="w-full bg-gray-100 rounded-full h-1.5 mb-2">
          <div className="h-1.5 rounded-full transition-all duration-700"
            style={{ width: `${progress}%`, background: BRAND }} />
        </div>
        <p className="text-xs text-gray-400 text-center mb-6">{Math.round(progress)}%</p>

        {/* Timeout / erreur */}
        {timedOut && (
          <div className="p-4 bg-red-50 rounded-xl border border-red-100">
            <p className="text-sm text-red-700 font-semibold mb-1">La configuration prend plus de temps que prévu</p>
            <p className="text-xs text-red-500 mb-3">Cela peut arriver si notre serveur est occupé. Réessayez ou contactez le support.</p>
            <div className="flex gap-3">
              <button onClick={handleRetry} disabled={retrying}
                className="text-xs font-medium px-4 py-2 rounded-lg text-white disabled:opacity-50 flex items-center gap-1.5"
                style={{ background: BRAND }}>
                {retrying && <div className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin" />}
                {retrying ? 'Relance...' : 'Réessayer'}
              </button>
              <button onClick={onDone} className="text-xs text-gray-400 underline self-center">
                Accéder au dashboard →
              </button>
            </div>
          </div>
        )}

        {/* Note rassurante pendant l'attente */}
        {!timedOut && (
          <p className="text-[11px] text-gray-300 text-center">
            Ne fermez pas cette fenêtre · Vous serez redirigé automatiquement
          </p>
        )}
      </div>
    </div>
  )
}
