import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import { requestFCMToken } from '@/lib/firebase'
import { useAuth } from '@/contexts/AuthContext'

const DISMISS_KEY = 'push_banner_dismissed_until'

export default function PushNotificationBanner() {
  const { user } = useAuth()
  const [visible, setVisible] = useState(false)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!user) return
    if (!('Notification' in window)) return
    if (Notification.permission !== 'default') return

    const until = localStorage.getItem(DISMISS_KEY)
    if (until && Date.now() < Number(until)) return

    setVisible(true)
  }, [user])

  function dismiss() {
    localStorage.setItem(DISMISS_KEY, String(Date.now() + 24 * 60 * 60 * 1000))
    setVisible(false)
  }

  async function activate() {
    setLoading(true)
    try {
      const permission = await Notification.requestPermission()
      if (permission !== 'granted') { setVisible(false); return }

      const token = await requestFCMToken()
      if (token && user) {
        await supabase.from('profiles').update({
          fcm_token: token,
          push_notifications_enabled: true,
        }).eq('id', user.id)
      }
      setVisible(false)
    } catch (e) {
      console.error('[push] activate failed:', e)
    } finally {
      setLoading(false)
    }
  }

  if (!visible) return null

  return (
    <div style={{
      background: '#fff',
      border: '1px solid #E5E7EB',
      borderRadius: 12,
      padding: '14px 16px',
      marginBottom: 20,
      display: 'flex',
      alignItems: 'center',
      gap: 14,
      boxShadow: '0 1px 8px rgba(0,0,0,0.06)',
    }}>
      <span style={{ fontSize: 24, flexShrink: 0 }}>🔔</span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <p style={{ fontSize: 14, fontWeight: 700, color: '#1A1A2E', marginBottom: 2 }}>
          Activer les notifications Mia
        </p>
        <p style={{ fontSize: 12, color: '#6B7280', lineHeight: 1.4 }}>
          Reçois un résumé de chaque appel directement sur ton téléphone.
        </p>
      </div>
      <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
        <button
          onClick={dismiss}
          style={{ fontSize: 12, color: '#9CA3AF', background: 'none', border: 'none', cursor: 'pointer', padding: '6px 10px' }}
        >
          Plus tard
        </button>
        <button
          onClick={activate}
          disabled={loading}
          style={{
            fontSize: 13, fontWeight: 700, padding: '8px 14px', borderRadius: 8,
            background: '#3B5BFA', color: '#fff', border: 'none', cursor: 'pointer',
            opacity: loading ? 0.7 : 1,
          }}
        >
          {loading ? '…' : 'Activer'}
        </button>
      </div>
    </div>
  )
}
