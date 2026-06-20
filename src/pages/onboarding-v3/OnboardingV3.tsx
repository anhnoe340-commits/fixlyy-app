import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import Step1Identity from './Step1Identity'
import Step2Plan, { PLAN_SESSION_KEY } from './Step2Plan'
import Step3Provisioning from './Step3Provisioning'
import Step4Number from './Step4Number'
import Step5Forwarding from './Step5Forwarding'
import Step6Install from './Step6Install'
import { trackEvent } from '@/utils/pixel'
import { PLANS, type PlanKey } from '@/config/plans'

const BRAND = '#3B5BF5'
const TOTAL = 6

const STEP_LABELS = ['Identité', 'Forfait', 'Activation', 'Numéro', 'Renvoi', 'Installation']

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
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null)

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

  // Meta Pixel: InitiateCheckout (step 1) ou Purchase (retour Stripe)
  useEffect(() => {
    if (isCheckoutReturn) {
      const planKey = sessionStorage.getItem(PLAN_SESSION_KEY) as PlanKey | null
      const value = planKey && PLANS[planKey] ? PLANS[planKey].price : undefined
      trackEvent('Purchase', { value, currency: 'EUR' })
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
            // Webhook already fired — skip polling, go straight to reveal
            setState(s => ({ ...s, userId: user.id, phone, step: 4, fixlyyNumber: data.twilio_number }))
          } else {
            setState(s => ({ ...s, userId: user.id, phone, step: 3 }))
          }
        })
    })
  }, [])

  function next(patch: Partial<State> = {}) {
    setState(s => ({ ...s, ...patch, step: s.step + 1 }))
  }

  const progressPct = ((state.step - 1) / (TOTAL - 1)) * 100

  return (
    <div className="onboarding-v3-bg min-h-screen flex flex-col" style={{ fontFamily: 'Inter, system-ui, sans-serif' }}>

      {/* Barre de progression */}
      <div className="fixed top-0 left-0 right-0 z-50 h-0.5" style={{ background: 'rgba(255,255,255,0.08)' }}>
        <div
          className="h-full transition-all duration-500 ease-out"
          style={{ width: `${progressPct}%`, background: BRAND }}
        />
      </div>

      {/* Header */}
      <div className="flex-shrink-0 flex items-center justify-between px-6 pt-8 pb-2">
        <div>
          <img src="/logo-full-clean.svg" alt="Fixlyy" className="h-8" />
        </div>
        <div className="text-right">
          <p className="text-xs font-medium text-white/50">{STEP_LABELS[state.step - 1]}</p>
          <p className="text-[10px]" style={{ color: 'rgba(148,163,184,0.4)' }}>{state.step} / {TOTAL}</p>
        </div>
      </div>

      {/* Contenu */}
      <div className="flex-1 flex items-start justify-center p-5 pb-12 pt-4">
        <div className="w-full max-w-sm">

          {state.step === 1 && (
            <Step1Identity
              onDone={(userId, phone, fullName, trade, companyName, email) =>
                next({ userId, phone, email, fullName, trade, companyName })
              }
            />
          )}

          {state.step === 2 && (
            <Step2Plan
              companyName={state.companyName!}
              trade={state.trade!}
              onBack={() => setState(s => ({ ...s, step: 1 }))}
            />
          )}

          {state.step === 3 && !state.userId && (
            <div className="flex flex-col items-center justify-center gap-4 py-12">
              <div className="w-8 h-8 border-2 border-t-transparent rounded-full animate-spin" style={{ borderColor: BRAND }} />
              <p className="text-sm" style={{ color: 'rgba(148,163,184,0.7)' }}>Chargement…</p>
            </div>
          )}

          {state.step === 3 && state.userId && (
            <Step3Provisioning
              userId={state.userId}
              onDone={number => next({ fixlyyNumber: number })}
            />
          )}

          {state.step === 4 && (
            <Step4Number
              fixlyyNumber={state.fixlyyNumber!}
              artisanPhone={state.phone!}
              userId={state.userId!}
              onDone={num => next({ fixlyyNumber: num })}
            />
          )}

          {state.step === 5 && (
            <Step5Forwarding
              userId={state.userId!}
              fixlyyNumber={state.fixlyyNumber}
              onDone={() => next()}
            />
          )}

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
