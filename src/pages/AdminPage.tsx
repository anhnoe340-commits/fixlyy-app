import { useState, useEffect } from 'react'
import { useAuth } from '@/contexts/AuthContext'
import { supabase } from '@/lib/supabase'

const ADMIN_USER_ID = 'e537e7ab-5f0e-489f-8acc-7faae4dbe0d7'

// ── Types ─────────────────────────────────────────────────────────────────────

interface CriticalAlert {
  id: string; created_at: string; alert_type: string
  severity: string; message: string; user_id: string | null; resolved: boolean | null
}
interface KeyRotation {
  id: string; service_name: string; key_name: string
  last_rotated_at: string | null; next_rotation_at: string | null; notes: string | null
}
interface AdminTask {
  id: string; title: string; description: string | null
  priority: 'critical' | 'high' | 'medium' | 'low'
  status: 'todo' | 'in_progress' | 'done'
  due_date: string | null; created_at: string
}
interface ArtisanProfile {
  id: string; full_name: string | null; phone: string | null; company_name: string | null
  company_type: string | null; created_at: string; subscription_plan: string | null
  subscription_status: string | null; twilio_number: string | null; vapi_assistant_id: string | null
  vapi_enabled: boolean | null
}
interface SubInfo { stripe_customer_id: string | null; stripe_subscription_id: string | null; current_period_end: string | null }
interface ArtisanCall { id: string; created_at: string; caller_name: string | null; caller_phone: string | null; status: string | null; duration_seconds: number | null }

// ── Services statiques ────────────────────────────────────────────────────────

const SERVICES = [
  { name: 'Supabase', role: 'DB + Auth + Edge Functions', billing: 'Mensuel ~25$/mois', dashboard: 'https://supabase.com/dashboard/project/hxkpmmekaotwmzgqxafp', criticality: 'critical' as const, keyName: 'FIXLYY_SERVICE_ROLE_KEY' },
  { name: 'Vapi AI', role: 'Assistante vocale Mia', billing: 'À l\'usage ~0.05-0.15$/min', dashboard: 'https://dashboard.vapi.ai', criticality: 'critical' as const, keyName: 'VAPI_API_KEY' },
  { name: 'Twilio', role: 'Numéros FR + SMS', billing: '~1€/numéro/mois + 0.08€/SMS', dashboard: 'https://console.twilio.com', criticality: 'critical' as const, keyName: 'TWILIO_AUTH_TOKEN' },
  { name: 'Stripe', role: 'Paiements + Abonnements', billing: '1.4% + 25¢/transaction EU', dashboard: 'https://dashboard.stripe.com', criticality: 'critical' as const, keyName: 'STRIPE_SECRET_KEY' },
  { name: 'ElevenLabs', role: 'Voix de Mia (TTS)', billing: 'À l\'usage (caractères)', dashboard: 'https://elevenlabs.io', criticality: 'important' as const, keyName: 'ELEVEN_API_KEY' },
  { name: 'Anthropic', role: 'Bot SMS RDV', billing: 'À l\'usage (tokens)', dashboard: 'https://console.anthropic.com', criticality: 'important' as const, keyName: 'ANTHROPIC_API_KEY' },
  { name: 'Vercel', role: 'Hébergement app.fixlyy.fr', billing: 'Mensuel ~20$/mois', dashboard: 'https://vercel.com/dashboard', criticality: 'important' as const, keyName: null },
  { name: 'Resend', role: 'Emails transactionnels', billing: 'Freemium (100/jour gratuit)', dashboard: 'https://resend.com', criticality: 'secondary' as const, keyName: 'RESEND_API_KEY' },
  { name: 'Google Calendar', role: 'Intégration agenda artisans', billing: 'Gratuit', dashboard: 'https://console.cloud.google.com', criticality: 'secondary' as const, keyName: 'GOOGLE_CLIENT_SECRET' },
]

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmt(iso: string) {
  const d = new Date(iso)
  return `${d.getDate().toString().padStart(2,'0')}/${(d.getMonth()+1).toString().padStart(2,'0')}/${d.getFullYear()} ${d.getHours().toString().padStart(2,'0')}:${d.getMinutes().toString().padStart(2,'0')}`
}
function fmtDate(iso: string | null) {
  if (!iso) return '—'
  const d = new Date(iso)
  return `${d.getDate().toString().padStart(2,'0')}/${(d.getMonth()+1).toString().padStart(2,'0')}/${d.getFullYear()}`
}

function severityBadge(s: string) {
  if (s === 'critical') return 'bg-red-500/20 text-red-400 border border-red-500/30'
  if (s === 'high')     return 'bg-orange-500/20 text-orange-400 border border-orange-500/30'
  return 'bg-blue-500/20 text-blue-400 border border-blue-500/30'
}

function rotationBadge(next: string | null): { cls: string; label: string } {
  if (!next) return { cls: 'bg-gray-100 text-gray-400 border border-gray-200', label: 'Non planifié' }
  const days = Math.ceil((new Date(next).getTime() - Date.now()) / 86400000)
  if (days < 0)  return { cls: 'bg-red-50 text-red-600 border border-red-200', label: `Expiré (${Math.abs(days)}j)` }
  if (days <= 30) return { cls: 'bg-orange-50 text-orange-600 border border-orange-200', label: `Dans ${days}j` }
  return { cls: 'bg-emerald-50 text-emerald-600 border border-emerald-200', label: `Dans ${days}j` }
}

function priorityBadge(p: string) {
  if (p === 'critical') return 'bg-red-500/20 text-red-400 border border-red-500/30'
  if (p === 'high')     return 'bg-orange-500/20 text-orange-400 border border-orange-500/30'
  if (p === 'medium')   return 'bg-yellow-500/20 text-yellow-500 border border-yellow-500/30'
  return 'bg-slate-500/20 text-slate-400 border border-slate-500/30'
}

function criticalityConfig(c: string) {
  if (c === 'critical')  return { dot: '🔴', label: 'Critique', cls: 'bg-red-500/15 text-red-400 border border-red-500/20' }
  if (c === 'important') return { dot: '🟠', label: 'Important', cls: 'bg-orange-500/15 text-orange-400 border border-orange-500/20' }
  return { dot: '🟡', label: 'Secondaire', cls: 'bg-yellow-500/15 text-yellow-500 border border-yellow-500/20' }
}

// ── Composant principal ───────────────────────────────────────────────────────

export default function AdminPage() {
  const { user, loading: authLoading } = useAuth()

  // Données existantes
  const [alerts, setAlerts] = useState<CriticalAlert[]>([])
  const [metrics, setMetrics] = useState({ totalArtisans: 0, actifs: 0, appels: 0, essais: 0 })
  const [recentProfiles, setRecentProfiles] = useState<any[]>([])
  const [poolStats, setPoolStats] = useState({ total: 0, disponibles: 0, assignes: 0 })
  const [dataLoading, setDataLoading] = useState(true)
  const [resolvingId, setResolvingId] = useState<string | null>(null)

  // Nouvelles données
  const [keyRotations, setKeyRotations] = useState<KeyRotation[]>([])
  const [tasks, setTasks] = useState<AdminTask[]>([])
  const [rotatingId, setRotatingId] = useState<string | null>(null)

  // Support artisan
  const [searchQuery, setSearchQuery] = useState('')
  const [searchLoading, setSearchLoading] = useState(false)
  const [foundProfile, setFoundProfile] = useState<ArtisanProfile | null>(null)
  const [foundSub, setFoundSub] = useState<SubInfo | null>(null)
  const [foundCalls, setFoundCalls] = useState<ArtisanCall[]>([])
  const [togglingMia, setTogglingMia] = useState(false)

  // Tâches — formulaire ajout
  const [newTaskTitle, setNewTaskTitle] = useState('')
  const [newTaskPriority, setNewTaskPriority] = useState<AdminTask['priority']>('medium')
  const [newTaskDue, setNewTaskDue] = useState('')
  const [addingTask, setAddingTask] = useState(false)

  useEffect(() => {
    if (authLoading) return
    if (!user || user.id !== ADMIN_USER_ID) window.location.href = '/'
  }, [user, authLoading])

  useEffect(() => {
    if (!user || user.id !== ADMIN_USER_ID) return
    loadAll()
  }, [user])

  async function loadAll() {
    setDataLoading(true)
    await Promise.all([
      loadAlerts(), loadMetrics(), loadRecentProfiles(), loadPoolStats(),
      loadKeyRotations(), loadTasks(),
    ])
    setDataLoading(false)
  }

  async function loadAlerts() {
    const { data } = await supabase.from('critical_alerts')
      .select('id,created_at,alert_type,severity,message,user_id,resolved')
      .order('created_at', { ascending: false }).limit(50)
    setAlerts(data ?? [])
  }

  async function loadMetrics() {
    const startOfMonth = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString()
    const [a, b, c, d] = await Promise.all([
      supabase.from('profiles').select('*', { count: 'exact', head: true }),
      supabase.from('profiles').select('*', { count: 'exact', head: true }).not('subscription_plan', 'is', null),
      supabase.from('calls').select('*', { count: 'exact', head: true }).gte('created_at', startOfMonth),
      supabase.from('profiles').select('*', { count: 'exact', head: true }).eq('subscription_status', 'trialing'),
    ])
    setMetrics({ totalArtisans: a.count ?? 0, actifs: b.count ?? 0, appels: c.count ?? 0, essais: d.count ?? 0 })
  }

  async function loadRecentProfiles() {
    const { data } = await supabase.from('profiles')
      .select('id,phone,company_name,created_at,subscription_plan,subscription_status')
      .order('created_at', { ascending: false }).limit(10)
    setRecentProfiles(data ?? [])
  }

  async function loadPoolStats() {
    const { data: d1 } = await supabase.from('phone_number_pool').select('is_assigned')
    if (d1) {
      setPoolStats({ total: d1.length, disponibles: d1.filter(r => !r.is_assigned).length, assignes: d1.filter(r => r.is_assigned).length })
      return
    }
    const { data: d2 } = await supabase.from('phone_numbers_pool').select('status')
    if (d2) setPoolStats({ total: d2.length, disponibles: d2.filter(r => r.status === 'available').length, assignes: d2.filter(r => r.status === 'assigned').length })
  }

  async function loadKeyRotations() {
    const { data } = await supabase.from('key_rotations')
      .select('*').order('next_rotation_at', { ascending: true })
    setKeyRotations(data ?? [])
  }

  async function loadTasks() {
    const { data } = await supabase.from('admin_tasks')
      .select('*').order('created_at', { ascending: false })
    setTasks(data ?? [])
  }

  async function resolveAlert(id: string) {
    setResolvingId(id)
    await supabase.from('critical_alerts').update({ resolved: true }).eq('id', id)
    setAlerts(prev => prev.map(a => a.id === id ? { ...a, resolved: true } : a))
    setResolvingId(null)
  }

  async function markKeyRotated(id: string) {
    setRotatingId(id)
    await supabase.from('key_rotations').update({
      last_rotated_at: new Date().toISOString(),
      next_rotation_at: new Date(Date.now() + 90 * 86400000).toISOString(),
    }).eq('id', id)
    await loadKeyRotations()
    setRotatingId(null)
  }

  async function searchArtisan() {
    if (!searchQuery.trim()) return
    setSearchLoading(true); setFoundProfile(null); setFoundSub(null); setFoundCalls([])
    const q = searchQuery.trim()
    const isUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(q)

    const { data: profileData } = isUUID
      ? await supabase.from('profiles').select('id,full_name,phone,company_name,company_type,created_at,subscription_plan,subscription_status,twilio_number,vapi_assistant_id,vapi_enabled').eq('id', q).maybeSingle()
      : await supabase.from('profiles').select('id,full_name,phone,company_name,company_type,created_at,subscription_plan,subscription_status,twilio_number,vapi_assistant_id,vapi_enabled').eq('phone', q).maybeSingle()

    if (profileData) {
      setFoundProfile(profileData)
      const { data: subData } = await supabase.from('subscriptions')
        .select('stripe_customer_id,stripe_subscription_id,current_period_end')
        .eq('user_id', profileData.id).maybeSingle()
      setFoundSub(subData ?? null)
      const { data: callData } = await supabase.from('calls')
        .select('id,created_at,caller_name,caller_phone,status,duration_seconds')
        .eq('artisan_id', profileData.id).order('created_at', { ascending: false }).limit(10)
      setFoundCalls(callData ?? [])
    }
    setSearchLoading(false)
  }

  async function toggleMia() {
    if (!foundProfile) return
    setTogglingMia(true)
    const next = !foundProfile.vapi_enabled
    await supabase.from('profiles').update({ vapi_enabled: next }).eq('id', foundProfile.id)
    setFoundProfile(p => p ? { ...p, vapi_enabled: next } : p)
    setTogglingMia(false)
  }

  async function addTask() {
    if (!newTaskTitle.trim()) return
    setAddingTask(true)
    const { data } = await supabase.from('admin_tasks').insert({
      title: newTaskTitle.trim(),
      priority: newTaskPriority,
      due_date: newTaskDue || null,
    }).select().single()
    if (data) setTasks(prev => [data as AdminTask, ...prev])
    setNewTaskTitle(''); setNewTaskPriority('medium'); setNewTaskDue('')
    setAddingTask(false)
  }

  async function moveTask(id: string, status: AdminTask['status']) {
    await supabase.from('admin_tasks').update({ status }).eq('id', id)
    setTasks(prev => prev.map(t => t.id === id ? { ...t, status } : t))
  }

  async function deleteTask(id: string) {
    await supabase.from('admin_tasks').delete().eq('id', id)
    setTasks(prev => prev.filter(t => t.id !== id))
  }

  if (authLoading) return (
    <div className="min-h-screen flex items-center justify-center dashboard-bg">
      <div className="w-6 h-6 border-2 border-[#2850c8] border-t-transparent rounded-full animate-spin" />
    </div>
  )
  if (!user || user.id !== ADMIN_USER_ID) return null

  const unresolvedCount = alerts.filter(a => !a.resolved).length
  const todoTasks = tasks.filter(t => t.status === 'todo')
  const inProgressTasks = tasks.filter(t => t.status === 'in_progress')
  const doneTasks = tasks.filter(t => t.status === 'done')

  return (
    <div className="dashboard-bg min-h-screen p-4 md:p-8" style={{ fontFamily: "'Inter', system-ui, sans-serif" }}>
      <div className="max-w-6xl mx-auto space-y-10">

        {/* ── Header ───────────────────────────────────────────────────────── */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-white">Admin — Fixlyy Internal</h1>
            <p className="text-[11px] text-red-400 mt-0.5 font-bold tracking-widest uppercase">Accès restreint</p>
          </div>
          <button onClick={() => window.location.href = '/'}
            className="text-sm text-slate-400 hover:text-white transition-colors px-4 py-2 rounded-xl border border-white/10 hover:border-white/20">
            ← Dashboard
          </button>
        </div>

        {/* ── KPI globaux ──────────────────────────────────────────────────── */}
        <section>
          <h2 className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-3">Métriques globales</h2>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {[
              { label: 'Total artisans', value: metrics.totalArtisans, icon: '👷' },
              { label: 'Artisans actifs', value: metrics.actifs, icon: '✅' },
              { label: 'Appels ce mois', value: metrics.appels, icon: '📞' },
              { label: 'Essais actifs', value: metrics.essais, icon: '🎁' },
            ].map(k => (
              <div key={k.label} className="glass rounded-2xl px-5 py-5">
                <div className="w-10 h-10 rounded-xl bg-[#2850c8]/10 flex items-center justify-center text-lg mb-3">{k.icon}</div>
                <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-2 mb-1">{k.label}</p>
                <p className="text-2xl font-black text-white">{dataLoading ? '…' : k.value}</p>
              </div>
            ))}
          </div>
        </section>

        {/* ── Pool téléphonique ─────────────────────────────────────────────── */}
        <section>
          <h2 className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-3">Pool téléphonique</h2>
          <div className="glass-light rounded-2xl p-5 flex flex-wrap items-center gap-8">
            {[{ label: 'Total', value: poolStats.total, color: 'text-gray-900' }, { label: 'Disponibles', value: poolStats.disponibles, color: 'text-emerald-600' }, { label: 'Assignés', value: poolStats.assignes, color: 'text-blue-600' }].map(s => (
              <div key={s.label} className="text-center">
                <p className={`text-3xl font-black ${s.color}`}>{dataLoading ? '…' : s.value}</p>
                <p className="text-xs text-gray-400 mt-1">{s.label}</p>
              </div>
            ))}
            {!dataLoading && poolStats.disponibles < 3 && (
              <span className="px-3 py-1.5 bg-red-50 border border-red-200 rounded-xl text-xs font-bold text-red-600">🚨 Pool bas — action requise</span>
            )}
          </div>
        </section>

        {/* ── Critical Alerts ───────────────────────────────────────────────── */}
        <section>
          <h2 className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-3">
            Critical Alerts
            {unresolvedCount > 0 && <span className="ml-2 px-2 py-0.5 rounded-full bg-red-500/20 text-red-400 text-[10px] normal-case font-bold">{unresolvedCount} ouvertes</span>}
          </h2>
          <div className="glass-light rounded-2xl p-5">
            {dataLoading ? <p className="text-sm text-gray-400">Chargement…</p>
              : alerts.length === 0 ? <p className="text-sm text-gray-400">Aucune alerte — ou accès RLS restreint.</p>
              : (
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead><tr className="border-b border-gray-100">{['Date','Type','Message','User','Statut',''].map(h => <th key={h} className="text-left py-2 px-3 text-gray-400 font-semibold whitespace-nowrap">{h}</th>)}</tr></thead>
                    <tbody>
                      {alerts.map(a => (
                        <tr key={a.id} className="border-b border-gray-50 hover:bg-gray-50/60">
                          <td className="py-2 px-3 text-gray-500 whitespace-nowrap">{fmt(a.created_at)}</td>
                          <td className="py-2 px-3"><span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${severityBadge(a.severity)}`}>{a.alert_type}</span></td>
                          <td className="py-2 px-3 text-gray-700 max-w-xs truncate">{a.message}</td>
                          <td className="py-2 px-3 text-gray-400 font-mono">{a.user_id?.slice(0,8) ?? '—'}</td>
                          <td className="py-2 px-3">{a.resolved ? <span className="px-2 py-0.5 rounded-full bg-emerald-50 border border-emerald-200 text-[10px] font-bold text-emerald-600">Résolu</span> : <span className="px-2 py-0.5 rounded-full bg-red-50 border border-red-200 text-[10px] font-bold text-red-600">Ouvert</span>}</td>
                          <td className="py-2 px-3">{!a.resolved && <button onClick={() => resolveAlert(a.id)} disabled={resolvingId === a.id} className="text-[10px] font-semibold text-[#2850c8] hover:underline disabled:opacity-40">{resolvingId === a.id ? '…' : 'Résoudre'}</button>}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
          </div>
        </section>

        {/* ── 🔧 Infrastructure & Abonnements ──────────────────────────────── */}
        <section>
          <h2 className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-3">🔧 Infrastructure & Abonnements</h2>
          {(['critical', 'important', 'secondary'] as const).map(level => {
            const filtered = SERVICES.filter(s => s.criticality === level)
            const { dot, label } = criticalityConfig(level)
            return (
              <div key={level} className="mb-5">
                <p className="text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-2">{dot} {label}</p>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                  {filtered.map(s => {
                    const cc = criticalityConfig(s.criticality)
                    return (
                      <div key={s.name} className="glass-light rounded-2xl p-4 flex flex-col gap-2">
                        <div className="flex items-start justify-between gap-2">
                          <div>
                            <p className="text-sm font-bold text-gray-900">{s.name}</p>
                            <p className="text-xs text-gray-500 mt-0.5">{s.role}</p>
                          </div>
                          <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold flex-shrink-0 ${cc.cls}`}>{cc.label}</span>
                        </div>
                        <p className="text-[11px] text-gray-400">{s.billing}</p>
                        {s.keyName && (
                          <span className="font-mono text-[10px] bg-gray-100 text-gray-500 px-2 py-1 rounded-lg w-fit">{s.keyName}</span>
                        )}
                        <a href={s.dashboard} target="_blank" rel="noopener noreferrer"
                          className="text-[11px] font-semibold text-[#2850c8] hover:underline mt-1 flex items-center gap-1">
                          Ouvrir dashboard →
                        </a>
                      </div>
                    )
                  })}
                </div>
              </div>
            )
          })}
        </section>

        {/* ── 🔑 Renouvellement des clés API ───────────────────────────────── */}
        <section>
          <h2 className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-3">🔑 Renouvellement des clés API</h2>
          <div className="glass-light rounded-2xl p-5">
            {keyRotations.length === 0
              ? <p className="text-sm text-gray-400">Aucune clé enregistrée.</p>
              : (
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead><tr className="border-b border-gray-100">{['Service','Clé','Dernière rotation','Prochaine rotation','Statut',''].map(h => <th key={h} className="text-left py-2 px-3 text-gray-400 font-semibold whitespace-nowrap">{h}</th>)}</tr></thead>
                    <tbody>
                      {keyRotations.map(k => {
                        const badge = rotationBadge(k.next_rotation_at)
                        return (
                          <tr key={k.id} className="border-b border-gray-50 hover:bg-gray-50/60">
                            <td className="py-2 px-3 font-semibold text-gray-800">{k.service_name}</td>
                            <td className="py-2 px-3 font-mono text-gray-500 text-[10px]">{k.key_name}</td>
                            <td className="py-2 px-3 text-gray-400">{fmtDate(k.last_rotated_at)}</td>
                            <td className="py-2 px-3 text-gray-400">{fmtDate(k.next_rotation_at)}</td>
                            <td className="py-2 px-3"><span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${badge.cls}`}>{badge.label}</span></td>
                            <td className="py-2 px-3">
                              <button onClick={() => markKeyRotated(k.id)} disabled={rotatingId === k.id}
                                className="text-[10px] font-semibold text-[#2850c8] hover:underline disabled:opacity-40 whitespace-nowrap">
                                {rotatingId === k.id ? '…' : 'Marquer renouvelée'}
                              </button>
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              )}
          </div>
        </section>

        {/* ── 👤 Support Artisan ────────────────────────────────────────────── */}
        <section>
          <h2 className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-3">👤 Support Artisan</h2>
          <div className="glass-light rounded-2xl p-5">
            <div className="flex gap-3 mb-5">
              <input
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && searchArtisan()}
                placeholder="UUID artisan ou téléphone (+33…)"
                className="flex-1 border border-gray-200 rounded-xl px-4 py-2.5 text-sm outline-none focus:border-[#2850c8] transition-colors font-mono"
              />
              <button onClick={searchArtisan} disabled={searchLoading || !searchQuery.trim()}
                className="px-4 py-2.5 rounded-xl text-sm font-semibold text-white disabled:opacity-40 transition-all"
                style={{ background: 'linear-gradient(135deg, #2850c8, #4070e8)' }}>
                {searchLoading ? '…' : 'Rechercher'}
              </button>
            </div>

            {foundProfile && (
              <div className="space-y-4">
                {/* Fiche artisan */}
                <div className="grid md:grid-cols-2 gap-4">
                  <div className="bg-gray-50 rounded-xl p-4 space-y-2">
                    <p className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-3">Profil</p>
                    {[
                      ['Nom', foundProfile.full_name],
                      ['Téléphone', foundProfile.phone],
                      ['Entreprise', foundProfile.company_name],
                      ['Métier', foundProfile.company_type],
                      ['Inscrit le', fmtDate(foundProfile.created_at)],
                      ['Plan', foundProfile.subscription_plan],
                      ['Statut', foundProfile.subscription_status],
                      ['Numéro Twilio', foundProfile.twilio_number],
                      ['Vapi ID', foundProfile.vapi_assistant_id?.slice(0,16) + '…'],
                    ].map(([label, value]) => (
                      <div key={label as string} className="flex items-center gap-2">
                        <span className="text-[11px] text-gray-400 w-28 flex-shrink-0">{label}</span>
                        <span className="text-xs font-medium text-gray-800 font-mono">{(value as string) || '—'}</span>
                      </div>
                    ))}
                    <div className="flex items-center gap-2 pt-1">
                      <span className="text-[11px] text-gray-400 w-28 flex-shrink-0">Mia active</span>
                      <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${foundProfile.vapi_enabled ? 'bg-emerald-50 text-emerald-600 border border-emerald-200' : 'bg-red-50 text-red-600 border border-red-200'}`}>
                        {foundProfile.vapi_enabled ? 'Oui' : 'Non'}
                      </span>
                    </div>
                  </div>

                  <div className="space-y-3">
                    {/* Abonnement Stripe */}
                    {foundSub && (
                      <div className="bg-gray-50 rounded-xl p-4">
                        <p className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">Abonnement</p>
                        {[
                          ['Customer ID', foundSub.stripe_customer_id?.slice(0,14) + '…'],
                          ['Sub ID', foundSub.stripe_subscription_id?.slice(0,14) + '…'],
                          ['Fin de période', fmtDate(foundSub.current_period_end)],
                        ].map(([l, v]) => (
                          <div key={l as string} className="flex items-center gap-2 mb-1">
                            <span className="text-[11px] text-gray-400 w-24 flex-shrink-0">{l}</span>
                            <span className="text-xs font-mono text-gray-700">{(v as string) || '—'}</span>
                          </div>
                        ))}
                      </div>
                    )}

                    {/* Actions rapides */}
                    <div className="bg-gray-50 rounded-xl p-4 flex flex-col gap-2">
                      <p className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-1">Actions rapides</p>
                      <button onClick={toggleMia} disabled={togglingMia}
                        className={`text-xs font-semibold px-3 py-2 rounded-lg transition-all ${foundProfile.vapi_enabled ? 'bg-red-50 text-red-600 hover:bg-red-100' : 'bg-emerald-50 text-emerald-600 hover:bg-emerald-100'} disabled:opacity-40`}>
                        {togglingMia ? '…' : (foundProfile.vapi_enabled ? '🔇 Désactiver Mia' : '🎙️ Activer Mia')}
                      </button>
                      {foundSub?.stripe_customer_id && (
                        <a href={`https://dashboard.stripe.com/customers/${foundSub.stripe_customer_id}`} target="_blank" rel="noopener noreferrer"
                          className="text-xs font-semibold px-3 py-2 rounded-lg bg-indigo-50 text-indigo-600 hover:bg-indigo-100 transition-all text-center">
                          Voir dans Stripe →
                        </a>
                      )}
                      {foundProfile.vapi_assistant_id && (
                        <a href={`https://dashboard.vapi.ai/assistants/${foundProfile.vapi_assistant_id}`} target="_blank" rel="noopener noreferrer"
                          className="text-xs font-semibold px-3 py-2 rounded-lg bg-blue-50 text-blue-600 hover:bg-blue-100 transition-all text-center">
                          Voir dans Vapi →
                        </a>
                      )}
                    </div>
                  </div>
                </div>

                {/* Derniers appels */}
                {foundCalls.length > 0 && (
                  <div>
                    <p className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">10 derniers appels</p>
                    <div className="overflow-x-auto">
                      <table className="w-full text-xs">
                        <thead><tr className="border-b border-gray-100">{['Date','Appelant','Téléphone','Statut','Durée'].map(h => <th key={h} className="text-left py-2 px-3 text-gray-400 font-semibold">{h}</th>)}</tr></thead>
                        <tbody>
                          {foundCalls.map(c => (
                            <tr key={c.id} className="border-b border-gray-50 hover:bg-gray-50/60">
                              <td className="py-2 px-3 text-gray-400 whitespace-nowrap">{fmt(c.created_at)}</td>
                              <td className="py-2 px-3 text-gray-700">{c.caller_name || '—'}</td>
                              <td className="py-2 px-3 text-gray-500 font-mono">{c.caller_phone || '—'}</td>
                              <td className="py-2 px-3"><span className="px-2 py-0.5 rounded-full bg-gray-100 text-gray-600 text-[10px] font-semibold">{c.status || '—'}</span></td>
                              <td className="py-2 px-3 text-gray-400">{c.duration_seconds != null ? `${c.duration_seconds}s` : '—'}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </section>

        {/* ── Derniers inscrits ─────────────────────────────────────────────── */}
        <section>
          <h2 className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-3">Derniers inscrits</h2>
          <div className="glass-light rounded-2xl p-5">
            {dataLoading ? <p className="text-sm text-gray-400">Chargement…</p>
              : recentProfiles.length === 0 ? <p className="text-sm text-gray-400">Aucun profil — ou accès RLS restreint.</p>
              : (
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead><tr className="border-b border-gray-100">{['Entreprise','Téléphone','Inscrit le','Plan','Statut'].map(h => <th key={h} className="text-left py-2 px-3 text-gray-400 font-semibold">{h}</th>)}</tr></thead>
                    <tbody>
                      {recentProfiles.map(p => (
                        <tr key={p.id} className="border-b border-gray-50 hover:bg-gray-50/60">
                          <td className="py-2 px-3 font-semibold text-gray-800">{p.company_name || '—'}</td>
                          <td className="py-2 px-3 text-gray-500 font-mono">{p.phone || '—'}</td>
                          <td className="py-2 px-3 text-gray-400 whitespace-nowrap">{fmtDate(p.created_at)}</td>
                          <td className="py-2 px-3"><span className="px-2 py-0.5 rounded-full bg-[#2850c8]/10 text-[#2850c8] text-[10px] font-bold">{p.subscription_plan || 'essai'}</span></td>
                          <td className="py-2 px-3">
                            <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold border ${p.subscription_status === 'active' ? 'bg-emerald-50 text-emerald-600 border-emerald-200' : p.subscription_status === 'trialing' ? 'bg-blue-50 text-blue-600 border-blue-200' : 'bg-gray-50 text-gray-500 border-gray-200'}`}>{p.subscription_status || 'essai'}</span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
          </div>
        </section>

        {/* ── ✅ Tâches Admin (Kanban) ──────────────────────────────────────── */}
        <section>
          <h2 className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-3">✅ Tâches Admin</h2>

          {/* Formulaire ajout */}
          <div className="glass-light rounded-2xl p-4 mb-4 flex flex-wrap gap-3 items-end">
            <div className="flex-1 min-w-[200px]">
              <label className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider block mb-1">Titre</label>
              <input value={newTaskTitle} onChange={e => setNewTaskTitle(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && addTask()}
                placeholder="Nouvelle tâche…"
                className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm outline-none focus:border-[#2850c8] transition-colors" />
            </div>
            <div>
              <label className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider block mb-1">Priorité</label>
              <select value={newTaskPriority} onChange={e => setNewTaskPriority(e.target.value as AdminTask['priority'])}
                className="border border-gray-200 rounded-xl px-3 py-2.5 text-sm outline-none focus:border-[#2850c8] bg-white appearance-none">
                <option value="critical">🔴 Critique</option>
                <option value="high">🟠 Haute</option>
                <option value="medium">🟡 Moyenne</option>
                <option value="low">⚪ Basse</option>
              </select>
            </div>
            <div>
              <label className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider block mb-1">Échéance</label>
              <input type="date" value={newTaskDue} onChange={e => setNewTaskDue(e.target.value)}
                className="border border-gray-200 rounded-xl px-3 py-2.5 text-sm outline-none focus:border-[#2850c8] transition-colors bg-white" />
            </div>
            <button onClick={addTask} disabled={addingTask || !newTaskTitle.trim()}
              className="px-4 py-2.5 rounded-xl text-sm font-semibold text-white disabled:opacity-40 transition-all"
              style={{ background: 'linear-gradient(135deg, #2850c8, #4070e8)' }}>
              {addingTask ? '…' : 'Ajouter'}
            </button>
          </div>

          {/* Kanban 3 colonnes */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {([
              { key: 'todo' as const, label: 'Todo', items: todoTasks, nextStatus: 'in_progress' as const, nextLabel: '→ En cours' },
              { key: 'in_progress' as const, label: 'En cours', items: inProgressTasks, nextStatus: 'done' as const, nextLabel: '→ Fait', prevStatus: 'todo' as const, prevLabel: '← Todo' },
              { key: 'done' as const, label: 'Fait ✓', items: doneTasks, prevStatus: 'in_progress' as const, prevLabel: '← En cours' },
            ]).map(col => (
              <div key={col.key} className="glass-light rounded-2xl p-4">
                <div className="flex items-center justify-between mb-3">
                  <p className="text-xs font-bold text-gray-700 uppercase tracking-wider">{col.label}</p>
                  <span className="text-[10px] text-gray-400 font-semibold">{col.items.length}</span>
                </div>
                <div className="space-y-2.5">
                  {col.items.map(task => {
                    const isOverdue = task.due_date && new Date(task.due_date) < new Date()
                    return (
                      <div key={task.id} className="bg-white border border-gray-100 rounded-xl p-3 shadow-sm">
                        <div className="flex items-start justify-between gap-2 mb-1.5">
                          <p className="text-xs font-semibold text-gray-800 leading-tight flex-1">{task.title}</p>
                          <span className={`px-1.5 py-0.5 rounded-full text-[9px] font-bold flex-shrink-0 ${priorityBadge(task.priority)}`}>{task.priority}</span>
                        </div>
                        {task.description && <p className="text-[11px] text-gray-500 mb-1.5 line-clamp-2">{task.description}</p>}
                        {task.due_date && (
                          <p className={`text-[10px] font-semibold mb-2 ${isOverdue ? 'text-red-500' : 'text-gray-400'}`}>
                            {isOverdue ? '⚠️ ' : ''}Échéance : {fmtDate(task.due_date)}
                          </p>
                        )}
                        <div className="flex gap-1.5 flex-wrap">
                          {col.nextStatus && (
                            <button onClick={() => moveTask(task.id, col.nextStatus!)}
                              className="text-[10px] font-semibold text-[#2850c8] hover:underline">{col.nextLabel}</button>
                          )}
                          {col.prevStatus && (
                            <button onClick={() => moveTask(task.id, col.prevStatus!)}
                              className="text-[10px] font-semibold text-gray-400 hover:underline">{col.prevLabel}</button>
                          )}
                          <button onClick={() => deleteTask(task.id)}
                            className="text-[10px] font-semibold text-red-400 hover:underline ml-auto">Suppr.</button>
                        </div>
                      </div>
                    )
                  })}
                  {col.items.length === 0 && <p className="text-[11px] text-gray-300 text-center py-3">Vide</p>}
                </div>
              </div>
            ))}
          </div>
        </section>

      </div>
    </div>
  )
}
