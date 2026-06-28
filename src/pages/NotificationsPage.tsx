import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import { requestFCMToken } from '@/lib/firebase'
import { useAuth } from '@/contexts/AuthContext'
import { useProfile } from '@/contexts/ProfileContext'

const BRAND  = '#3B5BFA'
const TEXT   = '#1A1A2E'
const MUTED  = '#6B7280'
const BORDER = '#E5E7EB'

export default function NotificationsPage({ accent: _accent }: { accent: string }) {
  const { user }    = useAuth()
  const { profile } = useProfile()
  const [enabled, setEnabled]   = useState(false)
  const [hasToken, setHasToken] = useState(false)
  const [saving, setSaving]     = useState(false)
  const [permission, setPermission] = useState<NotificationPermission | 'unsupported'>('default')

  useEffect(() => {
    if (!profile) return
    setEnabled(!!(profile as any).push_notifications_enabled)
    setHasToken(!!(profile as any).fcm_token)
    setPermission('Notification' in window ? Notification.permission : 'unsupported')
  }, [profile])

  async function handleToggle() {
    if (!user) return
    setSaving(true)
    try {
      if (!enabled) {
        // Activer — demander permission si pas encore donnée
        if (permission === 'default') {
          const perm = await Notification.requestPermission()
          setPermission(perm)
          if (perm !== 'granted') { setSaving(false); return }
        }
        if (permission === 'denied') { setSaving(false); return }

        const token = await requestFCMToken()
        if (!token) { setSaving(false); return }

        await supabase.from('profiles').update({
          fcm_token: token,
          push_notifications_enabled: true,
        }).eq('id', user.id)
        setHasToken(true)
        setEnabled(true)
      } else {
        // Désactiver
        await supabase.from('profiles').update({
          push_notifications_enabled: false,
        }).eq('id', user.id)
        setEnabled(false)
      }
    } catch (e) {
      console.error('[notifications] toggle failed:', e)
    } finally {
      setSaving(false)
    }
  }

  async function refreshToken() {
    if (!user) return
    setSaving(true)
    try {
      const token = await requestFCMToken()
      if (token) {
        await supabase.from('profiles').update({
          fcm_token: token,
          push_notifications_enabled: true,
        }).eq('id', user.id)
        setHasToken(true)
        setEnabled(true)
      }
    } catch (e) {
      console.error('[notifications] refresh failed:', e)
    } finally {
      setSaving(false)
    }
  }

  const statusOk = enabled && hasToken && permission === 'granted'

  return (
    <div style={{ maxWidth: 480, display: 'flex', flexDirection: 'column', gap: 20 }}>
      <div>
        <h2 style={{ fontSize: 18, fontWeight: 800, color: TEXT, marginBottom: 4 }}>Notifications</h2>
        <p style={{ fontSize: 13, color: MUTED }}>Reçois un récap push après chaque appel géré par Mia.</p>
      </div>

      {/* Status */}
      <div style={{
        background: statusOk ? 'rgba(5,150,105,0.07)' : 'rgba(251,146,60,0.08)',
        border: `1.5px solid ${statusOk ? 'rgba(5,150,105,0.3)' : 'rgba(251,146,60,0.35)'}`,
        borderRadius: 12, padding: '14px 16px',
        display: 'flex', alignItems: 'center', gap: 12,
      }}>
        <span style={{ fontSize: 20 }}>{statusOk ? '✅' : '⚠️'}</span>
        <div>
          <p style={{ fontSize: 13, fontWeight: 700, color: TEXT }}>
            {statusOk
              ? 'Notifications actives sur cet appareil'
              : permission === 'denied'
                ? 'Notifications bloquées dans le navigateur'
                : permission === 'unsupported'
                  ? 'Notifications non supportées sur cet appareil'
                  : 'Notifications non activées sur cet appareil'}
          </p>
          {!statusOk && permission !== 'denied' && permission !== 'unsupported' && (
            <p style={{ fontSize: 12, color: MUTED, marginTop: 2 }}>
              Active le toggle ci-dessous pour recevoir les récaps push.
            </p>
          )}
          {permission === 'denied' && (
            <p style={{ fontSize: 12, color: MUTED, marginTop: 2 }}>
              Autorise les notifications dans les paramètres de ton navigateur, puis réessaie.
            </p>
          )}
        </div>
      </div>

      {/* Toggle principal */}
      <div style={{
        background: '#fff', border: `1px solid ${BORDER}`,
        borderRadius: 12, padding: '16px',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16 }}>
          <div>
            <p style={{ fontSize: 14, fontWeight: 700, color: TEXT, marginBottom: 2 }}>
              Notifications push activées
            </p>
            <p style={{ fontSize: 12, color: MUTED }}>
              Après chaque appel : titre, motif, urgence — tap pour ouvrir le dashboard.
            </p>
          </div>
          <button
            onClick={handleToggle}
            disabled={saving || permission === 'denied' || permission === 'unsupported'}
            style={{
              width: 44, height: 26, borderRadius: 13, border: 'none', cursor: 'pointer',
              background: enabled ? BRAND : '#D1D5DB',
              position: 'relative', transition: 'background 0.2s', flexShrink: 0,
              opacity: (permission === 'denied' || permission === 'unsupported') ? 0.5 : 1,
            }}
          >
            <span style={{
              position: 'absolute', top: 3, left: enabled ? 21 : 3,
              width: 20, height: 20, borderRadius: '50%', background: '#fff',
              transition: 'left 0.2s', boxShadow: '0 1px 3px rgba(0,0,0,0.2)',
            }} />
          </button>
        </div>
      </div>

      {/* Ce que tu reçois */}
      <div style={{
        background: '#F9FAFB', border: `1px solid ${BORDER}`,
        borderRadius: 12, padding: '14px 16px',
      }}>
        <p style={{ fontSize: 12, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: MUTED, marginBottom: 10 }}>
          Ce que tu reçois après chaque appel
        </p>
        {[
          { icon: '📱', label: 'Notification push', desc: 'Titre + motif + urgence — tap pour ouvrir' },
          { icon: '💬', label: 'SMS récap',          desc: 'Backup automatique — même si l\'app est fermée' },
        ].map(({ icon, label, desc }) => (
          <div key={label} style={{ display: 'flex', gap: 10, marginBottom: 8 }}>
            <span style={{ fontSize: 16, flexShrink: 0 }}>{icon}</span>
            <div>
              <p style={{ fontSize: 13, fontWeight: 600, color: TEXT }}>{label}</p>
              <p style={{ fontSize: 12, color: MUTED }}>{desc}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Refresh token */}
      {enabled && hasToken && (
        <button
          onClick={refreshToken}
          disabled={saving}
          style={{
            fontSize: 12, color: MUTED, background: 'none', border: 'none',
            cursor: 'pointer', textDecoration: 'underline', textAlign: 'left',
            padding: 0,
          }}
        >
          {saving ? 'Mise à jour…' : 'Réenregistrer cet appareil'}
        </button>
      )}
    </div>
  )
}
