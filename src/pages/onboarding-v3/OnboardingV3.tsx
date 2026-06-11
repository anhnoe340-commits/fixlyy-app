import { useState, useEffect } from 'react'
import Step1Phone from './Step1Phone'
import Step2Activity from './Step2Activity'
import Step3Plan from './Step3Plan'
import Step4Number from './Step4Number'
import Step5Forwarding from './Step5Forwarding'
import Step6Install from './Step6Install'

const BRAND = '#3B5BF5'
const TOTAL  = 6

type PlanId = 'solo' | 'pro' | 'max'

interface State {
  step: number
  userId: string | null
  phone: string | null
  selectedPlan: PlanId | null
  fixlyyNumber: string | null
}

interface Props {
  onDone: () => void
}

const STEP_LABELS = ['Téléphone', 'Activité', 'Forfait', 'Numéro', 'Renvoi', 'Installation']

export default function OnboardingV3({ onDone }: Props) {
  const [state, setState] = useState<State>({
    step: 1,
    userId: null,
    phone: null,
    selectedPlan: null,
    fixlyyNumber: null,
  })
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null)

  useEffect(() => {
    const handler = (e: any) => { e.preventDefault(); setDeferredPrompt(e) }
    window.addEventListener('beforeinstallprompt', handler)
    return () => window.removeEventListener('beforeinstallprompt', handler)
  }, [])

  function next(patch: Partial<State> = {}) {
    setState(s => ({ ...s, ...patch, step: s.step + 1 }))
  }

  const progressPct = ((state.step - 1) / (TOTAL - 1)) * 100

  return (
    <div className="onboarding-v3-bg min-h-screen flex flex-col" style={{ fontFamily: 'Inter, system-ui, sans-serif' }}>

      {/* Barre de progression */}
      <div className="fixed top-0 left-0 right-0 z-50 h-0.5" style={{ background: 'rgba(255,255,255,0.08)' }}>
        <div className="h-full transition-all duration-500 ease-out" style={{ width: `${progressPct}%`, background: BRAND }} />
      </div>

      {/* Header */}
      <div className="flex-shrink-0 flex items-center justify-between px-6 pt-8 pb-2">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg flex items-center justify-center text-white text-sm font-bold" style={{ background: BRAND }}>
            F
          </div>
          <span className="text-base font-semibold text-white">Fixlyy</span>
        </div>
        <div className="text-right">
          <p className="text-xs font-medium text-white/50">{STEP_LABELS[state.step - 1]}</p>
          <p className="text-[10px]" style={{ color: 'rgba(148,163,184,0.4)' }}>{state.step} / {TOTAL}</p>
        </div>
      </div>

      {/* Contenu */}
      <div className="flex-1 flex items-center justify-center p-5 pb-12">
        <div className="w-full max-w-sm">

          {state.step === 1 && (
            <Step1Phone onDone={(userId, phone) => next({ userId, phone })} />
          )}
          {state.step === 2 && (
            <Step2Activity
              userId={state.userId!}
              phone={state.phone!}
              onDone={() => next()}
            />
          )}
          {state.step === 3 && (
            <Step3Plan
              userId={state.userId!}
              onDone={(plan: PlanId) => next({ selectedPlan: plan })}
            />
          )}
          {state.step === 4 && (
            <Step4Number
              userId={state.userId!}
              onDone={(num: string) => next({ fixlyyNumber: num })}
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
