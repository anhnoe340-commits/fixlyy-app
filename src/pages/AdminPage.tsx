import { useState, useEffect, useCallback } from 'react'
import { useAuth } from '@/contexts/AuthContext'
import { supabase } from '@/lib/supabase'

const ADMIN_EMAIL = 'fixlyy@fixlyy.fr'

// ── Types ─────────────────────────────────────────────────────────────────────

interface CriticalAlert { id: string; created_at: string; alert_type: string; severity: string; message: string; meta: Record<string, any> | null; resolved_at: string | null }
interface KeyRotation { id: string; service_name: string; key_name: string; last_rotated_at: string | null; next_rotation_at: string | null; notes: string | null }
interface AdminTask { id: string; title: string; description: string | null; priority: 'critical'|'high'|'medium'|'low'; status: 'todo'|'in_progress'|'done'; due_date: string | null; created_at: string }
interface ArtisanProfile { id: string; full_name: string | null; phone: string | null; company_name: string | null; company_type: string | null; created_at: string; subscription_plan: string | null; subscription_status: string | null; twilio_number: string | null; vapi_assistant_id: string | null; vapi_enabled: boolean | null }
interface SubInfo { stripe_customer_id: string | null; stripe_subscription_id: string | null; current_period_end: string | null }
interface ArtisanCall { id: string; created_at: string; caller_name: string | null; caller_phone: string | null; status: string | null; duration_seconds: number | null; summary?: string | null }

interface RentRow {
  profile: { id: string; full_name: string|null; company_name: string|null; subscription_plan: string|null; vapi_assistant_id: string|null; twilio_number: string|null; phone: string|null; subscription_status: string|null; stripe_customer_id?: string|null }
  vapiCost: number; callCount: number; smsCost: number; twilioNumber: number; totalCost: number; revenue: number; margin: number; marginPct: number; loading: boolean
}

interface HealthCheck { id: number; label: string; status: 'ok'|'warning'|'error'|'unknown'|'loading'; message: string }

// ── Constantes ────────────────────────────────────────────────────────────────

const PLAN_REVENUE: Record<string, number> = { starter: 79, solo: 79, pro: 149, expert: 249, equipe: 249, team: 249 }

const TABS = [
  { id: 'overview',      label: 'Vue générale', icon: '📊' },
  { id: 'profitability', label: 'Rentabilité',  icon: '💰' },
  { id: 'support',       label: 'Support',      icon: '👤' },
  { id: 'infra',         label: 'Infra',        icon: '🔧' },
  { id: 'tasks',         label: 'Tâches',       icon: '✅' },
] as const

type TabId = typeof TABS[number]['id']

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
function fmtCost(n: number, currency = '$') { return `${currency}${n.toFixed(2)}` }
function planRevenue(plan: string | null) { return PLAN_REVENUE[(plan ?? '').toLowerCase()] ?? 0 }

function marginBadge(pct: number) {
  if (pct >= 80) return 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
  if (pct >= 50) return 'bg-orange-500/20 text-orange-400 border border-orange-500/30'
  return 'bg-red-500/20 text-red-400 border border-red-500/30'
}
function severityBadge(s: string) {
  if (s === 'critical') return 'bg-red-500/20 text-red-400 border border-red-500/30'
  if (s === 'high')     return 'bg-orange-500/20 text-orange-400 border border-orange-500/30'
  return 'bg-blue-500/20 text-blue-400 border border-blue-500/30'
}
function rotationBadge(next: string | null): { cls: string; label: string } {
  if (!next) return { cls: 'bg-gray-100 text-gray-400 border border-gray-200', label: 'Non planifié' }
  const days = Math.ceil((new Date(next).getTime() - Date.now()) / 86400000)
  if (days < 0)   return { cls: 'bg-red-50 text-red-600 border border-red-200', label: `Expiré (${Math.abs(days)}j)` }
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
function healthIcon(status: HealthCheck['status']) {
  if (status === 'ok')      return '✅'
  if (status === 'warning') return '⚠️'
  if (status === 'error')   return '🔴'
  if (status === 'loading') return '⏳'
  return '❓'
}

// ── Composant principal ───────────────────────────────────────────────────────

export default function AdminPage() {
  const { user, loading: authLoading } = useAuth()

  const [activeTab, setActiveTab] = useState<TabId>('overview')

  // ── État Vue générale ──
  const [alerts, setAlerts] = useState<CriticalAlert[]>([])
  const [metrics, setMetrics] = useState({ totalArtisans: 0, actifs: 0, appels: 0, essais: 0 })
  const [recentProfiles, setRecentProfiles] = useState<any[]>([])
  const [poolStats, setPoolStats] = useState({ total: 0, disponibles: 0, assignes: 0, quarantine: 0 })
  const [mrr, setMrr] = useState<number | null>(null)
  const [dataLoading, setDataLoading] = useState(true)
  const [resolvingId, setResolvingId] = useState<string | null>(null)
  const [processingAbuseId, setProcessingAbuseId] = useState<string | null>(null)

  // ── État Infra ──
  const [keyRotations, setKeyRotations] = useState<KeyRotation[]>([])
  const [rotatingId, setRotatingId] = useState<string | null>(null)

  // ── État Tâches ──
  const [tasks, setTasks] = useState<AdminTask[]>([])
  const [newTaskTitle, setNewTaskTitle] = useState('')
  const [newTaskPriority, setNewTaskPriority] = useState<AdminTask['priority']>('medium')
  const [newTaskDue, setNewTaskDue] = useState('')
  const [addingTask, setAddingTask] = useState(false)

  // ── État Support ──
  const [searchQuery, setSearchQuery] = useState('')
  const [searchLoading, setSearchLoading] = useState(false)
  const [foundProfile, setFoundProfile] = useState<ArtisanProfile | null>(null)
  const [foundSub, setFoundSub] = useState<SubInfo | null>(null)
  const [foundCalls, setFoundCalls] = useState<ArtisanCall[]>([])
  const [togglingMia, setTogglingMia] = useState(false)

  // ── État Rentabilité ──
  const [rentView, setRentView] = useState<'global' | 'detail'>('global')
  const [rentRows, setRentRows] = useState<RentRow[]>([])
  const [rentLoading, setRentLoading] = useState(false)
  const [detailProfile, setDetailProfile] = useState<any | null>(null)
  const [detailSub, setDetailSub] = useState<SubInfo | null>(null)
  const [detailCalls, setDetailCalls] = useState<ArtisanCall[]>([])
  const [healthChecks, setHealthChecks] = useState<HealthCheck[]>([])
  const [detailTogglingMia, setDetailTogglingMia] = useState(false)

  useEffect(() => {
    if (authLoading) return
    if (!user || user.email !== ADMIN_EMAIL) window.location.href = '/dashboard'
  }, [user, authLoading])

  useEffect(() => {
    if (!user || user.email !== ADMIN_EMAIL) return
    loadGeneral()
  }, [user])

  useEffect(() => {
    if (activeTab === 'profitability' && rentRows.length === 0 && !rentLoading) {
      loadRentabilite()
    }
  }, [activeTab])

  // ── Chargements ───────────────────────────────────────────────────────────

  async function loadGeneral() {
    setDataLoading(true)
    await Promise.all([loadAlerts(), loadMetrics(), loadRecentProfiles(), loadPoolStats(), loadKeyRotations(), loadTasks(), loadMrr()])
    setDataLoading(false)
  }

  async function loadAlerts() {
    const { data } = await supabase.from('critical_alerts').select('id,created_at,alert_type,severity,message,meta,resolved_at').order('created_at', { ascending: false }).limit(50)
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
    const { data } = await supabase.from('profiles').select('id,phone,company_name,created_at,subscription_plan,subscription_status,twilio_number,provisioning_status').order('created_at', { ascending: false }).limit(10)
    setRecentProfiles(data ?? [])
  }
  async function loadPoolStats() {
    const { data } = await supabase.from('phone_numbers_pool').select('status')
    if (data) setPoolStats({
      total:      data.length,
      disponibles: data.filter(r => r.status === 'available').length,
      assignes:   data.filter(r => r.status === 'assigned').length,
      quarantine: data.filter(r => r.status === 'quarantine').length,
    })
  }

  async function loadMrr() {
    const PLAN_PRICE: Record<string, number> = { solo: 97, pro: 197, max: 347 }
    const { data } = await supabase
      .from('profiles')
      .select('subscription_plan, subscription_status')
      .eq('subscription_status', 'active')
    if (!data) return
    const total = data.reduce((sum, p) => sum + (PLAN_PRICE[(p.subscription_plan ?? '').toLowerCase()] ?? 0), 0)
    setMrr(total)
  }
  async function loadKeyRotations() {
    const { data } = await supabase.from('key_rotations').select('*').order('next_rotation_at', { ascending: true })
    setKeyRotations(data ?? [])
  }
  async function loadTasks() {
    const { data } = await supabase.from('admin_tasks').select('*').order('created_at', { ascending: false })
    setTasks(data ?? [])
  }

  // ── Actions Alerts ────────────────────────────────────────────────────────

  async function resolveAlert(id: string) {
    setResolvingId(id)
    const resolvedAt = new Date().toISOString()
    await supabase.from('critical_alerts').update({ resolved_at: resolvedAt }).eq('id', id)
    setAlerts(prev => prev.map(a => a.id === id ? { ...a, resolved_at: resolvedAt } : a))
    setResolvingId(null)
  }

  async function markLegitimate(alertId: string, meta: Record<string, any>) {
    setProcessingAbuseId(alertId)
    await supabase.from('trial_fingerprints').update({ is_suspicious: false, suspicious_reason: null }).eq('user_id', meta.new_user_id)
    const resolvedAt = new Date().toISOString()
    await supabase.from('critical_alerts').update({ resolved_at: resolvedAt }).eq('id', alertId)
    setAlerts(prev => prev.map(a => a.id === alertId ? { ...a, resolved_at: resolvedAt } : a))
    setProcessingAbuseId(null)
  }

  async function blockTrial(alertId: string, meta: Record<string, any>) {
    setProcessingAbuseId(alertId)
    const token = await getToken()
    await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/admin-vapi-usage`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'block_trial', user_id: meta.new_user_id }),
    })
    const resolvedAt = new Date().toISOString()
    await supabase.from('critical_alerts').update({ resolved_at: resolvedAt }).eq('id', alertId)
    setAlerts(prev => prev.map(a => a.id === alertId ? { ...a, resolved_at: resolvedAt } : a))
    setProcessingAbuseId(null)
  }

  // ── Actions Infra ─────────────────────────────────────────────────────────

  async function markKeyRotated(id: string) {
    setRotatingId(id)
    await supabase.from('key_rotations').update({ last_rotated_at: new Date().toISOString(), next_rotation_at: new Date(Date.now() + 90 * 86400000).toISOString() }).eq('id', id)
    await loadKeyRotations()
    setRotatingId(null)
  }

  // ── Actions Support ───────────────────────────────────────────────────────

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
      const { data: subData } = await supabase.from('subscriptions').select('stripe_customer_id,stripe_subscription_id,current_period_end').eq('user_id', profileData.id).maybeSingle()
      setFoundSub(subData ?? null)
      const { data: callData } = await supabase.from('calls').select('id,created_at,caller_name,caller_phone,status,duration_seconds').eq('artisan_id', profileData.id).order('created_at', { ascending: false }).limit(10)
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

  // ── Actions Tâches ────────────────────────────────────────────────────────

  async function addTask() {
    if (!newTaskTitle.trim()) return
    setAddingTask(true)
    const { data } = await supabase.from('admin_tasks').insert({ title: newTaskTitle.trim(), priority: newTaskPriority, due_date: newTaskDue || null }).select().single()
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

  // ── Actions Rentabilité ───────────────────────────────────────────────────

  async function getToken() {
    const { data: { session } } = await supabase.auth.getSession()
    return session?.access_token ?? ''
  }

  async function fetchVapiCosts(assistantId: string, monthStart: string, token: string) {
    try {
      const res = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/admin-vapi-usage`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'costs', assistant_id: assistantId, month_start: monthStart }),
      })
      if (!res.ok) return { total_cost: 0, total_calls: 0 }
      return await res.json()
    } catch { return { total_cost: 0, total_calls: 0 } }
  }

  async function checkAssistant(assistantId: string, token: string): Promise<boolean> {
    try {
      const res = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/admin-vapi-usage`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'check_assistant', assistant_id: assistantId }),
      })
      if (!res.ok) return false
      const data = await res.json()
      return data.exists === true
    } catch { return false }
  }

  async function loadRentabilite() {
    setRentLoading(true)
    const monthStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString()
    const { data: profiles } = await supabase.from('profiles')
      .select('id,full_name,company_name,subscription_plan,subscription_status,vapi_assistant_id,twilio_number,phone')
      .not('subscription_plan', 'is', null)
      .order('created_at', { ascending: false })
    if (!profiles?.length) { setRentLoading(false); return }
    const { data: subs } = await supabase.from('subscriptions').select('user_id,stripe_customer_id,current_period_end').in('user_id', profiles.map(p => p.id))
    const subMap: Record<string, any> = {}
    subs?.forEach(s => { subMap[s.user_id] = s })
    const { data: callData } = await supabase.from('calls').select('artisan_id').in('artisan_id', profiles.map(p => p.id)).gte('created_at', monthStart)
    const callCountMap: Record<string, number> = {}
    callData?.forEach(c => { callCountMap[c.artisan_id] = (callCountMap[c.artisan_id] ?? 0) + 1 })
    const rows: RentRow[] = profiles.map(p => {
      const callCount = callCountMap[p.id] ?? 0
      const revenue   = planRevenue(p.subscription_plan)
      const smsCost   = callCount * 0.08
      const twilioCost = p.twilio_number ? 1.0 : 0
      const totalCost = smsCost + twilioCost
      return {
        profile: { ...p, stripe_customer_id: subMap[p.id]?.stripe_customer_id ?? null },
        vapiCost: 0, callCount, smsCost, twilioNumber: twilioCost,
        totalCost, revenue, margin: revenue - totalCost,
        marginPct: revenue > 0 ? ((revenue - totalCost) / revenue) * 100 : 0,
        loading: !!p.vapi_assistant_id,
      }
    })
    setRentRows(rows)
    setRentLoading(false)
    const token = await getToken()
    await Promise.all(
      profiles.filter(p => p.vapi_assistant_id).map(async p => {
        const vapiData = await fetchVapiCosts(p.vapi_assistant_id!, monthStart, token)
        const vapiCost = vapiData.total_cost ?? 0
        setRentRows(prev => prev.map(row => {
          if (row.profile.id !== p.id) return row
          const totalCost = vapiCost + row.smsCost + row.twilioNumber
          const margin = row.revenue - totalCost
          return { ...row, vapiCost, totalCost, margin, marginPct: row.revenue > 0 ? (margin / row.revenue) * 100 : 0, loading: false }
        }))
      })
    )
  }

  async function openArtisanDetail(profileId: string) {
    const { data: profile } = await supabase.from('profiles').select('id,full_name,phone,company_name,company_type,created_at,subscription_plan,subscription_status,twilio_number,vapi_assistant_id,vapi_enabled,onboarding_completed').eq('id', profileId).single()
    if (!profile) return
    setDetailProfile(profile)
    const monthStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString()
    const { data: subData } = await supabase.from('subscriptions').select('stripe_customer_id,stripe_subscription_id,current_period_end').eq('user_id', profileId).maybeSingle()
    setDetailSub(subData ?? null)
    const { data: calls } = await supabase.from('calls').select('id,created_at,caller_name,caller_phone,status,duration_seconds,summary').eq('artisan_id', profileId).gte('created_at', monthStart).order('created_at', { ascending: false })
    setDetailCalls(calls ?? [])
    setRentView('detail')
    runHealthChecks(profile, subData ?? null, calls ?? [])
  }

  async function runHealthChecks(profile: any, sub: SubInfo | null, monthCalls: ArtisanCall[]) {
    const token = await getToken()
    const init: HealthCheck[] = Array.from({ length: 9 }, (_, i) => ({ id: i+1, label: '', status: 'loading' as const, message: '' }))
    setHealthChecks(init)
    const ch1: HealthCheck = { id: 1, label: 'Numéro Twilio assigné', status: profile.twilio_number ? 'ok' : 'error', message: profile.twilio_number ? profile.twilio_number : 'Aucun numéro assigné' }
    let ch2: HealthCheck = { id: 2, label: 'Assistant Vapi actif', status: 'unknown', message: 'Pas d\'assistant_id' }
    if (profile.vapi_assistant_id) {
      const exists = await checkAssistant(profile.vapi_assistant_id, token)
      ch2 = { id: 2, label: 'Assistant Vapi actif', status: exists ? 'ok' : 'error', message: exists ? profile.vapi_assistant_id.slice(0,16)+'…' : 'Assistant Vapi introuvable (404)' }
    }
    const ch3: HealthCheck = { id: 3, label: 'Mia activée', status: profile.vapi_enabled ? 'ok' : 'warning', message: profile.vapi_enabled ? 'Active' : 'Mia désactivée manuellement' }
    let ch4: HealthCheck = { id: 4, label: 'Abonnement actif', status: 'warning', message: 'Aucune info abonnement' }
    if (sub?.current_period_end) {
      const expired = new Date(sub.current_period_end) < new Date()
      ch4 = { id: 4, label: 'Abonnement actif', status: expired ? 'error' : 'ok', message: expired ? `Expiré le ${fmtDate(sub.current_period_end)}` : `Jusqu'au ${fmtDate(sub.current_period_end)}` }
    } else if (profile.subscription_status === 'trialing') {
      ch4 = { id: 4, label: 'Abonnement actif', status: 'warning', message: 'Essai gratuit en cours' }
    } else if (profile.subscription_status === 'active') {
      ch4 = { id: 4, label: 'Abonnement actif', status: 'ok', message: 'Actif (date fin non disponible)' }
    }
    const ch5: HealthCheck = { id: 5, label: 'Renvoi d\'appel configuré', status: profile.onboarding_completed ? 'ok' : 'warning', message: profile.onboarding_completed ? 'Onboarding complété (step 3 validé)' : 'Non vérifiable — à tester manuellement' }
    const ch6: HealthCheck = { id: 6, label: 'Dernière connexion dashboard', status: 'unknown', message: 'Non vérifiable depuis le frontend (auth.users restreint)' }
    let ch7: HealthCheck = { id: 7, label: 'Activité récente', status: 'error', message: 'Aucun appel enregistré' }
    const { data: lastCall } = await supabase.from('calls').select('created_at').eq('artisan_id', profile.id).order('created_at', { ascending: false }).limit(1).maybeSingle()
    if (lastCall) {
      const daysAgo = Math.floor((Date.now() - new Date(lastCall.created_at).getTime()) / 86400000)
      ch7 = { id: 7, label: 'Activité récente', status: daysAgo <= 7 ? 'ok' : daysAgo <= 14 ? 'warning' : 'error', message: `Dernier appel il y a ${daysAgo} jour${daysAgo > 1 ? 's' : ''}` }
    }
    let ch8: HealthCheck = { id: 8, label: 'SMS post-appel envoyés', status: 'ok', message: 'Aucun appel ce mois' }
    if (monthCalls.length > 0) {
      const withSummary = monthCalls.filter(c => c.summary).length
      const ratio = (withSummary / monthCalls.length) * 100
      ch8 = { id: 8, label: 'SMS post-appel envoyés', status: ratio >= 90 ? 'ok' : ratio >= 70 ? 'warning' : 'error', message: `${withSummary}/${monthCalls.length} appels traités (${Math.round(ratio)}%)` }
    }
    const { data: gcData } = await supabase.from('profiles').select('google_calendar_connected').eq('id', profile.id).maybeSingle()
    const gcConnected = (gcData as any)?.google_calendar_connected
    const ch9: HealthCheck = { id: 9, label: 'Google Calendar', status: gcConnected ? 'ok' : 'warning', message: gcConnected ? 'Connecté' : 'Non connecté (optionnel)' }
    setHealthChecks([ch1, ch2, ch3, ch4, ch5, ch6, ch7, ch8, ch9])
  }

  async function toggleDetailMia() {
    if (!detailProfile) return
    setDetailTogglingMia(true)
    const next = !detailProfile.vapi_enabled
    await supabase.from('profiles').update({ vapi_enabled: next }).eq('id', detailProfile.id)
    setDetailProfile((p: any) => p ? { ...p, vapi_enabled: next } : p)
    setDetailTogglingMia(false)
  }

  // ── Guards ─────────────────────────────────────────────────────────────────

  if (authLoading) return (
    <div className="min-h-screen flex items-center justify-center dashboard-bg">
      <div className="w-6 h-6 border-2 border-[#2850c8] border-t-transparent rounded-full animate-spin" />
    </div>
  )
  if (!user || user.email !== ADMIN_EMAIL) return null

  // ── Calculs ────────────────────────────────────────────────────────────────

  const unresolvedAlerts = alerts.filter(a => !a.resolved_at).length

  const rentTotal = rentRows.reduce((acc, r) => ({ cost: acc.cost + r.totalCost, revenue: acc.revenue + r.revenue }), { cost: 0, revenue: 0 })
  const rentGlobalMarginPct = rentTotal.revenue > 0 ? ((rentTotal.revenue - rentTotal.cost) / rentTotal.revenue) * 100 : 0

  const healthOk      = healthChecks.filter(c => c.status === 'ok').length
  const healthWarning = healthChecks.filter(c => c.status === 'warning').length
  const healthError   = healthChecks.filter(c => c.status === 'error').length
  const healthScore   = healthError > 0 ? 'error' : healthWarning > 0 ? 'warning' : 'ok'
  const healthLabel   = healthError > 0 ? `🔴 ${healthError} problème(s) détecté(s)` : healthWarning > 0 ? `⚠️ ${healthWarning} point(s) à surveiller` : '✅ Tout fonctionne'

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="dashboard-bg min-h-screen" style={{ fontFamily: "'Inter', system-ui, sans-serif" }}>

      {/* ── Header fixe (glass-topbar = fond clair → texte sombre) ── */}
      <div className="sticky top-0 z-40 glass-topbar px-6 py-4 flex items-center justify-between">
        <div>
          <h1 className="text-gray-900 font-black text-lg leading-tight">Admin — Fixlyy Internal</h1>
          <p className="text-red-500 text-[10px] font-bold uppercase tracking-widest mt-0.5">Accès restreint</p>
        </div>
        <button onClick={() => window.location.href = '/'} className="text-gray-500 hover:text-gray-900 text-sm transition-colors px-3 py-1.5 rounded-lg border border-gray-200 hover:border-gray-300">
          ← Dashboard
        </button>
      </div>

      {/* ── Navigation desktop (sur dashboard-bg clair → texte sombre) ── */}
      <div className="hidden md:flex gap-0 border-b border-gray-200 px-6">
        {TABS.map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`flex items-center gap-2 px-4 py-3 text-sm font-medium transition-all border-b-2 ${
              activeTab === tab.id
                ? 'border-[#2850c8] text-[#2850c8]'
                : 'border-transparent text-gray-500 hover:text-gray-900'
            }`}
          >
            <span>{tab.icon}</span>
            <span>{tab.label}</span>
            {tab.id === 'overview' && unresolvedAlerts > 0 && (
              <span className="w-4 h-4 bg-red-500 rounded-full text-white text-[9px] font-bold flex items-center justify-center leading-none">
                {unresolvedAlerts > 9 ? '9+' : unresolvedAlerts}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* ── Contenu ── */}
      <div className="max-w-6xl mx-auto px-4 md:px-6 py-6 pb-24 md:pb-8 space-y-6">

        {/* ════════════════════════════════════════════════════
            ONGLET 1 — Vue générale
        ════════════════════════════════════════════════════ */}
        {activeTab === 'overview' && (<>

          {/* Row 1 — KPI (.glass = fond bleu foncé → text-white + text-muted-2) */}
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
            {[
              { label: 'Total artisans', value: metrics.totalArtisans, icon: '👷' },
              { label: 'Artisans actifs', value: metrics.actifs, icon: '✅' },
              { label: 'Appels ce mois', value: metrics.appels, icon: '📞' },
              { label: 'Essais actifs', value: metrics.essais, icon: '🎁' },
              { label: 'MRR', value: mrr !== null ? `${mrr} €` : '…', icon: '💰' },
            ].map(k => (
              <div key={k.label} className="glass rounded-2xl px-5 py-5">
                <div className="w-10 h-10 rounded-xl bg-[#2850c8]/10 flex items-center justify-center text-lg mb-3">{k.icon}</div>
                <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-2 mb-1">{k.label}</p>
                <p className="text-2xl font-black text-white">{dataLoading ? '…' : k.value}</p>
              </div>
            ))}
          </div>

          {/* Row 2 — Alerts + Pool (.glass-light = fond blanc → texte gris foncé) */}
          <div className="grid md:grid-cols-3 gap-4">

            {/* Critical Alerts */}
            <div className="md:col-span-2">
              <h2 className="text-xs font-bold text-gray-500 uppercase tracking-widest mb-3">
                Critical Alerts
                {unresolvedAlerts > 0 && <span className="ml-2 px-2 py-0.5 rounded-full bg-red-500/20 text-red-500 text-[10px] normal-case font-bold">{unresolvedAlerts} ouvertes</span>}
              </h2>

              {/* Cartes abus */}
              {!dataLoading && (() => {
                const abuseAlerts = alerts.filter(a => a.alert_type === 'trial_abuse_suspected' && !a.resolved_at)
                if (!abuseAlerts.length) return null
                return (
                  <div className="space-y-3 mb-3">
                    {abuseAlerts.map(a => {
                      const m = a.meta ?? {}
                      const matchLabel = m.match_type === 'both' ? 'Téléphone + IP' : m.match_type === 'phone' ? 'Téléphone' : 'IP (90j)'
                      const isBusy = processingAbuseId === a.id
                      return (
                        <div key={a.id} className="border border-orange-200 bg-orange-50 rounded-2xl p-4">
                          <div className="flex items-start justify-between gap-3 flex-wrap">
                            <div className="space-y-1.5 min-w-0">
                              <div className="flex items-center gap-2 flex-wrap">
                                <span className="px-2 py-0.5 rounded-full bg-orange-100 text-orange-700 border border-orange-200 text-[10px] font-bold">⚠️ Abus essai suspecté</span>
                                <span className="text-[10px] text-gray-400">{fmt(a.created_at)}</span>
                              </div>
                              <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-0.5 text-xs">
                                <div><span className="text-gray-400">Nouveau : </span><span className="font-mono text-gray-800">{m.new_email ?? '—'}</span></div>
                                <div><span className="text-gray-400">Précédent : </span><span className="font-mono text-gray-600">{m.previous_email ?? '—'}</span></div>
                                <div><span className="text-gray-400">Tél : </span><span className="font-mono text-gray-800">{m.new_phone ?? '—'}</span></div>
                                <div><span className="text-gray-400">IP : </span><span className="font-mono text-gray-800">{m.ip_address ?? '—'}</span></div>
                                <div><span className="text-gray-400">Match : </span><span className="font-semibold text-orange-600">{matchLabel}</span></div>
                              </div>
                            </div>
                            <div className="flex gap-2 flex-shrink-0">
                              <button onClick={() => markLegitimate(a.id, m)} disabled={isBusy} className="text-xs font-semibold px-3 py-1.5 rounded-lg bg-emerald-50 text-emerald-700 hover:bg-emerald-100 transition-all disabled:opacity-40">{isBusy ? '…' : '✅ Légitime'}</button>
                              <button onClick={() => blockTrial(a.id, m)} disabled={isBusy} className="text-xs font-semibold px-3 py-1.5 rounded-lg bg-red-50 text-red-700 hover:bg-red-100 transition-all disabled:opacity-40">{isBusy ? '…' : '🚫 Bloquer'}</button>
                            </div>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                )
              })()}

              <div className="glass-light rounded-2xl p-4">
                {dataLoading ? <p className="text-sm text-gray-400">Chargement…</p> : alerts.filter(a => a.alert_type !== 'trial_abuse_suspected' || !!a.resolved_at).length === 0 ? <p className="text-sm text-gray-400">Aucune alerte.</p> : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-xs">
                      <thead><tr className="border-b border-gray-100">{['Date','Type','Message','Statut',''].map(h => <th key={h} className="text-left py-2 px-2 text-gray-400 font-semibold whitespace-nowrap">{h}</th>)}</tr></thead>
                      <tbody>
                        {alerts.filter(a => a.alert_type !== 'trial_abuse_suspected' || !!a.resolved_at).map(a => (
                          <tr key={a.id} className="border-b border-gray-50 hover:bg-gray-50/60">
                            <td className="py-2 px-2 text-gray-500 whitespace-nowrap">{fmt(a.created_at)}</td>
                            <td className="py-2 px-2"><span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${severityBadge(a.severity)}`}>{a.alert_type}</span></td>
                            <td className="py-2 px-2 text-gray-700 max-w-[160px] truncate">{a.message}</td>
                            <td className="py-2 px-2">{a.resolved_at ? <span className="px-2 py-0.5 rounded-full bg-emerald-50 border border-emerald-200 text-[10px] font-bold text-emerald-600">Résolu</span> : <span className="px-2 py-0.5 rounded-full bg-red-50 border border-red-200 text-[10px] font-bold text-red-600">Ouvert</span>}</td>
                            <td className="py-2 px-2">{!a.resolved_at && <button onClick={() => resolveAlert(a.id)} disabled={resolvingId === a.id} className="text-[10px] font-semibold text-[#2850c8] hover:underline disabled:opacity-40">{resolvingId === a.id ? '…' : 'Résoudre'}</button>}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>

            {/* Pool téléphonique */}
            <div>
              <h2 className="text-xs font-bold text-gray-500 uppercase tracking-widest mb-3">Pool téléphonique</h2>
              <div className="glass-light rounded-2xl p-5 space-y-4">
                {[
                  { label: 'Total', value: poolStats.total, color: 'text-gray-900' },
                  { label: 'Disponibles', value: poolStats.disponibles, color: 'text-emerald-600' },
                  { label: 'Assignés', value: poolStats.assignes, color: 'text-blue-600' },
                  { label: 'Quarantaine', value: poolStats.quarantine, color: 'text-orange-500' },
                ].map(s => (
                  <div key={s.label} className="flex items-center justify-between">
                    <p className="text-xs text-gray-500">{s.label}</p>
                    <p className={`text-2xl font-black ${s.color}`}>{dataLoading ? '…' : s.value}</p>
                  </div>
                ))}
                {!dataLoading && poolStats.disponibles < 3 && (
                  <div className="px-3 py-2 bg-red-50 border border-red-200 rounded-xl text-xs font-bold text-red-600">🚨 Pool bas — action requise</div>
                )}
              </div>
            </div>
          </div>

          {/* Row 3 — Derniers inscrits */}
          <div>
            <h2 className="text-xs font-bold text-gray-500 uppercase tracking-widest mb-3">Derniers inscrits</h2>
            <div className="glass-light rounded-2xl p-4">
              {dataLoading ? <p className="text-sm text-gray-400">Chargement…</p> : recentProfiles.length === 0 ? <p className="text-sm text-gray-400">Aucun profil.</p> : (
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead><tr className="border-b border-gray-100">{['Entreprise','Téléphone','Inscrit le','Plan','Statut','Numéro','Provision'].map(h => <th key={h} className="text-left py-2 px-3 text-gray-400 font-semibold whitespace-nowrap">{h}</th>)}</tr></thead>
                    <tbody>
                      {recentProfiles.map(p => (
                        <tr key={p.id} className={`border-b border-gray-50 hover:bg-gray-50/60 ${p.provisioning_status === 'failed' ? 'bg-red-50/40' : ''}`}>
                          <td className="py-2 px-3 font-semibold text-gray-800">{p.company_name || '—'}</td>
                          <td className="py-2 px-3 text-gray-500 font-mono text-[10px]">{p.phone || '—'}</td>
                          <td className="py-2 px-3 text-gray-400 whitespace-nowrap">{fmtDate(p.created_at)}</td>
                          <td className="py-2 px-3"><span className="px-2 py-0.5 rounded-full bg-[#2850c8]/10 text-[#2850c8] text-[10px] font-bold">{p.subscription_plan || 'essai'}</span></td>
                          <td className="py-2 px-3"><span className={`px-2 py-0.5 rounded-full text-[10px] font-bold border ${p.subscription_status === 'active' ? 'bg-emerald-50 text-emerald-600 border-emerald-200' : p.subscription_status === 'trialing' ? 'bg-blue-50 text-blue-600 border-blue-200' : 'bg-gray-50 text-gray-500 border-gray-200'}`}>{p.subscription_status || 'essai'}</span></td>
                          <td className="py-2 px-3 font-mono text-[10px] text-gray-500">{p.twilio_number || '—'}</td>
                          <td className="py-2 px-3"><span className={`px-2 py-0.5 rounded-full text-[10px] font-bold border ${p.provisioning_status === 'done' ? 'bg-emerald-50 text-emerald-600 border-emerald-200' : p.provisioning_status === 'failed' ? 'bg-red-50 text-red-600 border-red-200' : p.provisioning_status === 'pending' ? 'bg-yellow-50 text-yellow-600 border-yellow-200' : 'bg-gray-50 text-gray-400 border-gray-200'}`}>{p.provisioning_status || '—'}</span></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>

        </>)}

        {/* ════════════════════════════════════════════════════
            ONGLET 2 — Rentabilité
        ════════════════════════════════════════════════════ */}
        {activeTab === 'profitability' && (<>

          {rentView === 'global' && (
            <section>
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-xs font-bold text-gray-500 uppercase tracking-widest">Rentabilité par artisan — {new Date().toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' })}</h2>
                <button onClick={() => { setRentRows([]); loadRentabilite() }} className="text-xs font-semibold text-[#2850c8] hover:underline">↻ Actualiser</button>
              </div>
              {rentLoading && rentRows.length === 0 ? (
                <div className="glass-light rounded-2xl p-8 text-center"><div className="w-6 h-6 border-2 border-[#2850c8] border-t-transparent rounded-full animate-spin mx-auto mb-2"/><p className="text-sm text-gray-400">Chargement des profils…</p></div>
              ) : rentRows.length === 0 ? (
                <div className="glass-light rounded-2xl p-8 text-center"><p className="text-sm text-gray-400">Aucun artisan avec abonnement actif.</p></div>
              ) : (
                <div className="glass-light rounded-2xl overflow-hidden">
                  <div className="overflow-x-auto">
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="border-b border-gray-100 bg-gray-50/50">
                          {['Artisan','Plan','Appels','Vapi $','SMS €','Twilio €','Coût total','Revenu','Marge','Santé',''].map(h => (
                            <th key={h} className="text-left py-3 px-3 text-gray-400 font-semibold whitespace-nowrap">{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {rentRows.map(row => (
                          <tr key={row.profile.id} className="border-b border-gray-50 hover:bg-blue-50/30 transition-colors">
                            <td className="py-3 px-3">
                              <p className="font-semibold text-gray-800">{row.profile.company_name || row.profile.full_name || '—'}</p>
                              <p className="text-gray-400 font-mono text-[10px]">{row.profile.phone || '—'}</p>
                            </td>
                            <td className="py-3 px-3"><span className="px-2 py-0.5 rounded-full bg-[#2850c8]/10 text-[#2850c8] font-bold">{row.profile.subscription_plan || '—'}</span></td>
                            <td className="py-3 px-3 text-gray-700 font-semibold">{row.callCount}</td>
                            <td className="py-3 px-3">{row.loading ? <span className="text-gray-300">…</span> : <span className="font-mono text-gray-700">{fmtCost(row.vapiCost)}</span>}</td>
                            <td className="py-3 px-3 font-mono text-gray-700">{fmtCost(row.smsCost, '€')}</td>
                            <td className="py-3 px-3 font-mono text-gray-700">{fmtCost(row.twilioNumber, '€')}</td>
                            <td className="py-3 px-3">{row.loading ? <span className="text-gray-300">…</span> : <span className="font-mono font-semibold text-gray-800">{fmtCost(row.totalCost, '€')}</span>}</td>
                            <td className="py-3 px-3 font-mono font-semibold text-gray-800">{fmtCost(row.revenue, '€')}</td>
                            <td className="py-3 px-3">{row.loading ? <span className="text-gray-300">…</span> : <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${marginBadge(row.marginPct)}`}>{Math.round(row.marginPct)}%</span>}</td>
                            <td className="py-3 px-3"><span className={`px-2 py-0.5 rounded-full text-[10px] font-bold border ${row.profile.subscription_status === 'active' ? 'bg-emerald-50 text-emerald-600 border-emerald-200' : row.profile.subscription_status === 'trialing' ? 'bg-blue-50 text-blue-600 border-blue-200' : 'bg-gray-50 text-gray-500 border-gray-200'}`}>{row.profile.subscription_status || 'inconnu'}</span></td>
                            <td className="py-3 px-3"><button onClick={() => openArtisanDetail(row.profile.id)} className="text-[11px] font-semibold text-[#2850c8] hover:underline whitespace-nowrap">Voir détail →</button></td>
                          </tr>
                        ))}
                        <tr className="bg-gray-50 border-t-2 border-gray-200 font-bold">
                          <td className="py-3 px-3 text-gray-700" colSpan={6}>TOTAL ({rentRows.length} artisans)</td>
                          <td className="py-3 px-3 font-mono text-gray-900">{fmtCost(rentTotal.cost, '€')}</td>
                          <td className="py-3 px-3 font-mono text-gray-900">{fmtCost(rentTotal.revenue, '€')}</td>
                          <td className="py-3 px-3"><span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${marginBadge(rentGlobalMarginPct)}`}>{Math.round(rentGlobalMarginPct)}%</span></td>
                          <td colSpan={2}/>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                  <div className="px-5 py-3 bg-gray-50/50 border-t border-gray-100 text-[10px] text-gray-400">
                    * Vapi = coûts réels API ce mois · SMS = estimation 0.08€/appel · Twilio = 1€ fixe/numéro
                  </div>
                </div>
              )}
            </section>
          )}

          {rentView === 'detail' && detailProfile && (
            <section>
              <button onClick={() => setRentView('global')} className="text-sm text-gray-500 hover:text-gray-900 transition-colors mb-4 flex items-center gap-1">← Retour au tableau</button>
              <div className="flex items-start justify-between mb-4 gap-3 flex-wrap">
                <div>
                  <h2 className="text-xl font-bold text-gray-900">{detailProfile.company_name || detailProfile.full_name || '—'}</h2>
                  <p className="text-sm text-gray-500 mt-0.5">{detailProfile.phone} · {detailProfile.subscription_plan || 'essai'}</p>
                </div>
                <span className={`px-3 py-1.5 rounded-xl text-xs font-bold border ${healthScore === 'ok' ? 'bg-emerald-50 text-emerald-600 border-emerald-200' : healthScore === 'warning' ? 'bg-orange-50 text-orange-600 border-orange-200' : 'bg-red-50 text-red-600 border-red-200'}`}>{healthLabel}</span>
              </div>
              {(() => {
                const row = rentRows.find(r => r.profile.id === detailProfile.id)
                if (!row) return null
                return (
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
                    {[
                      { label: 'Vapi ce mois', value: fmtCost(row.vapiCost), sub: `${row.callCount} appels`, icon: '🎙️' },
                      { label: 'SMS Twilio', value: fmtCost(row.smsCost, '€'), sub: `${row.callCount} × 0.08€`, icon: '💬' },
                      { label: 'Numéro Twilio', value: fmtCost(row.twilioNumber, '€'), sub: 'Fixe mensuel', icon: '📞' },
                      { label: `Total vs ${fmtCost(row.revenue, '€')}`, value: fmtCost(row.totalCost, '€'), sub: `Marge ${Math.round(row.marginPct)}%`, icon: '💰', highlight: true },
                    ].map(k => (
                      <div key={k.label} className="glass rounded-2xl px-5 py-5">
                        <div className="w-10 h-10 rounded-xl bg-[#2850c8]/10 flex items-center justify-center text-lg mb-3">{k.icon}</div>
                        <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-2 mb-1">{k.label}</p>
                        <p className={`text-xl font-black ${k.highlight ? marginBadge(row.marginPct).includes('emerald') ? 'text-emerald-400' : marginBadge(row.marginPct).includes('orange') ? 'text-orange-400' : 'text-red-400' : 'text-white'}`}>{k.value}</p>
                        <p className="text-[10px] text-muted mt-1">{k.sub}</p>
                      </div>
                    ))}
                  </div>
                )
              })()}
              <div className="glass-light rounded-2xl p-5 mb-6">
                <h3 className="text-xs font-bold text-gray-600 uppercase tracking-wider mb-3">Appels ce mois ({detailCalls.length})</h3>
                {detailCalls.length === 0 ? <p className="text-sm text-gray-400">Aucun appel ce mois.</p> : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-xs">
                      <thead><tr className="border-b border-gray-100">{['Date','Appelant','Téléphone','Durée','Statut','Résumé'].map(h => <th key={h} className="text-left py-2 px-3 text-gray-400 font-semibold">{h}</th>)}</tr></thead>
                      <tbody>
                        {detailCalls.map(c => (
                          <tr key={c.id} className="border-b border-gray-50 hover:bg-gray-50/60">
                            <td className="py-2 px-3 text-gray-400 whitespace-nowrap">{fmt(c.created_at)}</td>
                            <td className="py-2 px-3 text-gray-700">{c.caller_name || '—'}</td>
                            <td className="py-2 px-3 text-gray-500 font-mono">{c.caller_phone || '—'}</td>
                            <td className="py-2 px-3 text-gray-500">{c.duration_seconds != null ? `${Math.round(c.duration_seconds / 60)}min ${c.duration_seconds % 60}s` : '—'}</td>
                            <td className="py-2 px-3"><span className="px-2 py-0.5 rounded-full bg-gray-100 text-gray-600 text-[10px] font-semibold">{c.status || '—'}</span></td>
                            <td className="py-2 px-3 text-gray-500 max-w-[200px] truncate">{(c as any).summary?.slice(0,60) || '—'}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
              <div className="glass-light rounded-2xl p-5 mb-6">
                <h3 className="text-xs font-bold text-gray-600 uppercase tracking-wider mb-3">Health Check ({healthOk}✅ {healthWarning > 0 && `${healthWarning}⚠️`} {healthError > 0 && `${healthError}🔴`})</h3>
                <div className="space-y-2">
                  {healthChecks.map(check => (
                    <div key={check.id} className="flex items-start gap-3 py-2 border-b border-gray-50 last:border-0">
                      <span className="text-base leading-none mt-0.5 flex-shrink-0">{healthIcon(check.status)}</span>
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-semibold text-gray-800">{check.label || `Check ${check.id}`}</p>
                        <p className="text-[11px] text-gray-400 mt-0.5">{check.message || (check.status === 'loading' ? 'Vérification…' : '')}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
              <div className="glass-light rounded-2xl p-5">
                <h3 className="text-xs font-bold text-gray-600 uppercase tracking-wider mb-3">Actions rapides</h3>
                <div className="flex flex-wrap gap-3">
                  <button onClick={toggleDetailMia} disabled={detailTogglingMia} className={`text-sm font-semibold px-4 py-2.5 rounded-xl transition-all ${detailProfile.vapi_enabled ? 'bg-red-50 text-red-600 hover:bg-red-100' : 'bg-emerald-50 text-emerald-600 hover:bg-emerald-100'} disabled:opacity-40`}>{detailTogglingMia ? '…' : detailProfile.vapi_enabled ? '🔇 Désactiver Mia' : '🎙️ Activer Mia'}</button>
                  {detailSub?.stripe_customer_id && <a href={`https://dashboard.stripe.com/customers/${detailSub.stripe_customer_id}`} target="_blank" rel="noopener noreferrer" className="text-sm font-semibold px-4 py-2.5 rounded-xl bg-indigo-50 text-indigo-600 hover:bg-indigo-100 transition-all">Voir dans Stripe →</a>}
                  {detailProfile.vapi_assistant_id && <a href={`https://dashboard.vapi.ai/assistants/${detailProfile.vapi_assistant_id}`} target="_blank" rel="noopener noreferrer" className="text-sm font-semibold px-4 py-2.5 rounded-xl bg-blue-50 text-blue-600 hover:bg-blue-100 transition-all">Voir dans Vapi →</a>}
                  {detailProfile.phone && <a href={`mailto:support@fixlyy.fr?subject=Support - ${detailProfile.company_name}&body=Bonjour, je vous contacte concernant votre compte Fixlyy.`} className="text-sm font-semibold px-4 py-2.5 rounded-xl bg-gray-50 text-gray-600 hover:bg-gray-100 transition-all">Envoyer email support →</a>}
                </div>
              </div>
            </section>
          )}

        </>)}

        {/* ════════════════════════════════════════════════════
            ONGLET 3 — Support
        ════════════════════════════════════════════════════ */}
        {activeTab === 'support' && (
          <section>
            <h2 className="text-xs font-bold text-gray-500 uppercase tracking-widest mb-3">Recherche artisan</h2>
            <div className="glass-light rounded-2xl p-5">
              <div className="flex gap-3 mb-5">
                <input value={searchQuery} onChange={e => setSearchQuery(e.target.value)} onKeyDown={e => e.key === 'Enter' && searchArtisan()} placeholder="UUID artisan ou téléphone (+33…)" className="flex-1 border border-gray-200 rounded-xl px-4 py-2.5 text-sm outline-none focus:border-[#2850c8] transition-colors font-mono" />
                <button onClick={searchArtisan} disabled={searchLoading || !searchQuery.trim()} className="px-4 py-2.5 rounded-xl text-sm font-semibold text-white disabled:opacity-40 transition-all" style={{ background: 'linear-gradient(135deg, #2850c8, #4070e8)' }}>{searchLoading ? '…' : 'Rechercher'}</button>
              </div>
              {foundProfile && (
                <div className="space-y-4">
                  <div className="grid md:grid-cols-2 gap-4">
                    <div className="bg-gray-50 rounded-xl p-4 space-y-1.5">
                      <p className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">Profil</p>
                      {[['Nom', foundProfile.full_name], ['Téléphone', foundProfile.phone], ['Entreprise', foundProfile.company_name], ['Métier', foundProfile.company_type], ['Inscrit le', fmtDate(foundProfile.created_at)], ['Plan', foundProfile.subscription_plan], ['Statut', foundProfile.subscription_status], ['Twilio', foundProfile.twilio_number], ['Vapi ID', foundProfile.vapi_assistant_id?.slice(0,16)+'…']].map(([l, v]) => (
                        <div key={l as string} className="flex items-center gap-2">
                          <span className="text-[11px] text-gray-400 w-24 flex-shrink-0">{l}</span>
                          <span className="text-xs font-medium text-gray-800 font-mono">{(v as string) || '—'}</span>
                        </div>
                      ))}
                    </div>
                    <div className="space-y-3">
                      {foundSub && (
                        <div className="bg-gray-50 rounded-xl p-4">
                          <p className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">Abonnement</p>
                          {[['Customer', foundSub.stripe_customer_id?.slice(0,14)+'…'], ['Sub', foundSub.stripe_subscription_id?.slice(0,14)+'…'], ['Fin', fmtDate(foundSub.current_period_end)]].map(([l, v]) => (
                            <div key={l as string} className="flex items-center gap-2 mb-1"><span className="text-[11px] text-gray-400 w-16">{l}</span><span className="text-xs font-mono text-gray-700">{(v as string) || '—'}</span></div>
                          ))}
                        </div>
                      )}
                      <div className="bg-gray-50 rounded-xl p-4 flex flex-col gap-2">
                        <p className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-1">Actions</p>
                        <button onClick={toggleMia} disabled={togglingMia} className={`text-xs font-semibold px-3 py-2 rounded-lg transition-all ${foundProfile.vapi_enabled ? 'bg-red-50 text-red-600 hover:bg-red-100' : 'bg-emerald-50 text-emerald-600 hover:bg-emerald-100'} disabled:opacity-40`}>{togglingMia ? '…' : foundProfile.vapi_enabled ? '🔇 Désactiver Mia' : '🎙️ Activer Mia'}</button>
                        {foundSub?.stripe_customer_id && <a href={`https://dashboard.stripe.com/customers/${foundSub.stripe_customer_id}`} target="_blank" rel="noopener noreferrer" className="text-xs font-semibold px-3 py-2 rounded-lg bg-indigo-50 text-indigo-600 hover:bg-indigo-100 transition-all text-center">Voir dans Stripe →</a>}
                        {foundProfile.vapi_assistant_id && <a href={`https://dashboard.vapi.ai/assistants/${foundProfile.vapi_assistant_id}`} target="_blank" rel="noopener noreferrer" className="text-xs font-semibold px-3 py-2 rounded-lg bg-blue-50 text-blue-600 hover:bg-blue-100 transition-all text-center">Voir dans Vapi →</a>}
                      </div>
                    </div>
                  </div>
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
        )}

        {/* ════════════════════════════════════════════════════
            ONGLET 4 — Infra
        ════════════════════════════════════════════════════ */}
        {activeTab === 'infra' && (<>

          <section>
            <h2 className="text-xs font-bold text-gray-500 uppercase tracking-widest mb-3">Infrastructure & Services externes</h2>
            {(['critical', 'important', 'secondary'] as const).map(level => {
              const { dot, label } = criticalityConfig(level)
              return (
                <div key={level} className="mb-6">
                  <p className="text-[11px] font-bold text-gray-500 uppercase tracking-wider mb-2">{dot} {label}</p>
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                    {SERVICES.filter(s => s.criticality === level).map(s => {
                      const cc = criticalityConfig(s.criticality)
                      return (
                        <div key={s.name} className="glass-light rounded-2xl p-4 flex flex-col gap-2">
                          <div className="flex items-start justify-between gap-2">
                            <div><p className="text-sm font-bold text-gray-900">{s.name}</p><p className="text-xs text-gray-500 mt-0.5">{s.role}</p></div>
                            <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold flex-shrink-0 ${cc.cls}`}>{cc.label}</span>
                          </div>
                          <p className="text-[11px] text-gray-400">{s.billing}</p>
                          {s.keyName && <span className="font-mono text-[10px] bg-gray-100 text-gray-500 px-2 py-1 rounded-lg w-fit">{s.keyName}</span>}
                          <a href={s.dashboard} target="_blank" rel="noopener noreferrer" className="text-[11px] font-semibold text-[#2850c8] hover:underline mt-1">Ouvrir dashboard →</a>
                        </div>
                      )
                    })}
                  </div>
                </div>
              )
            })}
          </section>

          <section>
            <h2 className="text-xs font-bold text-gray-500 uppercase tracking-widest mb-3">🔑 Renouvellement des clés API</h2>
            <div className="glass-light rounded-2xl p-5">
              {keyRotations.length === 0 ? <p className="text-sm text-gray-400">Aucune clé enregistrée.</p> : (
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
                            <td className="py-2 px-3"><button onClick={() => markKeyRotated(k.id)} disabled={rotatingId === k.id} className="text-[10px] font-semibold text-[#2850c8] hover:underline disabled:opacity-40 whitespace-nowrap">{rotatingId === k.id ? '…' : 'Marquer renouvelée'}</button></td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </section>

        </>)}

        {/* ════════════════════════════════════════════════════
            ONGLET 5 — Tâches
        ════════════════════════════════════════════════════ */}
        {activeTab === 'tasks' && (
          <section>
            <div className="glass-light rounded-2xl p-4 mb-4 flex flex-wrap gap-3 items-end">
              <div className="flex-1 min-w-[200px]">
                <label className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider block mb-1">Titre</label>
                <input value={newTaskTitle} onChange={e => setNewTaskTitle(e.target.value)} onKeyDown={e => e.key === 'Enter' && addTask()} placeholder="Nouvelle tâche…" className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm outline-none focus:border-[#2850c8] transition-colors" />
              </div>
              <div>
                <label className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider block mb-1">Priorité</label>
                <select value={newTaskPriority} onChange={e => setNewTaskPriority(e.target.value as AdminTask['priority'])} className="border border-gray-200 rounded-xl px-3 py-2.5 text-sm outline-none focus:border-[#2850c8] bg-white">
                  <option value="critical">🔴 Critique</option><option value="high">🟠 Haute</option><option value="medium">🟡 Moyenne</option><option value="low">⚪ Basse</option>
                </select>
              </div>
              <div>
                <label className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider block mb-1">Échéance</label>
                <input type="date" value={newTaskDue} onChange={e => setNewTaskDue(e.target.value)} className="border border-gray-200 rounded-xl px-3 py-2.5 text-sm outline-none focus:border-[#2850c8] bg-white" />
              </div>
              <button onClick={addTask} disabled={addingTask || !newTaskTitle.trim()} className="px-4 py-2.5 rounded-xl text-sm font-semibold text-white disabled:opacity-40" style={{ background: 'linear-gradient(135deg, #2850c8, #4070e8)' }}>{addingTask ? '…' : 'Ajouter'}</button>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {([
                { key: 'todo' as const, label: 'Todo', items: tasks.filter(t => t.status === 'todo'), nextStatus: 'in_progress' as const, nextLabel: '→ En cours' },
                { key: 'in_progress' as const, label: 'En cours', items: tasks.filter(t => t.status === 'in_progress'), nextStatus: 'done' as const, nextLabel: '→ Fait', prevStatus: 'todo' as const, prevLabel: '← Todo' },
                { key: 'done' as const, label: 'Fait ✓', items: tasks.filter(t => t.status === 'done'), prevStatus: 'in_progress' as const, prevLabel: '← En cours' },
              ]).map(col => (
                <div key={col.key} className="glass-light rounded-2xl p-4">
                  <div className="flex items-center justify-between mb-3"><p className="text-xs font-bold text-gray-700 uppercase tracking-wider">{col.label}</p><span className="text-[10px] text-gray-400 font-semibold">{col.items.length}</span></div>
                  <div className="space-y-2.5">
                    {col.items.map(task => {
                      const isOverdue = task.due_date && new Date(task.due_date) < new Date()
                      return (
                        <div key={task.id} className="bg-white border border-gray-100 rounded-xl p-3 shadow-sm">
                          <div className="flex items-start justify-between gap-2 mb-1.5">
                            <p className="text-xs font-semibold text-gray-800 leading-tight flex-1">{task.title}</p>
                            <span className={`px-1.5 py-0.5 rounded-full text-[9px] font-bold flex-shrink-0 ${priorityBadge(task.priority)}`}>{task.priority}</span>
                          </div>
                          {task.due_date && <p className={`text-[10px] font-semibold mb-2 ${isOverdue ? 'text-red-500' : 'text-gray-400'}`}>{isOverdue ? '⚠️ ' : ''}Échéance : {fmtDate(task.due_date)}</p>}
                          <div className="flex gap-1.5 flex-wrap">
                            {col.nextStatus && <button onClick={() => moveTask(task.id, col.nextStatus!)} className="text-[10px] font-semibold text-[#2850c8] hover:underline">{col.nextLabel}</button>}
                            {col.prevStatus && <button onClick={() => moveTask(task.id, col.prevStatus!)} className="text-[10px] font-semibold text-gray-400 hover:underline">{col.prevLabel}</button>}
                            <button onClick={() => deleteTask(task.id)} className="text-[10px] font-semibold text-red-400 hover:underline ml-auto">Suppr.</button>
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
        )}

      </div>

      {/* ── Navigation mobile fixe en bas (glass-bottom-nav = fond clair → texte sombre) ── */}
      <div className="md:hidden fixed bottom-0 left-0 right-0 z-50 glass-bottom-nav">
        <div className="flex">
          {TABS.map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex-1 flex flex-col items-center gap-1 py-3 text-xs font-medium transition-all relative ${
                activeTab === tab.id ? 'text-[#2850c8]' : 'text-gray-400'
              }`}
            >
              <span className="text-xl leading-none">{tab.icon}</span>
              <span className="text-[10px]">{tab.label}</span>
              {tab.id === 'overview' && unresolvedAlerts > 0 && (
                <span className="absolute top-2 right-[calc(50%-16px)] w-4 h-4 bg-red-500 rounded-full text-white text-[9px] font-bold flex items-center justify-center leading-none">
                  {unresolvedAlerts > 9 ? '9+' : unresolvedAlerts}
                </span>
              )}
            </button>
          ))}
        </div>
      </div>

    </div>
  )
}
