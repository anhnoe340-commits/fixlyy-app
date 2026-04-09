import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'

type Step = { label: string; status: 'pending' | 'loading' | 'done' | 'error' }

const BRAND = '#2850c8'

export default function Onboarding() {
  const [steps, setSteps] = useState<Step[]>([
    { label: 'Création de votre compte', status: 'pending' },
    { label: 'Configuration de votre assistante', status: 'pending' },
    { label: 'Attribution de votre numéro', status: 'pending' },
  ])
  const [error, setError] = useState<string | null>(null)
  const progress = steps.filter(s => s.status === 'done').length / steps.length * 100

  const setStep = (i: number, status: Step['status']) => {
    setSteps(prev => prev.map((s, idx) => idx === i ? { ...s, status } : s))
  }

  useEffect(() => {
    run()
  }, [])

  async function run() {
    try {
      // Étape 1 — compte déjà créé, on simule juste
      setStep(0, 'loading')
      await delay(600)
      setStep(0, 'done')

      // Étape 2 & 3 — appel à provision-artisan
      setStep(1, 'loading')
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) throw new Error('Session expirée')

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

      const result = await res.json()
      if (!res.ok || !result.success) throw new Error(result.error || 'Erreur de provisioning')

      setStep(1, 'done')
      setStep(2, 'loading')
      await delay(800)

      if (result.twilio_number) {
        setStep(2, 'done')
      } else {
        // Numéro pas dispo (bundle réglementaire en attente)
        setStep(2, 'error')
      }

      await delay(1000)
      window.location.reload()

    } catch (err: any) {
      setError(err.message || 'Une erreur est survenue')
    }
  }

  const delay = (ms: number) => new Promise(r => setTimeout(r, ms))

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
              <circle cx="18" cy="11" r="1.5" fill="white" />
              <path d="M18 14v8" stroke="white" strokeWidth="2.5" strokeLinecap="round" />
            </svg>
          </div>
        </div>

        <h1 className="text-2xl font-bold text-center text-gray-900 mb-2">
          Configuration en cours
        </h1>
        <p className="text-sm text-gray-500 text-center mb-8">
          Nous préparons votre assistante IA. Cela prend moins d'une minute.
        </p>

        {/* Steps */}
        <div className="flex flex-col gap-3 mb-8">
          {steps.map((step, i) => (
            <div key={i} className="flex items-center gap-3 p-4 rounded-xl border transition-all"
              style={{
                borderColor: step.status === 'done' ? BRAND + '40' : step.status === 'loading' ? BRAND + '60' : '#F3F4F6',
                background: step.status === 'done' ? BRAND + '08' : step.status === 'loading' ? BRAND + '05' : '#FAFAFA',
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
                  <div className="w-6 h-6 border-2 border-t-transparent rounded-full animate-spin" style={{ borderColor: BRAND, borderTopColor: 'transparent' }} />
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
                {step.status === 'error' && (
                  <p className="text-xs text-amber-600 mt-0.5">En attente d'approbation réglementaire</p>
                )}
              </div>
            </div>
          ))}
        </div>

        {/* Barre de progression */}
        <div className="w-full bg-gray-100 rounded-full h-1.5 mb-2">
          <div className="h-1.5 rounded-full transition-all duration-500"
            style={{ width: `${progress}%`, background: BRAND }} />
        </div>
        <p className="text-xs text-gray-400 text-center">{Math.round(progress)} %</p>

        {error && (
          <div className="mt-6 p-4 bg-red-50 rounded-xl border border-red-100">
            <p className="text-sm text-red-700 font-medium mb-1">Une erreur est survenue</p>
            <p className="text-xs text-red-500">{error}</p>
            <button onClick={() => window.location.reload()}
              className="mt-3 text-xs text-red-600 underline">
              Continuer quand même →
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
