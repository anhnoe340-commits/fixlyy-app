import { useEffect, useState } from 'react'
import { AuthProvider, useAuth } from '@/contexts/AuthContext'
import { ProfileProvider } from '@/contexts/ProfileContext'
import AuthPage from '@/pages/AuthPage'
import OnboardingPage from '@/pages/OnboardingPage'
import Onboarding from '@/pages/Onboarding'
import Dashboard from '@/pages/Dashboard'
import AcceptQuotePage from '@/pages/AcceptQuotePage'
import ResetPasswordPage from '@/pages/ResetPasswordPage'
import JoinTeam from '@/pages/JoinTeam'
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
      .select('id, company_name, stripe_customer_id, vapi_assistant_id')
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

        if (data.vapi_assistant_id) {
          // Provisioning terminé → dashboard
          sessionStorage.removeItem('fixlyy_checkout_success')
          setStatus('dashboard')
        } else if (data.company_name && data.stripe_customer_id) {
          // Onboarding fait + Stripe payé, mais provisioning pas encore terminé
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
  if (window.location.pathname === '/reset-password') return <ResetPasswordPage />
  if (window.location.pathname.startsWith('/join/')) return <JoinTeam />
  return <AuthProvider><AppContent /></AuthProvider>
}
