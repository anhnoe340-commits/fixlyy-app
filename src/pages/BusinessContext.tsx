import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import SectionVideo from '@/components/SectionVideo'
import { BUSINESS_CONTEXT_VIDEOS } from '@/config/business-context-videos'

const BRAND  = '#3B5BFA'
const TEXT   = '#1A1A2E'
const MUTED  = '#6B7280'
const BORDER = '#E5E7EB'

// ── Types ─────────────────────────────────────────────────────────────────────

interface DaySchedule { day: string; on: boolean; open: string; close: string }
interface Service      { name: string; price_min: string; price_max: string; duration: string; emergency: boolean }
interface TeamMember   { name: string; role: string; phone: string; active: boolean }
interface Unavailability { id?: string; team_member_name: string | null; start_at: string; end_at: string }
interface RegularClient  { name: string; phone: string; service: string }
interface FAQ            { question: string; answer: string }
interface Supplier       { name: string; type: string; note: string }
interface BlacklistEntry { name: string; phone: string }

interface ContextData {
  schedule: {
    days: DaySchedule[]
    callback_delay: string
    notes: string
  }
  services: Service[]
  team: TeamMember[]
  regular_clients: RegularClient[]
  faq: FAQ[]
  tone: { tutoiement: boolean; style: string; instructions: string }
  suppliers: Supplier[]
  zones: { included: string[]; excluded: string[]; notes: string }
  blacklist: BlacklistEntry[]
  competitors: string
  difficult_situations: { aggressive: string; complaint: string; threat: string }
  commercial_goals: { priority: string[]; refuse: string[]; instructions: string }
  special_info: string
}

const DAYS = ['Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi', 'Dimanche']

const DEFAULT_CTX: ContextData = {
  schedule: {
    days: DAYS.map(d => ({ day: d, on: ['Lundi','Mardi','Mercredi','Jeudi','Vendredi'].includes(d), open: '08:00', close: '18:00' })),
    callback_delay: 'Dans l\'heure',
    notes: '',
  },
  services:        [],
  team:            [],
  regular_clients: [],
  faq:             [],
  tone: { tutoiement: false, style: 'Professionnel et chaleureux', instructions: '' },
  suppliers:       [],
  zones:           { included: [], excluded: [], notes: '' },
  blacklist:       [],
  competitors:     '',
  difficult_situations: { aggressive: '', complaint: '', threat: '' },
  commercial_goals:     { priority: [], refuse: [], instructions: '' },
  special_info:         '',
}

// ── Helpers ───────────────────────────────────────────────────────────────────

const input: React.CSSProperties = {
  width: '100%', background: '#F9FAFB', border: `1px solid ${BORDER}`,
  borderRadius: 8, padding: '9px 12px', fontSize: 13, color: TEXT, outline: 'none',
}
const textarea: React.CSSProperties = {
  ...input, minHeight: 80, resize: 'vertical', lineHeight: 1.5,
}
const label: React.CSSProperties = {
  fontSize: 11, fontWeight: 700, textTransform: 'uppercase',
  letterSpacing: '0.06em', color: MUTED, marginBottom: 4, display: 'block',
}

function Badge({ text, color }: { text: string; color: 'red' | 'orange' | 'gray' }) {
  const colors = {
    red:    { bg: 'rgba(239,68,68,0.1)',  text: '#DC2626' },
    orange: { bg: 'rgba(245,158,11,0.1)', text: '#D97706' },
    gray:   { bg: 'rgba(107,114,128,0.1)', text: '#6B7280' },
  }
  const c = colors[color]
  return (
    <span style={{ fontSize: 10, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.07em',
      padding: '2px 8px', borderRadius: 20, background: c.bg, color: c.text }}>
      {text}
    </span>
  )
}

function AddBtn({ onClick, label: lbl = 'Ajouter' }: { onClick: () => void; label?: string }) {
  return (
    <button type="button" onClick={onClick} style={{
      display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, fontWeight: 600,
      color: BRAND, background: 'rgba(59,91,250,0.07)', border: `1px dashed rgba(59,91,250,0.3)`,
      borderRadius: 8, padding: '7px 14px', cursor: 'pointer',
    }}>
      + {lbl}
    </button>
  )
}

function RemoveBtn({ onClick }: { onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} style={{
      fontSize: 11, color: '#EF4444', background: 'rgba(239,68,68,0.07)',
      border: '1px solid rgba(239,68,68,0.15)', borderRadius: 6,
      padding: '4px 8px', cursor: 'pointer', fontWeight: 700, flexShrink: 0,
    }}>
      ✕
    </button>
  )
}

function TagInput({ tags, onChange }: { tags: string[]; onChange: (tags: string[]) => void }) {
  const [val, setVal] = useState('')
  function add() {
    const v = val.trim()
    if (v && !tags.includes(v)) { onChange([...tags, v]); setVal('') }
  }
  return (
    <div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: tags.length ? 8 : 0 }}>
        {tags.map(t => (
          <span key={t} style={{
            fontSize: 12, fontWeight: 600, color: BRAND, background: 'rgba(59,91,250,0.09)',
            border: `1px solid rgba(59,91,250,0.2)`, borderRadius: 20, padding: '3px 10px',
            display: 'flex', alignItems: 'center', gap: 6,
          }}>
            {t}
            <button type="button" onClick={() => onChange(tags.filter(x => x !== t))}
              style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#9CA3AF', fontSize: 13, padding: 0, lineHeight: 1 }}>
              ×
            </button>
          </span>
        ))}
      </div>
      <div style={{ display: 'flex', gap: 6 }}>
        <input
          value={val}
          onChange={e => setVal(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); add() } }}
          placeholder="Taper + Entrée pour ajouter"
          style={{ ...input, flex: 1 }}
        />
        <button type="button" onClick={add} style={{
          background: BRAND, color: '#fff', border: 'none', borderRadius: 8,
          padding: '9px 14px', fontSize: 13, fontWeight: 700, cursor: 'pointer',
        }}>+</button>
      </div>
    </div>
  )
}

interface SectionProps {
  index: number
  title: string
  icon: string
  badge: 'red' | 'orange' | 'gray'
  badgeText: string
  isConfigured: boolean
  isOpen: boolean
  onToggle: () => void
  children: React.ReactNode
}

function Section({ index, title, icon, badge, badgeText, isConfigured, isOpen, onToggle, children }: SectionProps) {
  return (
    <div style={{
      background: '#fff', border: `1px solid ${isOpen ? BRAND : BORDER}`,
      borderRadius: 12, overflow: 'hidden',
      boxShadow: '0 1px 4px rgba(0,0,0,0.04)',
      transition: 'border-color 0.15s',
    }}>
      <button type="button" onClick={onToggle} style={{
        width: '100%', textAlign: 'left', padding: '14px 16px',
        background: 'none', border: 'none', cursor: 'pointer',
        display: 'flex', alignItems: 'flex-start', gap: 12,
      }}>
        <span style={{ fontSize: 20, flexShrink: 0, lineHeight: 1.2 }}>{icon}</span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 3 }}>
            <span style={{ fontSize: 14, fontWeight: 700, color: TEXT }}>
              {index}. {title}
            </span>
            <Badge text={badgeText} color={badge} />
            <span style={{ fontSize: 11, fontWeight: 600, color: isConfigured ? '#059669' : '#D97706' }}>
              {isConfigured ? '✅ Configuré' : '⚠️ À remplir'}
            </span>
          </div>
        </div>
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none"
          style={{ flexShrink: 0, transform: isOpen ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s', color: BRAND, marginTop: 2 }}>
          <path d="M4 6l4 4 4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>

      {isOpen && (
        <div style={{ borderTop: `1px solid ${BORDER}`, padding: '16px' }}>
          {children}
        </div>
      )}
    </div>
  )
}

// ── Main Component ─────────────────────────────────────────────────────────────

export default function BusinessContext() {
  const fromOnboarding = new URLSearchParams(window.location.search).get('from') === 'onboarding'

  const [userId, setUserId]         = useState<string | null>(null)
  const [ctx, setCtx]               = useState<ContextData>(DEFAULT_CTX)
  const [unavail, setUnavail]       = useState<Unavailability[]>([])
  const [loading, setLoading]       = useState(true)
  const [saving, setSaving]         = useState(false)
  const [saved, setSaved]           = useState(false)
  const [saveError, setSaveError]   = useState('')
  const [openSection, setOpenSection] = useState<number | null>(1)

  // Load existing data
  useEffect(() => {
    supabase.auth.getUser().then(async ({ data: { user } }) => {
      if (!user) { window.location.href = '/commencer'; return }
      setUserId(user.id)

      // Fetch profile.business_context
      const { data: profile } = await supabase.from('profiles')
        .select('business_context').eq('id', user.id).maybeSingle()

      if (profile?.business_context) {
        setCtx({ ...DEFAULT_CTX, ...profile.business_context })
      }

      // Fetch unavailabilities
      const { data: uData } = await supabase.from('unavailabilities')
        .select('id,team_member_name,start_at,end_at')
        .eq('profile_id', user.id)
        .order('start_at')

      if (uData) setUnavail(uData.map(u => ({
        id: u.id,
        team_member_name: u.team_member_name,
        start_at: u.start_at.slice(0, 16),
        end_at:   u.end_at.slice(0, 16),
      })))

      setLoading(false)
    })
  }, [])

  // Section configured checks
  const isConfigured = {
    1:  ctx.schedule.days.some(d => d.on),
    2:  ctx.services.length > 0,
    3:  ctx.team.length > 0,
    4:  unavail.length > 0,
    5:  ctx.regular_clients.length > 0,
    6:  ctx.faq.length > 0,
    7:  ctx.tone.style !== '',
    8:  ctx.suppliers.length > 0,
    9:  ctx.zones.included.length > 0,
    10: ctx.blacklist.length > 0,
    11: ctx.competitors.trim() !== '',
    12: Object.values(ctx.difficult_situations).some(v => v.trim() !== ''),
    13: ctx.commercial_goals.priority.length > 0 || ctx.commercial_goals.instructions.trim() !== '',
    14: ctx.special_info.trim() !== '',
  } as Record<number, boolean>

  const configuredCount = Object.values(isConfigured).filter(Boolean).length
  const canSave = isConfigured[1] && isConfigured[2]

  function updateCtx(patch: Partial<ContextData>) {
    setCtx(prev => ({ ...prev, ...patch }))
  }

  async function handleSave() {
    if (!userId || !canSave) return
    setSaving(true); setSaveError('')
    try {
      // Save business_context
      const { error: profileErr } = await supabase.from('profiles')
        .update({ business_context: ctx }).eq('id', userId)
      if (profileErr) throw profileErr

      // Replace unavailabilities
      await supabase.from('unavailabilities').delete().eq('profile_id', userId)
      if (unavail.length > 0) {
        const rows = unavail.filter(u => u.start_at && u.end_at).map(u => ({
          profile_id:       userId,
          team_member_name: u.team_member_name || null,
          start_at:         new Date(u.start_at).toISOString(),
          end_at:           new Date(u.end_at).toISOString(),
        }))
        if (rows.length > 0) {
          const { error: uErr } = await supabase.from('unavailabilities').insert(rows)
          if (uErr) throw uErr
        }
      }

      // Mark onboarding horaires saved (for Dashboard setup mode compat)
      await supabase.from('profiles').update({
        hours: JSON.stringify(ctx.schedule.days.map(d => ({ day: d.day, on: d.on, open: d.open, close: d.close }))),
        onboarding_step: 7,
        onboarding_completed: true,
      }).eq('id', userId)

      setSaved(true)
      setTimeout(() => {
        window.location.href = '/dashboard'
      }, 1200)
    } catch (e: any) {
      setSaveError(e.message || 'Erreur lors de la sauvegarde.')
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#F8F9FF' }}>
        <div style={{ width: 32, height: 32, border: `3px solid ${BRAND}`, borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
      </div>
    )
  }

  return (
    <div style={{ minHeight: '100vh', background: '#F8F9FF', fontFamily: 'Inter, system-ui, sans-serif' }}>

      {/* Header */}
      <div style={{ background: '#fff', borderBottom: `1px solid ${BORDER}`, padding: '14px 20px', display: 'flex', alignItems: 'center', gap: 16, position: 'sticky', top: 0, zIndex: 10 }}>
        {!fromOnboarding && (
          <button onClick={() => window.location.href = '/dashboard'} style={{
            background: 'none', border: 'none', cursor: 'pointer',
            color: MUTED, fontSize: 20, padding: '0 4px', lineHeight: 1,
          }}>←</button>
        )}
        <div style={{ flex: 1 }}>
          <p style={{ fontSize: 17, fontWeight: 800, color: TEXT, margin: 0 }}>Mon activité</p>
          <p style={{ fontSize: 12, color: MUTED, margin: 0 }}>Plus Mia en sait sur toi, mieux elle travaille pour toi.</p>
        </div>
        <img src="/logo-full-clean.svg" alt="Fixlyy" style={{ height: 26 }} />
      </div>

      <div style={{ maxWidth: 680, margin: '0 auto', padding: '20px 16px 40px' }}>

        {/* Bannière onboarding */}
        {fromOnboarding && (
          <div style={{
            background: `linear-gradient(135deg, rgba(59,91,250,0.08) 0%, rgba(59,91,250,0.04) 100%)`,
            border: `1.5px solid rgba(59,91,250,0.2)`, borderRadius: 12,
            padding: '14px 16px', marginBottom: 20,
          }}>
            <p style={{ fontSize: 14, fontWeight: 700, color: BRAND, margin: 0 }}>
              🎯 Dernière étape — Présente ton activité à Mia pour qu'elle travaille vraiment pour toi.
            </p>
          </div>
        )}

        {/* Titre + badge Mia */}
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, marginBottom: 16 }}>
          <div />
          <span style={{
            fontSize: 11, fontWeight: 700, color: BRAND,
            background: 'rgba(59,91,250,0.09)', border: `1px solid rgba(59,91,250,0.2)`,
            borderRadius: 20, padding: '4px 12px',
          }}>
            🧠 Mia utilise ces infos en temps réel
          </span>
        </div>

        {/* Barre de progression */}
        <div style={{ marginBottom: 24 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
            <span style={{ fontSize: 13, fontWeight: 600, color: TEXT }}>{configuredCount}/14 sections configurées</span>
            <span style={{ fontSize: 12, color: MUTED }}>{Math.round((configuredCount / 14) * 100)}%</span>
          </div>
          <div style={{ background: '#E5E7EB', borderRadius: 20, height: 8, overflow: 'hidden' }}>
            <div style={{ height: '100%', width: `${(configuredCount / 14) * 100}%`, background: BRAND, borderRadius: 20, transition: 'width 0.5s ease' }} />
          </div>
          <p style={{ fontSize: 11, color: MUTED, marginTop: 4 }}>Plus la barre est pleine, plus Mia est efficace</p>
        </div>

        {/* ── 14 SECTIONS ── */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>

          {/* SECTION 1 — Horaires */}
          <Section index={1} title="Horaires & Disponibilités" icon="🕐" badge="red" badgeText="OBLIGATOIRE"
            isConfigured={isConfigured[1]} isOpen={openSection === 1} onToggle={() => setOpenSection(openSection === 1 ? null : 1)}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <SectionVideo videoUrl={BUSINESS_CONTEXT_VIDEOS.horaires} />

              <div>
                <label style={label}>Jours d'ouverture et horaires</label>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {ctx.schedule.days.map((d, i) => (
                    <div key={d.day} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <span style={{ fontSize: 13, fontWeight: 600, color: TEXT, width: 88, flexShrink: 0 }}>{d.day}</span>
                      {d.on ? (
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flex: 1 }}>
                          <input type="time" value={d.open}
                            onChange={e => {
                              const days = [...ctx.schedule.days]
                              days[i] = { ...days[i], open: e.target.value }
                              updateCtx({ schedule: { ...ctx.schedule, days } })
                            }}
                            style={{ ...input, width: 'auto', flex: 0 }} />
                          <span style={{ color: MUTED, fontSize: 12 }}>—</span>
                          <input type="time" value={d.close}
                            onChange={e => {
                              const days = [...ctx.schedule.days]
                              days[i] = { ...days[i], close: e.target.value }
                              updateCtx({ schedule: { ...ctx.schedule, days } })
                            }}
                            style={{ ...input, width: 'auto', flex: 0 }} />
                        </div>
                      ) : (
                        <span style={{ fontSize: 13, color: '#D1D5DB', flex: 1 }}>Fermé</span>
                      )}
                      <button type="button"
                        onClick={() => {
                          const days = [...ctx.schedule.days]
                          days[i] = { ...days[i], on: !days[i].on }
                          updateCtx({ schedule: { ...ctx.schedule, days } })
                        }}
                        style={{
                          width: 44, height: 24, borderRadius: 12, border: 'none', cursor: 'pointer', flexShrink: 0,
                          background: d.on ? BRAND : '#D1D5DB', position: 'relative', transition: 'background 0.2s',
                        }}
                      >
                        <span style={{
                          position: 'absolute', top: 2, width: 20, height: 20, background: '#fff',
                          borderRadius: '50%', transition: 'left 0.2s',
                          left: d.on ? 22 : 2, boxShadow: '0 1px 3px rgba(0,0,0,0.15)',
                        }} />
                      </button>
                    </div>
                  ))}
                </div>
              </div>

              <div>
                <label style={label}>Délai de rappel habituel</label>
                <select value={ctx.schedule.callback_delay}
                  onChange={e => updateCtx({ schedule: { ...ctx.schedule, callback_delay: e.target.value } })}
                  style={{ ...input, appearance: 'none', cursor: 'pointer' }}>
                  {['Dans l\'heure', '2h', 'Fin de journée', 'Le lendemain'].map(v => (
                    <option key={v} value={v}>{v}</option>
                  ))}
                </select>
              </div>

              <div>
                <label style={label}>Infos supplémentaires sur les horaires (optionnel)</label>
                <textarea value={ctx.schedule.notes} placeholder="Ex: Fermé le mercredi après-midi"
                  onChange={e => updateCtx({ schedule: { ...ctx.schedule, notes: e.target.value } })}
                  style={textarea} />
              </div>
            </div>
          </Section>

          {/* SECTION 2 — Prestations & Tarifs */}
          <Section index={2} title="Types d'interventions & Tarifs" icon="🔧" badge="red" badgeText="OBLIGATOIRE"
            isConfigured={isConfigured[2]} isOpen={openSection === 2} onToggle={() => setOpenSection(openSection === 2 ? null : 2)}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <SectionVideo videoUrl={BUSINESS_CONTEXT_VIDEOS.interventions} />

              {ctx.services.map((s, i) => (
                <div key={i} style={{ background: '#F9FAFB', border: `1px solid ${BORDER}`, borderRadius: 10, padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: 8 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontSize: 12, fontWeight: 700, color: MUTED }}>Prestation {i + 1}</span>
                    <RemoveBtn onClick={() => updateCtx({ services: ctx.services.filter((_, j) => j !== i) })} />
                  </div>
                  <input value={s.name} placeholder="Nom de la prestation" style={input}
                    onChange={e => {
                      const services = [...ctx.services]
                      services[i] = { ...services[i], name: e.target.value }
                      updateCtx({ services })
                    }} />
                  <div style={{ display: 'flex', gap: 8 }}>
                    <div style={{ flex: 1 }}>
                      <label style={{ ...label, marginBottom: 2 }}>Prix min (€)</label>
                      <input type="number" value={s.price_min} placeholder="80" style={input}
                        onChange={e => {
                          const services = [...ctx.services]
                          services[i] = { ...services[i], price_min: e.target.value }
                          updateCtx({ services })
                        }} />
                    </div>
                    <div style={{ flex: 1 }}>
                      <label style={{ ...label, marginBottom: 2 }}>Prix max (€)</label>
                      <input type="number" value={s.price_max} placeholder="250" style={input}
                        onChange={e => {
                          const services = [...ctx.services]
                          services[i] = { ...services[i], price_max: e.target.value }
                          updateCtx({ services })
                        }} />
                    </div>
                    <div style={{ flex: 1 }}>
                      <label style={{ ...label, marginBottom: 2 }}>Durée</label>
                      <select value={s.duration} style={{ ...input, appearance: 'none' }}
                        onChange={e => {
                          const services = [...ctx.services]
                          services[i] = { ...services[i], duration: e.target.value }
                          updateCtx({ services })
                        }}>
                        {['30 min', '1h', '2h', 'Demi-journée', 'Journée'].map(v => <option key={v}>{v}</option>)}
                      </select>
                    </div>
                  </div>
                  <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: 13, color: TEXT }}>
                    <input type="checkbox" checked={s.emergency} style={{ accentColor: BRAND }}
                      onChange={e => {
                        const services = [...ctx.services]
                        services[i] = { ...services[i], emergency: e.target.checked }
                        updateCtx({ services })
                      }} />
                    Urgence possible
                  </label>
                </div>
              ))}
              <AddBtn onClick={() => updateCtx({ services: [...ctx.services, { name: '', price_min: '', price_max: '', duration: '1h', emergency: false }] })}
                label="Ajouter une prestation" />
            </div>
          </Section>

          {/* SECTION 3 — Équipe */}
          <Section index={3} title="Équipe" icon="👥" badge="orange" badgeText="RECOMMANDÉ"
            isConfigured={isConfigured[3]} isOpen={openSection === 3} onToggle={() => setOpenSection(openSection === 3 ? null : 3)}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <SectionVideo videoUrl={BUSINESS_CONTEXT_VIDEOS.equipe} />
              <p style={{ fontSize: 12, color: MUTED, margin: 0 }}>
                Quand quelqu'un demande un membre spécifique, Mia le dirige vers lui ou un collègue disponible.
              </p>

              {ctx.team.map((m, i) => (
                <div key={i} style={{ background: '#F9FAFB', border: `1px solid ${BORDER}`, borderRadius: 10, padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: 8 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontSize: 12, fontWeight: 700, color: MUTED }}>Membre {i + 1}</span>
                    <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                      <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, cursor: 'pointer', color: TEXT }}>
                        <input type="checkbox" checked={m.active} style={{ accentColor: BRAND }}
                          onChange={e => {
                            const team = [...ctx.team]
                            team[i] = { ...team[i], active: e.target.checked }
                            updateCtx({ team })
                          }} /> Actif
                      </label>
                      <RemoveBtn onClick={() => updateCtx({ team: ctx.team.filter((_, j) => j !== i) })} />
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <input value={m.name} placeholder="Prénom Nom" style={{ ...input, flex: 1 }}
                      onChange={e => {
                        const team = [...ctx.team]
                        team[i] = { ...team[i], name: e.target.value }
                        updateCtx({ team })
                      }} />
                    <select value={m.role} style={{ ...input, flex: 1, appearance: 'none' }}
                      onChange={e => {
                        const team = [...ctx.team]
                        team[i] = { ...team[i], role: e.target.value }
                        updateCtx({ team })
                      }}>
                      {['Plombier','Électricien','Apprenti','Commercial','Autre'].map(v => <option key={v}>{v}</option>)}
                    </select>
                  </div>
                  <input value={m.phone} placeholder="Téléphone direct" style={input}
                    onChange={e => {
                      const team = [...ctx.team]
                      team[i] = { ...team[i], phone: e.target.value }
                      updateCtx({ team })
                    }} />
                </div>
              ))}
              <AddBtn onClick={() => updateCtx({ team: [...ctx.team, { name: '', role: 'Plombier', phone: '', active: true }] })}
                label="Ajouter un membre" />
            </div>
          </Section>

          {/* SECTION 4 — Indisponibilités */}
          <Section index={4} title="Indisponibilités ponctuelles" icon="📅" badge="orange" badgeText="RECOMMANDÉ"
            isConfigured={isConfigured[4]} isOpen={openSection === 4} onToggle={() => setOpenSection(openSection === 4 ? null : 4)}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <p style={{ fontSize: 12, color: MUTED, margin: 0 }}>
                Mia proposera automatiquement le prochain créneau libre. La raison n'est jamais communiquée aux clients.
              </p>

              {unavail.map((u, i) => (
                <div key={i} style={{ background: '#F9FAFB', border: `1px solid ${BORDER}`, borderRadius: 10, padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: 8 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <label style={label}>Concerne</label>
                    <RemoveBtn onClick={() => setUnavail(unavail.filter((_, j) => j !== i))} />
                  </div>
                  <select
                    value={u.team_member_name ?? ''}
                    onChange={e => {
                      const next = [...unavail]
                      next[i] = { ...next[i], team_member_name: e.target.value || null }
                      setUnavail(next)
                    }}
                    style={{ ...input, appearance: 'none' }}
                  >
                    <option value="">Moi (l'artisan)</option>
                    {ctx.team.filter(m => m.active).map(m => (
                      <option key={m.name} value={m.name}>{m.name}</option>
                    ))}
                  </select>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <div style={{ flex: 1 }}>
                      <label style={{ ...label, marginBottom: 2 }}>Début</label>
                      <input type="datetime-local" value={u.start_at} style={input}
                        onChange={e => {
                          const next = [...unavail]
                          next[i] = { ...next[i], start_at: e.target.value }
                          setUnavail(next)
                        }} />
                    </div>
                    <div style={{ flex: 1 }}>
                      <label style={{ ...label, marginBottom: 2 }}>Fin</label>
                      <input type="datetime-local" value={u.end_at} style={input}
                        onChange={e => {
                          const next = [...unavail]
                          next[i] = { ...next[i], end_at: e.target.value }
                          setUnavail(next)
                        }} />
                    </div>
                  </div>
                </div>
              ))}
              <AddBtn
                onClick={() => setUnavail([...unavail, { team_member_name: null, start_at: '', end_at: '' }])}
                label="Ajouter une indisponibilité"
              />
            </div>
          </Section>

          {/* SECTION 5 — Clients réguliers */}
          <Section index={5} title="Clients réguliers" icon="⭐" badge="orange" badgeText="RECOMMANDÉ"
            isConfigured={isConfigured[5]} isOpen={openSection === 5} onToggle={() => setOpenSection(openSection === 5 ? null : 5)}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <p style={{ fontSize: 12, color: MUTED, margin: 0 }}>Mia les reconnaît et les traite en priorité.</p>
              {ctx.regular_clients.map((c, i) => (
                <div key={i} style={{ background: '#F9FAFB', border: `1px solid ${BORDER}`, borderRadius: 10, padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: 8 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontSize: 12, fontWeight: 700, color: MUTED }}>Client {i + 1}</span>
                    <RemoveBtn onClick={() => updateCtx({ regular_clients: ctx.regular_clients.filter((_, j) => j !== i) })} />
                  </div>
                  <input value={c.name} placeholder="Nom complet" style={input}
                    onChange={e => {
                      const rc = [...ctx.regular_clients]; rc[i] = { ...rc[i], name: e.target.value }; updateCtx({ regular_clients: rc })
                    }} />
                  <div style={{ display: 'flex', gap: 8 }}>
                    <input value={c.phone} placeholder="Téléphone" style={{ ...input, flex: 1 }}
                      onChange={e => {
                        const rc = [...ctx.regular_clients]; rc[i] = { ...rc[i], phone: e.target.value }; updateCtx({ regular_clients: rc })
                      }} />
                    <input value={c.service} placeholder="Type d'intervention" style={{ ...input, flex: 1 }}
                      onChange={e => {
                        const rc = [...ctx.regular_clients]; rc[i] = { ...rc[i], service: e.target.value }; updateCtx({ regular_clients: rc })
                      }} />
                  </div>
                </div>
              ))}
              <AddBtn onClick={() => updateCtx({ regular_clients: [...ctx.regular_clients, { name: '', phone: '', service: '' }] })}
                label="Ajouter un client" />
            </div>
          </Section>

          {/* SECTION 6 — FAQ */}
          <Section index={6} title="Questions fréquentes & Réponses" icon="❓" badge="orange" badgeText="RECOMMANDÉ"
            isConfigured={isConfigured[6]} isOpen={openSection === 6} onToggle={() => setOpenSection(openSection === 6 ? null : 6)}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <p style={{ fontSize: 12, color: MUTED, margin: 0 }}>Mia utilisera ces réponses exactes quand un client pose ces questions.</p>
              {ctx.faq.map((f, i) => (
                <div key={i} style={{ background: '#F9FAFB', border: `1px solid ${BORDER}`, borderRadius: 10, padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: 8 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontSize: 12, fontWeight: 700, color: MUTED }}>Question {i + 1}</span>
                    <RemoveBtn onClick={() => updateCtx({ faq: ctx.faq.filter((_, j) => j !== i) })} />
                  </div>
                  <input value={f.question} placeholder="Question client" style={input}
                    onChange={e => { const faq = [...ctx.faq]; faq[i] = { ...faq[i], question: e.target.value }; updateCtx({ faq }) }} />
                  <textarea value={f.answer} placeholder="Réponse exacte de Mia" style={{ ...textarea, minHeight: 56 }}
                    onChange={e => { const faq = [...ctx.faq]; faq[i] = { ...faq[i], answer: e.target.value }; updateCtx({ faq }) }} />
                </div>
              ))}
              <AddBtn onClick={() => updateCtx({ faq: [...ctx.faq, { question: '', answer: '' }] })}
                label="Ajouter une question" />
            </div>
          </Section>

          {/* SECTION 7 — Ton & Personnalité */}
          <Section index={7} title="Ton & Personnalité souhaitée" icon="🎭" badge="orange" badgeText="RECOMMANDÉ"
            isConfigured={isConfigured[7]} isOpen={openSection === 7} onToggle={() => setOpenSection(openSection === 7 ? null : 7)}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div>
                <label style={label}>Vouvoiement ou Tutoiement</label>
                <div style={{ display: 'flex', gap: 8 }}>
                  {[{ v: false, l: 'Vouvoiement' }, { v: true, l: 'Tutoiement' }].map(({ v, l }) => (
                    <button key={l} type="button" onClick={() => updateCtx({ tone: { ...ctx.tone, tutoiement: v } })}
                      style={{
                        flex: 1, padding: '9px', borderRadius: 8, border: 'none', cursor: 'pointer',
                        fontSize: 13, fontWeight: 600,
                        background: ctx.tone.tutoiement === v ? BRAND : '#F3F4F6',
                        color: ctx.tone.tutoiement === v ? '#fff' : TEXT,
                      }}>
                      {l}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <label style={label}>Ton général</label>
                <select value={ctx.tone.style} onChange={e => updateCtx({ tone: { ...ctx.tone, style: e.target.value } })}
                  style={{ ...input, appearance: 'none', cursor: 'pointer' }}>
                  {['Professionnel et chaleureux','Direct et efficace','Rassurant et patient','Haut de gamme et élégant'].map(v => (
                    <option key={v} value={v}>{v}</option>
                  ))}
                </select>
              </div>
              <div>
                <label style={label}>Instructions supplémentaires (optionnel)</label>
                <textarea value={ctx.tone.instructions} placeholder="Ex: Ne jamais parler de prix sans avoir qualifié le problème."
                  onChange={e => updateCtx({ tone: { ...ctx.tone, instructions: e.target.value } })}
                  style={textarea} />
              </div>
            </div>
          </Section>

          {/* SECTION 8 — Fournisseurs */}
          <Section index={8} title="Fournisseurs" icon="🏭" badge="gray" badgeText="OPTIONNEL"
            isConfigured={isConfigured[8]} isOpen={openSection === 8} onToggle={() => setOpenSection(openSection === 8 ? null : 8)}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <p style={{ fontSize: 12, color: MUTED, margin: 0 }}>Si un fournisseur appelle, Mia sait qui c'est et le traite en conséquence.</p>
              {ctx.suppliers.map((s, i) => (
                <div key={i} style={{ background: '#F9FAFB', border: `1px solid ${BORDER}`, borderRadius: 10, padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: 8 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontSize: 12, fontWeight: 700, color: MUTED }}>Fournisseur {i + 1}</span>
                    <RemoveBtn onClick={() => updateCtx({ suppliers: ctx.suppliers.filter((_, j) => j !== i) })} />
                  </div>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <input value={s.name} placeholder="Nom" style={{ ...input, flex: 1 }}
                      onChange={e => { const sp = [...ctx.suppliers]; sp[i] = { ...sp[i], name: e.target.value }; updateCtx({ suppliers: sp }) }} />
                    <select value={s.type} style={{ ...input, flex: 1, appearance: 'none' }}
                      onChange={e => { const sp = [...ctx.suppliers]; sp[i] = { ...sp[i], type: e.target.value }; updateCtx({ suppliers: sp }) }}>
                      {['Matériel','Pièces','Outillage','Autre'].map(v => <option key={v}>{v}</option>)}
                    </select>
                  </div>
                  <input value={s.note} placeholder="Note éventuelle" style={input}
                    onChange={e => { const sp = [...ctx.suppliers]; sp[i] = { ...sp[i], note: e.target.value }; updateCtx({ suppliers: sp }) }} />
                </div>
              ))}
              <AddBtn onClick={() => updateCtx({ suppliers: [...ctx.suppliers, { name: '', type: 'Matériel', note: '' }] })}
                label="Ajouter un fournisseur" />
            </div>
          </Section>

          {/* SECTION 9 — Zones d'intervention */}
          <Section index={9} title="Zones d'intervention" icon="📍" badge="gray" badgeText="OPTIONNEL"
            isConfigured={isConfigured[9]} isOpen={openSection === 9} onToggle={() => setOpenSection(openSection === 9 ? null : 9)}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div>
                <label style={label}>Zones couvertes (villes ou départements)</label>
                <TagInput tags={ctx.zones.included} onChange={tags => updateCtx({ zones: { ...ctx.zones, included: tags } })} />
              </div>
              <div>
                <label style={label}>Zones exclues</label>
                <TagInput tags={ctx.zones.excluded} onChange={tags => updateCtx({ zones: { ...ctx.zones, excluded: tags } })} />
              </div>
              <div>
                <label style={label}>Délais ou infos par zone</label>
                <textarea value={ctx.zones.notes} placeholder="Ex: Paris intra-muros : même jour. Banlieue : 24h."
                  onChange={e => updateCtx({ zones: { ...ctx.zones, notes: e.target.value } })}
                  style={textarea} />
              </div>
            </div>
          </Section>

          {/* SECTION 10 — Liste noire */}
          <Section index={10} title="Contacts à ne pas passer" icon="🚫" badge="gray" badgeText="OPTIONNEL"
            isConfigured={isConfigured[10]} isOpen={openSection === 10} onToggle={() => setOpenSection(openSection === 10 ? null : 10)}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <p style={{ fontSize: 12, color: MUTED, margin: 0 }}>Si cette personne appelle, Mia dit que tu n'es pas disponible.</p>
              {ctx.blacklist.map((b, i) => (
                <div key={i} style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  <input value={b.name} placeholder="Nom" style={{ ...input, flex: 1 }}
                    onChange={e => { const bl = [...ctx.blacklist]; bl[i] = { ...bl[i], name: e.target.value }; updateCtx({ blacklist: bl }) }} />
                  <input value={b.phone} placeholder="Téléphone" style={{ ...input, flex: 1 }}
                    onChange={e => { const bl = [...ctx.blacklist]; bl[i] = { ...bl[i], phone: e.target.value }; updateCtx({ blacklist: bl }) }} />
                  <RemoveBtn onClick={() => updateCtx({ blacklist: ctx.blacklist.filter((_, j) => j !== i) })} />
                </div>
              ))}
              <AddBtn onClick={() => updateCtx({ blacklist: [...ctx.blacklist, { name: '', phone: '' }] })}
                label="Ajouter un contact" />
            </div>
          </Section>

          {/* SECTION 11 — Concurrents */}
          <Section index={11} title="Concurrents à ne pas mentionner" icon="🔇" badge="gray" badgeText="OPTIONNEL"
            isConfigured={isConfigured[11]} isOpen={openSection === 11} onToggle={() => setOpenSection(openSection === 11 ? null : 11)}>
            <div>
              <p style={{ fontSize: 12, color: MUTED, marginBottom: 10 }}>Mia ne citera jamais ces noms et ne commentera pas.</p>
              <textarea value={ctx.competitors} placeholder="Un nom par ligne ou séparés par des virgules"
                onChange={e => updateCtx({ competitors: e.target.value })}
                style={textarea} />
            </div>
          </Section>

          {/* SECTION 12 — Situations difficiles */}
          <Section index={12} title="Gestion des situations difficiles" icon="⚡" badge="gray" badgeText="OPTIONNEL"
            isConfigured={isConfigured[12]} isOpen={openSection === 12} onToggle={() => setOpenSection(openSection === 12 ? null : 12)}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              {[
                { key: 'aggressive' as const, label: 'Client agressif ou impoli' },
                { key: 'complaint'  as const, label: 'Réclamation ou remboursement demandé' },
                { key: 'threat'     as const, label: 'Menace d\'avis négatif' },
              ].map(({ key, label: lbl }) => (
                <div key={key}>
                  <label style={label}>{lbl}</label>
                  <textarea
                    value={ctx.difficult_situations[key]}
                    placeholder="Comment Mia doit répondre dans ce cas..."
                    onChange={e => updateCtx({ difficult_situations: { ...ctx.difficult_situations, [key]: e.target.value } })}
                    style={textarea}
                  />
                </div>
              ))}
            </div>
          </Section>

          {/* SECTION 13 — Objectifs commerciaux */}
          <Section index={13} title="Objectifs commerciaux" icon="🎯" badge="gray" badgeText="OPTIONNEL"
            isConfigured={isConfigured[13]} isOpen={openSection === 13} onToggle={() => setOpenSection(openSection === 13 ? null : 13)}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div>
                <label style={label}>Interventions à privilégier</label>
                <TagInput tags={ctx.commercial_goals.priority}
                  onChange={tags => updateCtx({ commercial_goals: { ...ctx.commercial_goals, priority: tags } })} />
              </div>
              <div>
                <label style={label}>Interventions à refuser</label>
                <TagInput tags={ctx.commercial_goals.refuse}
                  onChange={tags => updateCtx({ commercial_goals: { ...ctx.commercial_goals, refuse: tags } })} />
              </div>
              <div>
                <label style={label}>Instructions commerciales supplémentaires</label>
                <textarea value={ctx.commercial_goals.instructions}
                  placeholder="Ex: Toujours proposer un contrat d'entretien annuel."
                  onChange={e => updateCtx({ commercial_goals: { ...ctx.commercial_goals, instructions: e.target.value } })}
                  style={textarea} />
              </div>
            </div>
          </Section>

          {/* SECTION 14 — Informations spéciales */}
          <Section index={14} title="Informations spéciales" icon="📝" badge="gray" badgeText="OPTIONNEL"
            isConfigured={isConfigured[14]} isOpen={openSection === 14} onToggle={() => setOpenSection(openSection === 14 ? null : 14)}>
            <div>
              <p style={{ fontSize: 12, color: MUTED, marginBottom: 10 }}>Tout ce qui ne rentre pas dans les autres sections.</p>
              <textarea value={ctx.special_info}
                placeholder="Ex: On ne travaille pas le mercredi matin. Notre fournisseur principal est Rexel."
                onChange={e => updateCtx({ special_info: e.target.value })}
                style={{ ...textarea, minHeight: 120 }} />
            </div>
          </Section>

        </div>

        {/* ── Bouton sauvegarde ── */}
        <div style={{ marginTop: 28 }}>
          {!canSave && (
            <div style={{
              background: 'rgba(245,158,11,0.08)', border: `1px solid rgba(245,158,11,0.3)`,
              borderRadius: 10, padding: '12px 16px', marginBottom: 14,
            }}>
              <p style={{ fontSize: 13, color: '#D97706', fontWeight: 600, margin: 0 }}>
                ⚠️ Remplis tes horaires (Section 1) et au moins une prestation (Section 2) pour que Mia puisse travailler correctement pour toi.
              </p>
            </div>
          )}

          {saveError && (
            <p style={{ fontSize: 13, color: '#EF4444', background: 'rgba(239,68,68,0.08)', borderRadius: 8, padding: '10px 14px', marginBottom: 12 }}>
              {saveError}
            </p>
          )}

          {saved && (
            <div style={{
              background: 'rgba(5,150,105,0.09)', border: `1px solid rgba(5,150,105,0.25)`,
              borderRadius: 10, padding: '12px 16px', marginBottom: 14, textAlign: 'center',
            }}>
              <p style={{ fontSize: 14, color: '#059669', fontWeight: 700, margin: 0 }}>
                ✅ Mia connaît maintenant ton activité — redirection…
              </p>
            </div>
          )}

          <button
            onClick={handleSave}
            disabled={!canSave || saving || saved}
            style={{
              width: '100%', padding: '16px', borderRadius: 10, border: 'none',
              background: canSave ? BRAND : '#D1D5DB',
              color: '#fff', fontWeight: 800, fontSize: 15, cursor: canSave ? 'pointer' : 'not-allowed',
              boxShadow: canSave ? '0 4px 16px rgba(59,91,250,0.3)' : 'none',
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
            }}
          >
            {saving && <div style={{ width: 16, height: 16, border: '2px solid #fff', borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />}
            {fromOnboarding
              ? 'Terminer la configuration et accéder au dashboard →'
              : 'Sauvegarder les modifications'}
          </button>
        </div>

        <style>{`
          @keyframes spin { to { transform: rotate(360deg); } }
        `}</style>
      </div>
    </div>
  )
}
