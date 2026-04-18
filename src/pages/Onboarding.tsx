import { useEffect, useState, useRef } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'

const BRAND = '#2850c8'
const POLL_INTERVAL = 1500
const POLL_TIMEOUT  = 120000

interface Props {
  onDone: () => void
}

type StepStatus = 'pending' | 'loading' | 'done' | 'error'
type Phase = 'provisioning' | 'setup'

// Formate +33912345678 → 09 12 34 56 78
function formatFrPhone(e164: string): string {
  const local = e164.replace('+33', '0')
  return local.replace(/(\d{2})(?=\d)/g, '$1 ').trim()
}

export default function Onboarding({ onDone }: Props) {
  const { user } = useAuth()
  const [phase, setPhase] = useState<Phase>('provisioning')
  const [twilioNumber, setTwilioNumber] = useState<string | null>(null)
  const [copied, setCopied] = useState<string | null>(null)
  const [steps, setSteps] = useState([
    { label: 'Votre compte est prêt',              status: 'done'    as StepStatus },
    { label: 'Création de votre assistante IA',    status: 'loading' as StepStatus },
    { label: 'Attribution de votre numéro Fixlyy', status: 'pending' as StepStatus },
    { label: 'Configuration de votre espace',      status: 'pending' as StepStatus },
  ])
  const [timedOut, setTimedOut] = useState(false)
  const [retrying, setRetrying] = useState(false)
  const startedAt = useRef(Date.now())
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const setStep = (i: number, s: StepStatus) =>
    setSteps(prev => prev.map((st, idx) => idx === i ? { ...st, status: s } : st))

  function copyCode(code: string) {
    navigator.clipboard.writeText(code)
    setCopied(code)
    setTimeout(() => setCopied(null), 2000)
  }

  function startPolling() {
    startedAt.current = Date.now()
    setTimedOut(false)
    setSteps([
      { label: 'Votre compte est prêt',              status: 'done'    },
      { label: 'Création de votre assistante IA',    status: 'loading' },
      { label: 'Attribution de votre numéro Fixlyy', status: 'pending' },
      { label: 'Configuration de votre espace',      status: 'pending' },
    ])

    if (pollRef.current) clearInterval(pollRef.current)

    pollRef.current = setInterval(async () => {
      if (!user) return

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
        setStep(1, 'done')
        setStep(2, 'loading')
        await new Promise(r => setTimeout(r, 800))

        if (data.twilio_number) {
          setStep(2, 'done')
          setTwilioNumber(data.twilio_number)
        } else {
          setStep(2, 'error')
        }

        setStep(3, 'loading')
        await new Promise(r => setTimeout(r, 600))
        setStep(3, 'done')

        clearInterval(pollRef.current!)
        await new Promise(r => setTimeout(r, 1000))
        setPhase('setup') // affiche l'écran de configuration renvoi
      }
    }, POLL_INTERVAL)
  }

  async function triggerProvision() {
    if (!user) return
    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) return
      const res = await fetch(
        'https://hxkpmmekaotwmzgqxafp.supabase.co/functions/v1/provision-artisan',
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${session.access_token}`,
          },
        }
      )
      if (!res.ok) {
        const err = await res.text()
        console.error('provision-artisan error:', res.status, err)
        if (res.status === 404) {
          // Profil introuvable — données onboarding non sauvegardées
          // Rediriger vers onboarding pour re-saisir les infos
          clearInterval(pollRef.current!)
          setTimedOut(true)
          setStep(1, 'error')
        }
      }
    } catch (e) {
      console.error('Auto-provision trigger failed:', e)
    }
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
    triggerProvision()
    return () => { if (pollRef.current) clearInterval(pollRef.current) }
  }, [user])

  // ── Écran de provisionnement ─────────────────────────────────────────────────
  if (phase === 'provisioning') {
    const doneCount = steps.filter(s => s.status === 'done').length
    const progress = (doneCount / steps.length) * 100

    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-white px-4">
        <div className="w-full max-w-sm">
          <div className="flex justify-center mb-8">
            <img src="/logo-icon.png" alt="Fixlyy" className="w-20 h-20 object-contain" />
          </div>

          <h1 className="text-2xl font-bold text-center text-gray-900 mb-2">
            On prépare tout pour vous
          </h1>
          <p className="text-sm text-gray-500 text-center mb-8">
            Votre assistante IA et votre numéro fixe sont en cours de création. Cela prend environ 30 secondes.
          </p>

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
                    <p className="text-xs text-amber-600 mt-0.5">Numéro en cours d'attribution — contactez support@fixlyy.fr</p>
                  )}
                  {i === 1 && step.status === 'loading' && (
                    <p className="text-xs text-gray-400 mt-0.5">Configuration personnalisée à votre activité…</p>
                  )}
                </div>
              </div>
            ))}
          </div>

          <div className="w-full bg-gray-100 rounded-full h-1.5 mb-2">
            <div className="h-1.5 rounded-full transition-all duration-700"
              style={{ width: `${progress}%`, background: BRAND }} />
          </div>
          <p className="text-xs text-gray-400 text-center mb-6">{Math.round(progress)}%</p>

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

          {!timedOut && (
            <p className="text-[11px] text-gray-300 text-center">
              Ne fermez pas cette fenêtre · Vous serez redirigé automatiquement
            </p>
          )}
        </div>
      </div>
    )
  }

  // ── Écran de configuration renvoi d'appel ────────────────────────────────────
  const displayNumber = twilioNumber ? formatFrPhone(twilioNumber) : null
  const e164 = twilioNumber ?? ''

  const forwardingOptions = [
    {
      label: 'Renvoi total',
      desc: 'Tous vos appels → assistante IA (recommandé)',
      code: `**21*${e164}#`,
      badge: 'Recommandé',
    },
    {
      label: 'Si occupé',
      desc: 'Uniquement quand vous êtes déjà en ligne',
      code: `**67*${e164}#`,
      badge: null,
    },
    {
      label: 'Si pas de réponse',
      desc: 'Quand vous ne décrochez pas',
      code: `**61*${e164}#`,
      badge: null,
    },
  ]

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-white px-4 py-12">
      <div className="w-full max-w-md">
        {/* Header */}
        <div className="flex justify-center mb-6">
          <div className="w-16 h-16 rounded-2xl flex items-center justify-center shadow-md"
            style={{ background: `linear-gradient(135deg, ${BRAND}, #4070e8)` }}>
            <svg width="28" height="28" viewBox="0 0 28 28" fill="none">
              <path d="M5 5l4 4m0 0a9 9 0 1012.728 12.728M9 9L5 13m4-4l4-4" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </div>
        </div>

        <div className="w-8 h-8 rounded-full flex items-center justify-center mx-auto mb-4"
          style={{ background: BRAND + '15' }}>
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
            <path d="M2 8l4 4 8-8" stroke={BRAND} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </div>

        <h1 className="text-2xl font-bold text-center text-gray-900 mb-2">
          Votre assistante est prête !
        </h1>
        <p className="text-sm text-gray-500 text-center mb-8">
          Dernière étape — redirigez vos appels vers votre numéro Fixlyy pour que votre assistante puisse répondre.
        </p>

        {/* Numéro attribué */}
        {displayNumber ? (
          <div className="rounded-2xl border-2 p-5 mb-6 text-center"
            style={{ borderColor: BRAND + '30', background: BRAND + '06' }}>
            <p className="text-xs font-semibold uppercase tracking-widest mb-1" style={{ color: BRAND }}>
              Votre numéro Fixlyy
            </p>
            <p className="text-3xl font-bold tracking-wide text-gray-900 mb-1">{displayNumber}</p>
            <p className="text-xs text-gray-400">Votre assistante IA répond sur ce numéro</p>
          </div>
        ) : (
          <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 mb-6 text-center">
            <p className="text-sm text-amber-700 font-medium">Numéro en cours d'attribution</p>
            <p className="text-xs text-amber-500 mt-1">Vous le retrouverez dans les paramètres du dashboard</p>
          </div>
        )}

        {/* Options de renvoi */}
        {twilioNumber && (
          <div className="mb-6">
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">
              Choisissez votre type de renvoi
            </p>
            <div className="flex flex-col gap-3">
              {forwardingOptions.map((opt) => (
                <div key={opt.code} className="border border-gray-200 rounded-xl p-4">
                  <div className="flex items-start justify-between gap-2 mb-2">
                    <div>
                      <div className="flex items-center gap-2">
                        <p className="text-sm font-semibold text-gray-800">{opt.label}</p>
                        {opt.badge && (
                          <span className="text-[10px] font-bold px-2 py-0.5 rounded-full text-white"
                            style={{ background: BRAND }}>
                            {opt.badge}
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-gray-400 mt-0.5">{opt.desc}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 bg-gray-50 rounded-lg px-3 py-2">
                    <code className="text-sm font-mono text-gray-700 flex-1">{opt.code}</code>
                    <button
                      onClick={() => copyCode(opt.code)}
                      className="text-xs font-medium px-2.5 py-1 rounded-md transition-all"
                      style={{
                        background: copied === opt.code ? '#10b981' : BRAND + '15',
                        color: copied === opt.code ? 'white' : BRAND,
                      }}>
                      {copied === opt.code ? '✓ Copié' : 'Copier'}
                    </button>
                  </div>
                </div>
              ))}
            </div>

            <div className="mt-3 p-3 bg-gray-50 rounded-xl border border-gray-200">
              <p className="text-xs text-gray-500">
                <span className="font-semibold">Comment faire :</span> Composez le code depuis votre téléphone personnel et appuyez sur Appel. Le renvoi est actif immédiatement.
              </p>
              <p className="text-xs text-gray-400 mt-1.5">
                Pour annuler tous les renvois : <code className="font-mono bg-white px-1.5 py-0.5 rounded border border-gray-200">##002#</code>
              </p>
            </div>
          </div>
        )}

        {/* CTA */}
        <button
          onClick={onDone}
          className="w-full py-3 rounded-xl text-white font-semibold text-sm transition-opacity hover:opacity-90"
          style={{ background: BRAND }}>
          Accéder à mon dashboard →
        </button>
        <p className="text-[11px] text-gray-300 text-center mt-3">
          Vous pourrez retrouver ces informations à tout moment dans les paramètres
        </p>
      </div>
    </div>
  )
}
