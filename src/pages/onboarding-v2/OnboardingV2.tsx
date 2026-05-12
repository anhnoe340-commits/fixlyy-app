import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import Step1Account from './Step1Account'
import Step2Forwarding from './Step2Forwarding'
import Step3TestCall from './Step3TestCall'

const BRAND = '#2850c8'

const STEPS = ['Compte', 'Renvoi', 'Test']

interface OnboardingState {
  userId: string | null
  artisanPhone: string | null
  fixlyyNumber: string | null
  step: number
}

interface Props {
  onDone: () => void
}

export default function OnboardingV2({ onDone }: Props) {
  const [state, setState] = useState<OnboardingState>({
    userId: null,
    artisanPhone: null,
    fixlyyNumber: null,
    step: 1,
  })

  function handleStep1Done(userId: string) {
    setState(s => ({ ...s, userId, step: 2 }))
    // Charger le profil pour récupérer téléphone + numéro Fixlyy
    supabase.from('profiles').select('phone, twilio_number').eq('id', userId).single().then(({ data }) => {
      setState(s => ({
        ...s,
        artisanPhone: data?.phone || null,
        fixlyyNumber: data?.twilio_number || null,
      }))
    })
    // Déclenche l'assignation du numéro en background
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!session) return
      const headers = { Authorization: `Bearer ${session.access_token}` }
      fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/assign-number-from-pool`, {
        method: 'POST', headers,
      }).catch(() => {})
    })
  }

  function handleStep2Done() {
    setState(s => ({ ...s, step: 3 }))
    supabase.from('profiles').update({ onboarding_step: 3 }).eq('id', state.userId!).then(() => {})
  }

  function handleStep3Done() {
    supabase.from('profiles').update({ onboarding_step: 4, onboarding_completed: true }).eq('id', state.userId!).then(() => {})
    // SMS trophée — envoyé uniquement quand l'onboarding est réellement terminé
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!session) return
      fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/send-welcome-sms`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${session.access_token}` },
      }).catch(() => {})
    })
    onDone()
  }

  const progress = ((state.step - 1) / (STEPS.length - 1)) * 100

  return (
    <div className="min-h-screen bg-[#FAF7F2] flex flex-col items-center justify-center p-4" style={{ fontFamily: 'system-ui, sans-serif' }}>
      <div className="w-full max-w-sm">

        {/* Logo */}
        <div className="flex items-center justify-center gap-2 mb-8">
          <div className="w-8 h-8 rounded-lg flex items-center justify-center text-white text-sm font-bold" style={{ background: BRAND }}>F</div>
          <span className="text-base font-semibold text-gray-800">Fixlyy</span>
        </div>

        {/* Progress */}
        <div className="mb-8">
          <div className="flex items-center justify-between mb-3">
            {STEPS.map((label, i) => (
              <div key={i} className="flex flex-col items-center flex-1">
                <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold mb-1 transition-all ${
                  state.step > i + 1 ? 'text-white' : state.step === i + 1 ? 'text-white' : 'bg-gray-200 text-gray-400'
                }`} style={state.step >= i + 1 ? { background: BRAND } : {}}>
                  {state.step > i + 1 ? '✓' : i + 1}
                </div>
                <span className={`text-[10px] font-medium ${state.step === i + 1 ? 'text-gray-700' : 'text-gray-400'}`}>{label}</span>
              </div>
            ))}
          </div>
          <div className="w-full bg-gray-200 rounded-full h-1">
            <div className="h-1 rounded-full transition-all duration-500" style={{ width: `${progress}%`, background: BRAND }} />
          </div>
        </div>

        {/* Card */}
        <div className="bg-white rounded-2xl p-6 shadow-sm border border-gray-100">
          {state.step === 1 && <Step1Account onDone={handleStep1Done} />}
          {state.step === 2 && (
            <Step2Forwarding
              userId={state.userId!}
              fixlyyNumber={state.fixlyyNumber}
              onDone={handleStep2Done}
            />
          )}
          {state.step === 3 && state.userId && state.artisanPhone && (
            <Step3TestCall
              userId={state.userId}
              artisanPhone={state.artisanPhone}
              onDone={handleStep3Done}
            />
          )}
        </div>

        <p className="text-[11px] text-gray-400 text-center mt-4">
          Essai gratuit 7 jours · Sans carte bancaire · Annulation à tout moment
        </p>
      </div>
    </div>
  )
}
