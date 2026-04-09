import { useEffect, useRef, useState } from 'react'
import { AuthProvider, useAuth } from '@/contexts/AuthContext'
import { ProfileProvider } from '@/contexts/ProfileContext'
import AuthPage from '@/pages/AuthPage'
import OnboardingPage from '@/pages/OnboardingPage'
import CheckoutSuccess from '@/pages/CheckoutSuccess'
import Onboarding from '@/pages/Onboarding'
import Dashboard from '@/pages/Dashboard'
import { supabase } from '@/lib/supabase'

function Spinner() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-white">
      <div className="w-8 h-8 border-2 border-[#3B5BF5] border-t-transparent rounded-full animate-spin"/>
    </div>
  )
}

function AppContent() {
  const { user, loading } = useAuth()
  const [status, setStatus] = useState<'loading' | 'auth' | 'onboarding' | 'success' | 'provisioning' | 'dashboard'>('loading')
  const checkoutDone = useRef(false)

  useEffect(() => {
    if (!user) { setStatus('auth'); return }

    // Détecter retour de Stripe checkout
    const params = new URLSearchParams(window.location.search)
    if (params.get('checkout') === 'success') {
      checkoutDone.current = true
      setStatus('success')
      window.history.replaceState({}, '', '/dashboard')
      return
    }

    // Si on vient de payer, aller direct au dashboard sans vérifier le profil
    if (checkoutDone.current) {
      setStatus('dashboard')
      return
    }

    // Vérifier si le profil est complet + assistant provisionné
    supabase.from('profiles').select('id, company_name, vapi_assistant_id').eq('id', user.id).single()
      .then(({ data }) => {
        if (!data?.company_name) setStatus('onboarding')
        else if (!data?.vapi_assistant_id) setStatus('provisioning')
        else setStatus('dashboard')
      })
  }, [user])

  if (loading) return <Spinner />
  if (!user || status === 'auth') return <AuthPage />

  if (status === 'onboarding') return <OnboardingPage userEmail={user.email!} />
  if (status === 'success') return <CheckoutSuccess onContinue={() => setStatus('provisioning')} />
  if (status === 'provisioning') return <Onboarding />
  return <ProfileProvider><Dashboard /></ProfileProvider>
}

export default function App() {
  return <AuthProvider><AppContent /></AuthProvider>
}
