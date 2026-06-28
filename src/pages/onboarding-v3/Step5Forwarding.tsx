import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import OnboardingVideo from '@/components/OnboardingVideo'
import { ONBOARDING_VIDEOS } from '@/config/onboarding-videos'
import { requestFCMToken } from '@/lib/firebase'

const BRAND  = '#3B5BFA'
const TEXT   = '#1A1A2E'
const MUTED  = '#6B7280'
const BORDER = '#E5E7EB'

function formatFrPhone(e164: string): string {
  const local = e164.replace('+33', '0')
  return local.replace(/(\d{2})(?=\d)/g, '$1 ').trim()
}

interface ForwardingType {
  id: string
  title: string
  subtitle: string
  badge: { label: string; color: string }
  getCode: (num: string) => string
  getDeactivate: () => string
  tip: string
}

const FORWARDING_TYPES: ForwardingType[] = [
  {
    id: 'immediate',
    title: 'Renvoi immédiat',
    subtitle: "Tous tes appels vont directement à Mia",
    badge: { label: 'RECOMMANDÉ PRO', color: '#059669' },
    getCode: num => `**21*${num}#`,
    getDeactivate: () => `##21#`,
    tip: 'Idéal si tu as un numéro professionnel dédié.',
  },
  {
    id: 'after-delay',
    title: 'Renvoi après 20 secondes',
    subtitle: "Ton téléphone sonne d'abord, Mia prend le relais si tu ne décroches pas",
    badge: { label: 'RECOMMANDÉ PERSO', color: '#D97706' },
    getCode: num => `**61*${num}*11*20#`,
    getDeactivate: () => `##61#`,
    tip: 'Recommandé si tu utilises ton numéro personnel.',
  },
  {
    id: 'if-busy',
    title: 'Renvoi si occupé',
    subtitle: "Mia répond uniquement quand tu es déjà en communication",
    badge: { label: 'COMPLÉMENT', color: '#2563EB' },
    getCode: num => `**67*${num}#`,
    getDeactivate: () => `##67#`,
    tip: 'Peut se combiner avec le renvoi après Xs pour une couverture maximale.',
  },
]

const OPERATORS = ['Orange', 'SFR', 'Bouygues', 'Free']

const OPERATOR_NOTES: Record<string, string | null> = {
  Orange:   null,
  SFR:      null,
  Bouygues: null,
  Free:     'Pour Free Mobile, tu peux aussi passer par l\'app Free Mobile → Gérer mes services → Renvoi d\'appel.',
}

interface Props {
  userId: string
  fixlyyNumber: string | null
  onDone: () => void
}

async function activatePushNotifications(userId: string): Promise<boolean> {
  try {
    if (!('Notification' in window)) return false
    const permission = await Notification.requestPermission()
    if (permission !== 'granted') return false
    const token = await requestFCMToken()
    if (!token) return false
    await supabase.from('profiles').update({
      fcm_token: token,
      push_notifications_enabled: true,
    }).eq('id', userId)
    return true
  } catch { return false }
}

export default function Step5Forwarding({ userId, fixlyyNumber, onDone }: Props) {
  const [twilioNum, setTwilioNum] = useState<string | null>(fixlyyNumber)
  const [openType, setOpenType]   = useState<string | null>(null)
  const [openOp, setOpenOp]       = useState<Record<string, boolean>>({})
  const [copied, setCopied]       = useState<string | null>(null)
  const [pushActivating, setPushActivating] = useState(false)
  const [pushDone, setPushDone]             = useState(false)

  useEffect(() => {
    if (twilioNum) return
    const interval = setInterval(async () => {
      const { data } = await supabase.from('profiles').select('twilio_number').eq('id', userId).single()
      if (data?.twilio_number) { setTwilioNum(data.twilio_number); clearInterval(interval) }
    }, 2000)
    return () => clearInterval(interval)
  }, [userId, twilioNum])

  function copyCode(code: string) {
    navigator.clipboard.writeText(code)
    setCopied(code)
    setTimeout(() => setCopied(null), 2000)
  }

  function toggleOp(typeId: string, op: string) {
    const key = `${typeId}-${op}`
    setOpenOp(prev => ({ ...prev, [key]: !prev[key] }))
  }

  if (!twilioNum) {
    return (
      <div className="flex flex-col items-center justify-center gap-6 py-8">
        <div className="w-10 h-10 border-2 border-t-transparent rounded-full animate-spin" style={{ borderColor: BRAND }} />
        <p className="text-sm text-center" style={{ color: MUTED }}>Attribution du numéro en cours…</p>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-5">
      <div>
        <h2 className="text-xl font-bold mb-1" style={{ color: TEXT }}>Active le renvoi d'appel</h2>
        <p className="text-sm" style={{ color: MUTED }}>Quand tu ne peux pas décrocher, Mia prend le relais.</p>
      </div>

      {/* Numéro Mia */}
      <div style={{
        background: 'rgba(59,91,250,0.06)', border: `1.5px solid rgba(59,91,250,0.2)`,
        borderRadius: 12, padding: '14px 16px', textAlign: 'center',
      }}>
        <p style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: MUTED, marginBottom: 4 }}>
          Ton numéro Mia
        </p>
        <p style={{ fontSize: 26, fontWeight: 900, color: BRAND, letterSpacing: '0.05em' }}>{formatFrPhone(twilioNum)}</p>
      </div>

      {/* Vidéo */}
      <OnboardingVideo
        videoUrl={ONBOARDING_VIDEOS.step4}
        placeholderMessage={`Le renvoi d'appel permet à Mia de répondre à ta place quand tu ne peux pas décrocher.\n\n1. Renvoi immédiat — tous les appels vont directement à Mia (si tu as un numéro pro dédié)\n\n2. Renvoi après X secondes — ton téléphone sonne d'abord, puis Mia prend le relais si tu ne décroches pas (recommandé si tu utilises ton numéro personnel)\n\n3. Renvoi si occupé — Mia répond uniquement quand tu es déjà en communication\n\nSi tu utilises ton numéro personnel, choisis l'option 2 ou 3 pour ne pas rater tes appels personnels.`}
      />

      {/* 3 cards par type */}
      <div className="flex flex-col gap-3">
        {FORWARDING_TYPES.map(ft => {
          const isOpen = openType === ft.id
          return (
            <div key={ft.id} style={{
              background: '#fff', border: `1px solid ${isOpen ? BRAND : BORDER}`,
              borderRadius: 12, overflow: 'hidden',
              boxShadow: '0 1px 6px rgba(0,0,0,0.05)',
              transition: 'border-color 0.15s',
            }}>
              <button
                type="button"
                onClick={() => setOpenType(isOpen ? null : ft.id)}
                style={{
                  width: '100%', textAlign: 'left', padding: '14px 16px',
                  background: 'none', border: 'none', cursor: 'pointer',
                  display: 'flex', alignItems: 'flex-start', gap: 12,
                }}
              >
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 4 }}>
                    <span style={{ fontSize: 14, fontWeight: 700, color: TEXT }}>{ft.title}</span>
                    <span style={{
                      fontSize: 10, fontWeight: 800, letterSpacing: '0.06em',
                      textTransform: 'uppercase', padding: '2px 8px', borderRadius: 20,
                      background: ft.badge.color, color: '#fff',
                    }}>
                      {ft.badge.label}
                    </span>
                  </div>
                  <p style={{ fontSize: 12, color: MUTED, lineHeight: 1.4 }}>{ft.subtitle}</p>
                </div>
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none"
                  style={{ flexShrink: 0, transform: isOpen ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s', color: BRAND, marginTop: 3 }}>
                  <path d="M4 6l4 4 4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </button>

              {isOpen && (
                <div style={{ borderTop: `1px solid ${BORDER}`, padding: '12px 16px', display: 'flex', flexDirection: 'column', gap: 8 }}>
                  <p style={{ fontSize: 11, color: '#059669', fontWeight: 600, marginBottom: 2 }}>💡 {ft.tip}</p>

                  {OPERATORS.map(op => {
                    const key = `${ft.id}-${op}`
                    const isOpOpen = !!openOp[key]
                    const code  = ft.getCode(twilioNum)
                    const deact = ft.getDeactivate()

                    return (
                      <div key={op} style={{ background: '#F9FAFB', border: `1px solid ${BORDER}`, borderRadius: 8, overflow: 'hidden' }}>
                        <button type="button" onClick={() => toggleOp(ft.id, op)}
                          style={{
                            width: '100%', textAlign: 'left', padding: '10px 14px',
                            background: 'none', border: 'none', cursor: 'pointer',
                            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                          }}
                        >
                          <span style={{ fontSize: 13, fontWeight: 600, color: TEXT }}>{op}</span>
                          <svg width="14" height="14" viewBox="0 0 16 16" fill="none"
                            style={{ transform: isOpOpen ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s', color: BRAND }}>
                            <path d="M4 6l4 4 4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                          </svg>
                        </button>

                        {isOpOpen && (
                          <div style={{ borderTop: `1px solid ${BORDER}`, padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: 10 }}>
                            <div>
                              <p style={{ fontSize: 11, fontWeight: 700, color: MUTED, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 4 }}>Activer</p>
                              <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: '#F3F4F6', borderRadius: 8, padding: '8px 12px' }}>
                                <code style={{ flex: 1, fontSize: 13, fontFamily: 'monospace', fontWeight: 700, color: TEXT }}>{code}</code>
                                <button onClick={() => copyCode(code)} style={{
                                  fontSize: 11, fontWeight: 700, padding: '4px 10px', borderRadius: 6,
                                  border: 'none', cursor: 'pointer',
                                  background: copied === code ? '#059669' : BRAND, color: '#fff', transition: 'background 0.2s',
                                }}>
                                  {copied === code ? '✓' : 'Copier'}
                                </button>
                              </div>
                            </div>
                            <div>
                              <p style={{ fontSize: 11, fontWeight: 700, color: MUTED, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 4 }}>Désactiver</p>
                              <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: '#F3F4F6', borderRadius: 8, padding: '8px 12px' }}>
                                <code style={{ flex: 1, fontSize: 13, fontFamily: 'monospace', fontWeight: 700, color: TEXT }}>{deact}</code>
                                <button onClick={() => copyCode(deact)} style={{
                                  fontSize: 11, fontWeight: 700, padding: '4px 10px', borderRadius: 6,
                                  border: 'none', cursor: 'pointer',
                                  background: copied === deact ? '#059669' : '#6B7280', color: '#fff', transition: 'background 0.2s',
                                }}>
                                  {copied === deact ? '✓' : 'Copier'}
                                </button>
                              </div>
                            </div>
                            {OPERATOR_NOTES[op] && (
                              <p style={{ fontSize: 11, color: MUTED, lineHeight: 1.5, background: 'rgba(59,91,250,0.06)', borderRadius: 6, padding: '8px 10px' }}>
                                ℹ️ {OPERATOR_NOTES[op]}
                              </p>
                            )}
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          )
        })}
      </div>

      {/* Deux façons de ne jamais rater un appel */}
      <div style={{ background: '#fff', border: `1px solid ${BORDER}`, borderRadius: 12, overflow: 'hidden', boxShadow: '0 1px 6px rgba(0,0,0,0.05)' }}>
        <div style={{ background: BRAND, padding: '10px 16px' }}>
          <p style={{ color: '#fff', fontWeight: 800, fontSize: 13 }}>Deux façons de ne jamais rater un appel</p>
        </div>
        <div style={{ padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={{ display: 'flex', gap: 12 }}>
            <div style={{
              width: 28, height: 28, borderRadius: 8, background: 'rgba(59,91,250,0.10)',
              display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14, flexShrink: 0,
            }}>A</div>
            <div>
              <p style={{ fontSize: 13, fontWeight: 700, color: TEXT, marginBottom: 2 }}>Tu as un numéro pro</p>
              <p style={{ fontSize: 12, color: MUTED, lineHeight: 1.5 }}>
                Fais le renvoi depuis ton numéro pro vers ton numéro Fixlyy. Tes appels perso ne sont pas affectés.
              </p>
            </div>
          </div>
          <div style={{ height: 1, background: BORDER }} />
          <div style={{ display: 'flex', gap: 12 }}>
            <div style={{
              width: 28, height: 28, borderRadius: 8, background: 'rgba(59,91,250,0.10)',
              display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14, flexShrink: 0,
            }}>B</div>
            <div>
              <p style={{ fontSize: 13, fontWeight: 700, color: TEXT, marginBottom: 2 }}>Tu n'as que ton numéro perso</p>
              <p style={{ fontSize: 12, color: MUTED, lineHeight: 1.5 }}>
                Mets directement ton numéro Fixlyy sur Google, Pages Jaunes ou ton site. Tes clients appellent Mia directement. Zéro renvoi, zéro friction.
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Tes récaps d'appels */}
      <div style={{ background: 'rgba(59,91,250,0.04)', border: `1px solid rgba(59,91,250,0.15)`, borderRadius: 12, padding: '14px 16px' }}>
        <p style={{ fontSize: 13, fontWeight: 700, color: TEXT, marginBottom: 10 }}>Tes récaps d'appels</p>
        <p style={{ fontSize: 12, color: MUTED, marginBottom: 12 }}>Après chaque appel, tu reçois :</p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 14 }}>
          {[
            { icon: '📱', label: 'Notification sur l\'app Fixlyy', desc: 'Tap pour ouvrir le détail de l\'appel' },
            { icon: '💬', label: 'SMS récap',                       desc: 'Backup automatique — même hors connexion' },
          ].map(({ icon, label, desc }) => (
            <div key={label} style={{ display: 'flex', gap: 10 }}>
              <span style={{ fontSize: 18, flexShrink: 0 }}>{icon}</span>
              <div>
                <p style={{ fontSize: 13, fontWeight: 600, color: TEXT }}>{label}</p>
                <p style={{ fontSize: 12, color: MUTED }}>{desc}</p>
              </div>
            </div>
          ))}
        </div>

        {!pushDone ? (
          <button
            onClick={async () => {
              setPushActivating(true)
              const ok = await activatePushNotifications(userId)
              setPushActivating(false)
              setPushDone(ok)
            }}
            disabled={pushActivating}
            style={{
              width: '100%', padding: '12px', borderRadius: 10,
              background: pushActivating ? '#D1D5DB' : BRAND,
              color: '#fff', fontSize: 13, fontWeight: 800,
              border: 'none', cursor: pushActivating ? 'default' : 'pointer',
              boxShadow: pushActivating ? 'none' : '0 2px 10px rgba(59,91,250,0.25)',
            }}
          >
            {pushActivating ? 'Activation…' : 'Activer les notifications maintenant →'}
          </button>
        ) : (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 14px', background: 'rgba(5,150,105,0.08)', borderRadius: 10, border: '1px solid rgba(5,150,105,0.25)' }}>
            <span>✅</span>
            <p style={{ fontSize: 13, fontWeight: 700, color: '#059669' }}>Notifications activées sur cet appareil</p>
          </div>
        )}
      </div>

      <button
        onClick={onDone}
        className="w-full py-4 rounded-xl text-white text-sm font-bold"
        style={{ background: BRAND, boxShadow: '0 4px 16px rgba(59,91,250,0.25)' }}
      >
        Renvoi configuré → Continuer
      </button>

      <button onClick={onDone} className="text-sm text-center" style={{ color: '#9CA3AF', textDecoration: 'underline' }}>
        Passer cette étape →
      </button>
    </div>
  )
}
