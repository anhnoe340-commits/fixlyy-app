import { useState } from 'react'
import { supabase } from '@/lib/supabase'
import { requestFCMToken } from '@/lib/firebase'

const BRAND  = '#3B5BFA'
const TEXT   = '#1A1A2E'
const MUTED  = '#6B7280'
const BORDER = '#E5E7EB'

interface Props {
  userId: string
  onDone: () => void
}

async function activatePush(userId: string): Promise<boolean> {
  try {
    if (!('Notification' in window)) return false
    const perm = await Notification.requestPermission()
    if (perm !== 'granted') return false
    const token = await requestFCMToken()
    if (!token) return false
    await supabase.from('profiles').update({
      fcm_token: token,
      push_notifications_enabled: true,
    }).eq('id', userId)
    return true
  } catch { return false }
}

const IOS_STEPS = [
  { icon: '🌐', main: 'Ouvre app.fixlyy.fr dans Safari', note: 'Important : doit être Safari, pas Chrome' },
  { icon: '📤', main: 'Appuie sur le bouton Partager', note: 'Icône carré avec flèche vers le haut, en bas de l\'écran' },
  { icon: '➕', main: 'Sélectionne "Sur l\'écran d\'accueil"', note: null },
  { icon: '✅', main: 'Appuie sur "Ajouter"', note: null },
]

const ANDROID_STEPS = [
  { icon: '🌐', main: 'Ouvre app.fixlyy.fr dans Chrome', note: null },
  { icon: '⋮',  main: 'Appuie sur les 3 points en haut à droite', note: null },
  { icon: '➕', main: 'Sélectionne "Ajouter à l\'écran d\'accueil"', note: null },
  { icon: '✅', main: 'Confirme en appuyant sur "Ajouter"', note: null },
]

export default function StepAppInstall({ userId, onDone }: Props) {
  const [installing, setInstalling] = useState(false)
  const [pushDone,   setPushDone]   = useState(false)

  async function handleInstalled() {
    setInstalling(true)
    const ok = await activatePush(userId)
    setPushDone(ok)
    setInstalling(false)
    onDone()
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20, paddingBottom: 24 }}>

      {/* Titre */}
      <div style={{ textAlign: 'center' }}>
        <div style={{ fontSize: 36, marginBottom: 8 }}>📱</div>
        <h2 style={{ fontSize: 20, fontWeight: 900, color: TEXT, marginBottom: 6 }}>
          Installe l'app Fixlyy sur ton téléphone
        </h2>
        <p style={{ fontSize: 14, color: MUTED, lineHeight: 1.5 }}>
          Reçois les récaps de Mia directement en notification — comme une vraie app.
        </p>
      </div>

      {/* Card iOS */}
      <div style={{ background: '#fff', border: `1px solid ${BORDER}`, borderRadius: 12, overflow: 'hidden', boxShadow: '0 1px 6px rgba(0,0,0,0.05)' }}>
        <div style={{ padding: '12px 16px', borderBottom: `1px solid ${BORDER}`, display: 'flex', alignItems: 'center', gap: 10 }}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
            <path d="M16.5 3C14.76 3 13.09 3.81 12 5.09C10.91 3.81 9.24 3 7.5 3C4.42 3 2 5.42 2 8.5c0 3.78 3.4 6.86 8.55 11.54L12 21.35l1.45-1.32C18.6 15.36 22 12.28 22 8.5C22 5.42 19.58 3 16.5 3z" fill="#6D6D6D"/>
          </svg>
          <p style={{ fontSize: 14, fontWeight: 800, color: TEXT }}>iPhone (iOS)</p>
        </div>
        <div style={{ padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: 12 }}>
          {IOS_STEPS.map((s, i) => (
            <div key={i} style={{ display: 'flex', gap: 12 }}>
              <div style={{
                width: 32, height: 32, borderRadius: 10, background: 'rgba(59,91,250,0.08)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 16, flexShrink: 0,
              }}>{s.icon}</div>
              <div style={{ paddingTop: 2 }}>
                <p style={{ fontSize: 13, fontWeight: 700, color: TEXT, lineHeight: 1.4 }}>{s.main}</p>
                {s.note && <p style={{ fontSize: 11, color: MUTED, marginTop: 2, lineHeight: 1.4 }}>{s.note}</p>}
              </div>
            </div>
          ))}
          <div style={{ background: 'rgba(5,150,105,0.07)', borderRadius: 8, padding: '8px 12px', border: '1px solid rgba(5,150,105,0.2)' }}>
            <p style={{ fontSize: 12, color: '#059669', lineHeight: 1.4 }}>
              ✅ L'app Fixlyy apparaît sur ton écran d'accueil comme une vraie application.
            </p>
          </div>
        </div>
      </div>

      {/* Card Android */}
      <div style={{ background: '#fff', border: `1px solid ${BORDER}`, borderRadius: 12, overflow: 'hidden', boxShadow: '0 1px 6px rgba(0,0,0,0.05)' }}>
        <div style={{ padding: '12px 16px', borderBottom: `1px solid ${BORDER}`, display: 'flex', alignItems: 'center', gap: 10 }}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
            <path d="M6 18c0 .55.45 1 1 1h1v3.5c0 .83.67 1.5 1.5 1.5s1.5-.67 1.5-1.5V19h2v3.5c0 .83.67 1.5 1.5 1.5s1.5-.67 1.5-1.5V19h1c.55 0 1-.45 1-1V8H6v10zM3.5 8C2.67 8 2 8.67 2 9.5v7c0 .83.67 1.5 1.5 1.5S5 17.33 5 16.5v-7C5 8.67 4.33 8 3.5 8zm17 0c-.83 0-1.5.67-1.5 1.5v7c0 .83.67 1.5 1.5 1.5s1.5-.67 1.5-1.5v-7c0-.83-.67-1.5-1.5-1.5zm-4.97-5.84l1.3-1.3c.2-.2.2-.51 0-.71-.2-.2-.51-.2-.71 0l-1.48 1.48C13.85 1.23 12.95 1 12 1c-.96 0-1.86.23-2.66.63L7.85.15c-.2-.2-.51-.2-.71 0-.2.2-.2.51 0 .71l1.31 1.31C6.97 3.26 6 5.01 6 7h12c0-1.99-.97-3.75-2.47-4.84zM10 5H9V4h1v1zm5 0h-1V4h1v1z" fill="#3DDC84"/>
          </svg>
          <p style={{ fontSize: 14, fontWeight: 800, color: TEXT }}>Android</p>
        </div>
        <div style={{ padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: 12 }}>
          {ANDROID_STEPS.map((s, i) => (
            <div key={i} style={{ display: 'flex', gap: 12 }}>
              <div style={{
                width: 32, height: 32, borderRadius: 10, background: 'rgba(59,91,250,0.08)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: s.icon === '⋮' ? 18 : 16, fontWeight: 900, color: MUTED, flexShrink: 0,
              }}>{s.icon}</div>
              <div style={{ paddingTop: 2 }}>
                <p style={{ fontSize: 13, fontWeight: 700, color: TEXT, lineHeight: 1.4 }}>{s.main}</p>
              </div>
            </div>
          ))}
          <div style={{ background: 'rgba(5,150,105,0.07)', borderRadius: 8, padding: '8px 12px', border: '1px solid rgba(5,150,105,0.2)' }}>
            <p style={{ fontSize: 12, color: '#059669', lineHeight: 1.4 }}>
              ✅ L'app Fixlyy s'installe automatiquement.
            </p>
          </div>
        </div>
      </div>

      {/* Note notifications */}
      <div style={{ display: 'flex', gap: 10, padding: '10px 14px', background: 'rgba(59,91,250,0.04)', borderRadius: 10, border: '1px solid rgba(59,91,250,0.12)' }}>
        <span style={{ fontSize: 16, flexShrink: 0 }}>💡</span>
        <p style={{ fontSize: 12, color: MUTED, lineHeight: 1.5 }}>
          Une fois installée, active les notifications pour recevoir les récaps de Mia en temps réel.
        </p>
      </div>

      {/* Bouton principal */}
      <button
        onClick={handleInstalled}
        disabled={installing}
        style={{
          width: '100%', padding: '16px', borderRadius: 12, border: 'none',
          background: installing ? '#D1D5DB' : BRAND,
          color: '#fff', fontSize: 14, fontWeight: 800,
          cursor: installing ? 'default' : 'pointer',
          boxShadow: installing ? 'none' : '0 4px 16px rgba(59,91,250,0.28)',
        }}
      >
        {installing ? 'Activation des notifications…' : 'J\'ai installé l\'app → Continuer'}
      </button>

      {/* Lien passer */}
      <button
        onClick={onDone}
        style={{ fontSize: 13, color: '#9CA3AF', background: 'none', border: 'none', cursor: 'pointer', textDecoration: 'underline', textAlign: 'center' }}
      >
        Passer cette étape →
      </button>

    </div>
  )
}
