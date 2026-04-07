import { AuthProvider, useAuth } from '@/contexts/AuthContext'
import { ProfileProvider } from '@/contexts/ProfileContext'
import AuthPage from '@/pages/AuthPage'
import Dashboard from '@/pages/Dashboard'

function AppContent() {
  const { user, loading } = useAuth()
  if (loading) return (
    <div className="min-h-screen flex items-center justify-center bg-white">
      <div className="w-8 h-8 border-2 border-[#FF6B35] border-t-transparent rounded-full animate-spin" />
    </div>
  )
  if (!user) return <AuthPage />
  return <ProfileProvider><Dashboard /></ProfileProvider>
}

export default function App() {
  return <AuthProvider><AppContent /></AuthProvider>
}
