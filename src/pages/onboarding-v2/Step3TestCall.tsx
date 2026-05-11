import { useState, useEffect, useRef } from 'react'
import { supabase } from '@/lib/supabase'
import HumanHelpButton from './HumanHelpButton'

const BRAND = '#2850c8'
const COUNTDOWN_START = 5
const POLL_INTERVAL = 2000
const POLL_TIMEOUT = 45000

type Status = 'countdown' | 'calling' | 'success' | 'no-answer' | 'unreachable'

interface Props {
  userId: string
  artisanPhone: string
  onDone: () => void
}

export default function Step3TestCall({ userId, artisanPhone, onDone }: Props) {
  const [status, setStatus] = useState<Status>('countdown')
  const [countdown, setCountdown] = useState(COUNTDOWN_START)
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const startedAt = useRef<number>(0)

  useEffect(() => {
    const timer = setInterval(() => {
      setCountdown(c => {
        if (c <= 1) {
          clearInterval(timer)
          triggerCall()
          return 0
        }
        return c - 1
      })
    }, 1000)
    return () => clearInterval(timer)
  }, [])

  useEffect(() => () => { if (pollRef.current) clearInterval(pollRef.current) }, [])

  async function triggerCall() {
    setStatus('calling')
    startedAt.current = Date.now()
    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) return

      await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/trigger-test-call`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${session.access_token}`,
          'Content-Type': 'application/json',
        },
      })
    } catch { /* non-bloquant */ }

    startPolling()
  }

  function startPolling() {
    pollRef.current = setInterval(async () => {
      if (Date.now() - startedAt.current > POLL_TIMEOUT) {
        clearInterval(pollRef.current!)
        setStatus('unreachable')
        return
      }

      const { data } = await supabase
        .from('onboarding_test_calls')
        .select('success, sms_received, completed_at, error_reason')
        .eq('user_id', userId)
        .order('initiated_at', { ascending: false })
        .limit(1)
        .maybeSingle()

      if (data?.completed_at) {
        clearInterval(pollRef.current!)
        if (data.success) {
          await supabase.from('profiles').update({
            forwarding_activated: true,
            first_test_call_at: new Date().toISOString(),
            onboarding_step: 3,
          }).eq('id', userId)
          setStatus('success')
        } else {
          setStatus('no-answer')
        }
      }
    }, POLL_INTERVAL)
  }

  async function retryCall() {
    if (pollRef.current) clearInterval(pollRef.current)
    setStatus('countdown')
    setCountdown(COUNTDOWN_START)
  }

  // ── Countdown ────────────────────────────────────────────────────────────────
  if (status === 'countdown') {
    return (
      <div className="flex flex-col items-center gap-6 py-4 text-center">
        <div className="w-24 h-24 rounded-full border-4 flex items-center justify-center text-4xl font-black" style={{ borderColor: BRAND, color: BRAND }}>
          {countdown}
        </div>
        <div>
          <p className="text-lg font-semibold text-gray-800 mb-1">Appel test dans {countdown}s</p>
          <p className="text-sm text-gray-500">
            On va appeler votre téléphone au <span className="font-medium text-gray-700">{artisanPhone}</span> pour vérifier que Mia répond bien.
          </p>
        </div>
        <div className="px-4 py-3 bg-blue-50 border border-blue-100 rounded-xl text-left w-full">
          <p className="text-xs text-blue-700">
            <span className="font-semibold">Quand votre téléphone sonne :</span> décrochez et dites bonjour à Mia. Posez-lui une question simple comme "C'est pour une fuite d'eau".
          </p>
        </div>
      </div>
    )
  }

  // ── Appel en cours ───────────────────────────────────────────────────────────
  if (status === 'calling') {
    return (
      <div className="flex flex-col items-center gap-6 py-4 text-center">
        <div className="relative">
          <div className="w-20 h-20 rounded-full flex items-center justify-center" style={{ background: BRAND + '15' }}>
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke={BRAND} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M22 16.92v3a2 2 0 01-2.18 2 19.79 19.79 0 01-8.63-3.07A19.5 19.5 0 013.07 9.81a19.79 19.79 0 01-3.07-8.63A2 2 0 012 0h3a2 2 0 012 1.72c.127.96.361 1.903.7 2.81a2 2 0 01-.45 2.11L6.91 7.91a16 16 0 006.18 6.18l1.27-1.27a2 2 0 012.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0122 14.92z"/>
            </svg>
          </div>
          <span className="absolute -top-1 -right-1 w-4 h-4 rounded-full animate-ping" style={{ background: BRAND + '60' }} />
          <span className="absolute -top-1 -right-1 w-4 h-4 rounded-full" style={{ background: BRAND }} />
        </div>
        <div>
          <p className="text-lg font-semibold text-gray-800 mb-1">Votre téléphone sonne…</p>
          <p className="text-sm text-gray-500">Décrochez et parlez à Mia</p>
        </div>
        <p className="text-xs text-gray-400">Dites-lui par exemple : "Bonjour, j'ai une fuite d'eau urgente"</p>
      </div>
    )
  }

  // ── Succès ───────────────────────────────────────────────────────────────────
  if (status === 'success') {
    return (
      <div className="flex flex-col items-center gap-6 py-4 text-center">
        <div className="w-20 h-20 rounded-full flex items-center justify-center" style={{ background: '#10B98115' }}>
          <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="#10B981" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M20 6L9 17l-5-5"/>
          </svg>
        </div>
        <div>
          <p className="text-2xl font-bold text-gray-900 mb-1">Ça marche !</p>
          <p className="text-sm text-gray-500">Mia a répondu et vous avez reçu le SMS récap. Vous êtes prêt.</p>
        </div>

        <div className="w-full px-4 py-3.5 rounded-xl border text-left" style={{ borderColor: '#10B98130', background: '#10B98108' }}>
          <p className="text-xs font-semibold text-green-700 mb-1">Récap de votre configuration</p>
          <p className="text-sm text-gray-700">Mia répond à vos appels manqués et vous envoie un SMS récap en 30 secondes.</p>
        </div>

        <button
          onClick={onDone}
          className="w-full py-4 rounded-xl text-white text-sm font-semibold transition-all hover:opacity-90"
          style={{ background: `linear-gradient(135deg, ${BRAND}, #4070e8)` }}
        >
          Accéder à mon dashboard →
        </button>
      </div>
    )
  }

  // ── Échec : Mia n'a pas répondu ──────────────────────────────────────────────
  if (status === 'no-answer') {
    return (
      <div className="flex flex-col gap-5">
        <div className="flex flex-col items-center text-center gap-3 py-2">
          <div className="w-16 h-16 rounded-full bg-amber-50 flex items-center justify-center">
            <span className="text-2xl">⚠️</span>
          </div>
          <div>
            <p className="text-lg font-semibold text-gray-800 mb-1">Le renvoi ne semble pas actif</p>
            <p className="text-sm text-gray-500">
              Votre téléphone a sonné normalement, sans passer par Mia. Le code de renvoi n'a peut-être pas été enregistré.
            </p>
          </div>
        </div>

        <div className="flex flex-col gap-3">
          <button onClick={retryCall}
            className="w-full py-3.5 rounded-xl text-white text-sm font-semibold transition-all hover:opacity-90"
            style={{ background: BRAND }}>
            Réessayer l'appel test
          </button>
          <button
            className="w-full py-3.5 rounded-xl border border-gray-200 text-sm font-medium text-gray-600 hover:border-gray-300 transition-colors">
            Refaire le code de renvoi
          </button>
          <HumanHelpButton userId={userId} artisanPhone={artisanPhone} />
        </div>

        <button onClick={onDone} className="text-sm text-center text-gray-400 hover:text-gray-600">
          Accéder au dashboard quand même →
        </button>
      </div>
    )
  }

  // ── Timeout : injoignable ────────────────────────────────────────────────────
  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col items-center text-center gap-3 py-2">
        <div className="w-16 h-16 rounded-full bg-red-50 flex items-center justify-center">
          <span className="text-2xl">📵</span>
        </div>
        <div>
          <p className="text-lg font-semibold text-gray-800 mb-1">On n'arrive pas à vous joindre</p>
          <p className="text-sm text-gray-500">Vérifiez que votre téléphone est allumé et que vous avez du réseau.</p>
        </div>
      </div>

      <ul className="text-xs text-gray-400 space-y-1 px-4">
        <li>• Téléphone éteint ou en mode avion</li>
        <li>• Numéro incorrect saisi à l'étape 1</li>
        <li>• Opérateur qui bloque les appels internationaux</li>
      </ul>

      <div className="flex flex-col gap-3">
        <button onClick={retryCall}
          className="w-full py-3.5 rounded-xl text-white text-sm font-semibold transition-all hover:opacity-90"
          style={{ background: BRAND }}>
          Réessayer
        </button>
        <HumanHelpButton userId={userId} artisanPhone={artisanPhone} />
      </div>

      <button onClick={onDone} className="text-sm text-center text-gray-400 hover:text-gray-600">
        Accéder au dashboard quand même →
      </button>
    </div>
  )
}
