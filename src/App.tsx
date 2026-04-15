import { useEffect, useState } from 'react'
import { AuthProvider, useAuth } from '@/contexts/AuthContext'
import { ProfileProvider } from '@/contexts/ProfileContext'
import AuthPage from '@/pages/AuthPage'
import OnboardingPage from '@/pages/OnboardingPage'
import Onboarding from '@/pages/Onboarding'
import Dashboard from '@/pages/Dashboard'
import AcceptQuotePage from '@/pages/AcceptQuotePage'
import { supabase } from '@/lib/supabase'

function Spinner() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-white">
      <div className="w-8 h-8 border-2 border-[#2850c8] border-t-transparent rounded-full animate-spin"/>
    </div>
  )
}

type AppStatus = 'loading' | 'auth' | 'onboarding' | 'provisioning' | 'dashboard'

function AppContent() {
  const { user, loading } = useAuth()
  const [status, setStatus] = useState<AppStatus>('loading')

  useEffect(() => {
    if (loading) return
    if (!user) { setStatus('auth'); return }

    // Retour de Stripe → aller directement en provisioning (polling)
    const params = new URLSearchParams(window.location.search)
    if (params.get('checkout') === 'success') {
      window.history.replaceState({}, '', '/')
      setStatus('provisioning')
      return
    }

    // Vérifier l'état du profil
    supabase
      .from('profiles')
      .select('id, company_name, stripe_customer_id, vapi_assistant_id')
      .eq('id', user.id)
      .single()
      .then(({ data }) => {
        if (!data) { setStatus('onboarding'); return }

        if (data.vapi_assistant_id) {
          // Provisioning terminé → dashboard
          setStatus('dashboard')
        } else if (data.company_name && data.stripe_customer_id) {
          // Onboarding fait + Stripe payé, mais provisioning pas encore terminé
          // (webhook en cours ou browser fermé avant retour Stripe)
          setStatus('provisioning')
        } else {
          // Nouveau compte ou onboarding abandonné avant paiement
          setStatus('onboarding')
        }
      })
  }, [user, loading])

  if (loading || status === 'loading') return <Spinner />
  if (!user || status === 'auth') return <AuthPage />
  if (status === 'onboarding') return <OnboardingPage userEmail={user.email!} />
  if (status === 'provisioning') return <Onboarding onDone={() => setStatus('dashboard')} />
  return <ProfileProvider><Dashboard /></ProfileProvider>
}

export default function App() {
  if (window.location.pathname === '/accept') return <AcceptQuotePage />
  return <AuthProvider><AppContent /></AuthProvider>
}
