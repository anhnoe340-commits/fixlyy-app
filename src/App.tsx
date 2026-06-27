import { useEffect, useState } from 'react'
import { AuthProvider, useAuth } from '@/contexts/AuthContext'
import { ProfileProvider } from '@/contexts/ProfileContext'
import OnboardingV2 from '@/pages/onboarding-v2/OnboardingV2'
import OnboardingV3 from '@/pages/onboarding-v3/OnboardingV3'
import LoginPage from '@/pages/LoginPage'
import Dashboard from '@/pages/Dashboard'
import BusinessContext from '@/pages/BusinessContext'
import AcceptQuotePage from '@/pages/AcceptQuotePage'
import ResetPasswordPage from '@/pages/ResetPasswordPage'
import JoinTeam from '@/pages/JoinTeam'
import JoinDashboard from '@/pages/JoinDashboard'
import ResumePage from '@/pages/ResumePage'
import SetupPage from '@/pages/setup/SetupPage'
import { supabase } from '@/lib/supabase'

function Spinner() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-white">
      <div className="w-8 h-8 border-2 border-[#2850c8] border-t-transparent rounded-full animate-spin"/>
    </div>
  )
}

function LoginEntry() {
  return <LoginPage />
}

// Route /commencer → OnboardingV3, sauf si déjà provisionné
// Exception : retour Stripe (?checkout=success) → laisser OnboardingV3 gérer le polling
function OnboardingV3Entry() {
  const { user, loading } = useAuth()
  const [checked, setChecked] = useState(false)
  const isCheckoutReturn = new URLSearchParams(window.location.search).get('checkout') === 'success'

  useEffect(() => {
    if (loading) return
    if (!user) { setChecked(true); return }
    // Retour Stripe : OnboardingV3 gère lui-même le polling de provisioning
    if (isCheckoutReturn) { setChecked(true); return }
    supabase.from('profiles').select('vapi_assistant_id').eq('id', user.id).maybeSingle().then(({ data }) => {
      if (data?.vapi_assistant_id) {
        window.location.replace('/')
      } else {
        setChecked(true)
      }
    })
  }, [user, loading])

  if (loading || !checked) return <Spinner />
  return <OnboardingV3 onDone={() => { window.location.replace('/') }} />
}

type AppStatus = 'loading' | 'auth' | 'onboarding' | 'provisioning' | 'dashboard'

function AppContent() {
  const { user, loading } = useAuth()
  const [status, setStatus] = useState<AppStatus>('loading')

  useEffect(() => {
    if (loading) return
    if (!user) { setStatus('auth'); return }

    // Retour de Stripe → persister en sessionStorage pour éviter la race condition
    const params = new URLSearchParams(window.location.search)
    if (params.get('checkout') === 'success') {
      window.history.replaceState({}, '', '/')
      sessionStorage.setItem('fixlyy_checkout_success', '1')
    }

    // Si le paiement vient d'être fait (même si l'URL param a déjà disparu)
    if (sessionStorage.getItem('fixlyy_checkout_success') === '1') {
      setStatus('provisioning')
      return
    }

    // Vérifier l'état du profil
    supabase
      .from('profiles')
      .select('id, company_name, stripe_customer_id, vapi_assistant_id, livekit_trunk_id, onboarding_completed')
      .eq('id', user.id)
      .maybeSingle()
      .then(({ data, error }) => {
        if (error) {
          // Erreur DB (RLS, réseau…) → retry dans 2s au lieu de tomber sur onboarding
          console.error('[Fixlyy] profiles query error:', error)
          setTimeout(() => setStatus('loading'), 2000)
          return
        }
        if (!data) { setStatus('onboarding'); return }

        // Provisionné via Vapi (anciens users) ou LiveKit (V3/prospection)
        const isProvisioned = !!(data.vapi_assistant_id || data.livekit_trunk_id)
        if (isProvisioned || data.onboarding_completed) {
          sessionStorage.removeItem('fixlyy_checkout_success')
          setStatus('dashboard')
        } else if (data.stripe_customer_id) {
          // Paiement effectué, provisioning en attente
          setStatus('provisioning')
        } else {
          setStatus('onboarding')
        }
      })
  }, [user, loading])

  if (loading || status === 'loading') return <Spinner />
  if (!user) { window.location.replace('/connexion'); return <Spinner /> }
  if (status === 'auth' || status === 'onboarding') return <OnboardingV2 onDone={() => setStatus('dashboard')} />
  if (status === 'provisioning') return <OnboardingV2 onDone={() => setStatus('dashboard')} />
  return <ProfileProvider><Dashboard /></ProfileProvider>
}

export default function App() {
  if (window.location.pathname === '/accept') return <AcceptQuotePage />
  if (window.location.pathname === '/reset-password') return <ResetPasswordPage />
  if (window.location.pathname === '/connexion') return <AuthProvider><LoginEntry /></AuthProvider>
  if (window.location.pathname === '/commencer') return <AuthProvider><OnboardingV3Entry /></AuthProvider>
  if (window.location.pathname === '/setup') return <SetupPage />
  if (window.location.pathname === '/join' && new URLSearchParams(window.location.search).has('token')) return <JoinDashboard />
  if (window.location.pathname.startsWith('/join/')) return <JoinTeam />
  if (window.location.pathname.startsWith('/r/')) return <ResumePage />
  if (window.location.pathname === '/dashboard/mon-activite') return <AuthProvider><BusinessContext /></AuthProvider>
  return <AuthProvider><AppContent /></AuthProvider>
}
