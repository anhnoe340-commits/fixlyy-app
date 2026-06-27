import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import Step1Identity from './Step1Identity'
import Step2Payment from './Step2Payment'
import Step3Provisioning from './Step3Provisioning'
import Step4Number from './Step4Number'
import Step5Forwarding from './Step5Forwarding'
import Step6Install from './Step6Install'
import { trackEvent } from '@/utils/pixel'

const BRAND = '#3B5BFA'
const TOTAL = 5

const STEP_LABELS = ['Identité', 'Paiement', 'Numéro', 'Renvoi', 'Prêt']

// Maps internal state → visible progress step (provisioning = step 3 is transparent)
function progressStep(step: number): number {
  if (step <= 2) return step
  if (step === 3) return 2   // provisioning → still shows step 2 in progress
  return step - 1            // 4→3, 5→4, 6→5
}

function labelIndex(step: number): number {
  return Math.max(0, progressStep(step) - 1)
}

interface State {
  step:         number
  userId:       string | null
  phone:        string | null
  email:        string | null
  fullName:     string | null
  trade:        string | null
  companyName:  string | null
  fixlyyNumber: string | null
}

interface Props {
  onDone: () => void
}

export default function OnboardingV3({ onDone }: Props) {
  const isCheckoutReturn = new URLSearchParams(window.location.search).get('checkout') === 'success'
  const [deferredPrompt, setDeferredPrompt]   = useState<any>(null)
  const [checkoutLoading, setCheckoutLoading] = useState(false)
  const [checkoutError, setCheckoutError]     = useState('')

  const [state, setState] = useState<State>({
    step: isCheckoutReturn ? 3 : 1,
    userId:       null,
    phone:        null,
    email:        null,
    fullName:     null,
    trade:        null,
    companyName:  null,
    fixlyyNumber: null,
  })

  // Meta Pixel
  useEffect(() => {
    if (isCheckoutReturn) {
      trackEvent('Purchase', { value: 497, currency: 'EUR' })
    } else {
      trackEvent('InitiateCheckout')
    }
  }, [])

  // Capture beforeinstallprompt as early as possible
  useEffect(() => {
    const handler = (e: any) => { e.preventDefault(); setDeferredPrompt(e) }
    window.addEventListener('beforeinstallprompt', handler)
    return () => window.removeEventListener('beforeinstallprompt', handler)
  }, [])

  // On Stripe return: load userId, check if already provisioned (fast webhook)
  useEffect(() => {
    if (!isCheckoutReturn) return
    window.history.replaceState({}, '', '/commencer')

    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) return
      const raw = user.phone ?? ''
      const phone = raw ? (raw.startsWith('+') ? raw : `+${raw}`) : null
      supabase
        .from('profiles')
        .select('vapi_assistant_id, twilio_number')
        .eq('id', user.id)
        .single()
        .then(({ data }) => {
          if (data?.vapi_assistant_id && data?.twilio_number) {
            setState(s => ({ ...s, userId: user.id, phone, step: 4, fixlyyNumber: data.twilio_number }))
          } else {
            setState(s => ({ ...s, userId: user.id, phone, step: 3 }))
          }
        })
    })
  }, [])

  async function handleCheckout(
    userId: string,
    phone: string | null,
    fullName: string | null,
    trade: string | null,
    companyName: string | null,
    email: string | null,
  ) {
    setState(s => ({ ...s, userId, phone, email, fullName, trade, companyName }))
    setCheckoutLoading(true)
    setCheckoutError('')
    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) throw new Error('Session expirée. Reconnectez-vous.')

      const resp = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/create-checkout-session`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${session.access_token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ trade, company: companyName }),
        }
      )
      const data = await resp.json()
      if (!resp.ok || data.error) throw new Error(data.error || 'Erreur lors de la création du checkout.')
      window.location.href = data.url
    } catch (e: any) {
      setCheckoutError(e.message || 'Erreur. Réessayez.')
      setCheckoutLoading(false)
    }
  }

  function next(patch: Partial<State> = {}) {
    setState(s => ({ ...s, ...patch, step: s.step + 1 }))
  }

  const pStep    = progressStep(state.step)
  const progress = ((pStep - 1) / (TOTAL - 1)) * 100

  return (
    <div className="min-h-screen flex flex-col" style={{ fontFamily: 'Inter, system-ui, sans-serif', background: '#F8F9FF' }}>

      {/* Barre de progression */}
      <div className="fixed top-0 left-0 right-0 z-50 h-1" style={{ background: '#E5E7EB' }}>
        <div
          className="h-full transition-all duration-500 ease-out"
          style={{ width: `${progress}%`, background: BRAND }}
        />
      </div>

      {/* Header */}
      <div className="flex-shrink-0 flex items-center justify-between px-6 pt-8 pb-2">
        <img src="/logo-full-clean.svg" alt="Fixlyy" className="h-8" />
        <div className="text-right">
          <p className="text-xs font-semibold" style={{ color: '#374151' }}>
            {STEP_LABELS[labelIndex(state.step)] ?? ''}
          </p>
          <p className="text-[10px]" style={{ color: '#9CA3AF' }}>{pStep} / {TOTAL}</p>
        </div>
      </div>

      {/* Contenu */}
      <div className="flex-1 flex items-start justify-center p-5 pb-12 pt-4">
        <div className="w-full max-w-sm">

          {/* Step 1 — Identité */}
          {state.step === 1 && (
            <Step1Identity
              onDone={(userId, phone, fullName, trade, companyName, email) => {
                setState(s => ({ ...s, userId, phone, email, fullName, trade, companyName }))
                next()
              }}
            />
          )}

          {/* Step 2 — Paiement + CGU */}
          {state.step === 2 && (
            <Step2Payment
              loading={checkoutLoading}
              error={checkoutError}
              onPay={() => handleCheckout(
                state.userId!, state.phone, state.fullName,
                state.trade, state.companyName, state.email,
              )}
            />
          )}

          {/* Step 3 — Provisioning (après retour Stripe) */}
          {state.step === 3 && !state.userId && (
            <div className="flex flex-col items-center justify-center gap-4 py-12">
              <div className="w-8 h-8 border-2 border-t-transparent rounded-full animate-spin" style={{ borderColor: BRAND }} />
              <p className="text-sm" style={{ color: '#6B7280' }}>Chargement…</p>
            </div>
          )}

          {state.step === 3 && state.userId && (
            <Step3Provisioning
              userId={state.userId}
              onDone={number => next({ fixlyyNumber: number })}
            />
          )}

          {/* Step 4 — Numéro dédié */}
          {state.step === 4 && (
            <Step4Number
              fixlyyNumber={state.fixlyyNumber!}
              artisanPhone={state.phone!}
              userId={state.userId!}
              onDone={num => next({ fixlyyNumber: num })}
            />
          )}

          {/* Step 5 — Renvoi d'appel */}
          {state.step === 5 && (
            <Step5Forwarding
              userId={state.userId!}
              fixlyyNumber={state.fixlyyNumber}
              onDone={() => next()}
            />
          )}

          {/* Step 6 — Remerciement + Config Mia */}
          {state.step === 6 && (
            <Step6Install
              userId={state.userId!}
              deferredPrompt={deferredPrompt}
              onDone={onDone}
            />
          )}

        </div>
      </div>
    </div>
  )
}
