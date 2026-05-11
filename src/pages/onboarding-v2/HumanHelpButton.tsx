import { useState } from 'react'
import { supabase } from '@/lib/supabase'

const BRAND = '#2850c8'

function isBusinessHours(): boolean {
  const now = new Date()
  const paris = new Date(now.toLocaleString('en-US', { timeZone: 'Europe/Paris' }))
  const day = paris.getDay() // 0=dim, 6=sam
  const hour = paris.getHours()
  return day >= 1 && day <= 5 && hour >= 9 && hour < 19
}

interface Props {
  userId: string
  artisanPhone: string
}

export default function HumanHelpButton({ userId, artisanPhone }: Props) {
  const [step, setStep] = useState<'idle' | 'confirm' | 'done' | 'loading'>('idle')
  const [sending, setSending] = useState(false)
  const inHours = isBusinessHours()

  async function handleConfirm() {
    setSending(true)
    try {
      await supabase.from('profiles').update({
        human_help_requested_at: new Date().toISOString(),
      }).eq('id', userId)

      const { data: { session } } = await supabase.auth.getSession()
      if (session) {
        await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/notify-human-help`, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${session.access_token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ userId }),
        })
      }
      setStep('done')
    } catch {
      // reset si erreur
    } finally {
      setSending(false)
    }
  }

  if (step === 'done') {
    return (
      <div className="px-4 py-4 bg-green-50 border border-green-100 rounded-xl text-center">
        <p className="text-sm font-semibold text-green-700 mb-1">C'est noté !</p>
        <p className="text-xs text-green-600">
          {inHours
            ? 'On vous appelle dans les 15 prochaines minutes.'
            : 'On vous appelle dès demain matin entre 9h et 10h.'}
          {' '}Vous pouvez fermer cet onglet — tout est sauvegardé.
        </p>
      </div>
    )
  }

  if (step === 'confirm') {
    return (
      <div className="border border-gray-200 rounded-xl p-4 flex flex-col gap-3">
        <p className="text-sm text-gray-700">
          On vous rappelle au <span className="font-semibold">{artisanPhone}</span>{' '}
          {inHours ? 'dans les 15 prochaines minutes' : 'dès demain matin entre 9h et 10h'}.
        </p>
        <div className="flex gap-3">
          <button
            onClick={handleConfirm}
            disabled={sending}
            className="flex-1 py-2.5 rounded-lg text-white text-sm font-semibold flex items-center justify-center gap-2"
            style={{ background: BRAND }}
          >
            {sending && <div className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin" />}
            Oui, appelez-moi
          </button>
          <button onClick={() => setStep('idle')} className="px-4 py-2.5 rounded-lg border border-gray-200 text-sm text-gray-500">
            Annuler
          </button>
        </div>
      </div>
    )
  }

  return (
    <button
      onClick={() => setStep('confirm')}
      className="w-full py-3 rounded-xl border border-gray-200 text-sm text-gray-600 hover:border-gray-300 transition-colors flex flex-col items-center gap-0.5"
    >
      <span className="font-medium">Vous voulez qu'on vous appelle ?</span>
      <span className="text-xs text-gray-400">Un humain de Fixlyy vous guide en 5 minutes</span>
    </button>
  )
}
