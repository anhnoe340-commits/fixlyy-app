import { useState, useEffect } from 'react'
import { useAuth } from '@/contexts/AuthContext'
import { supabase } from '@/lib/supabase'

// Accès restreint : seul ce user_id peut voir cette page
const ADMIN_USER_ID = 'e537e7ab-5f0e-489f-8acc-7faae4dbe0d7'

interface CriticalAlert {
  id: string
  created_at: string
  alert_type: string
  severity: string
  message: string
  user_id: string | null
  resolved: boolean | null
}

interface Metrics {
  totalArtisans: number
  actifs: number
  appels: number
  essais: number
}

interface PoolStats {
  total: number
  disponibles: number
  assignes: number
}

function fmt(iso: string) {
  const d = new Date(iso)
  const dd = d.getDate().toString().padStart(2, '0')
  const mm = (d.getMonth() + 1).toString().padStart(2, '0')
  const hh = d.getHours().toString().padStart(2, '0')
  const min = d.getMinutes().toString().padStart(2, '0')
  return `${dd}/${mm}/${d.getFullYear()} ${hh}:${min}`
}

function severityBadge(s: string) {
  if (s === 'critical') return 'bg-red-500/20 text-red-400 border border-red-500/30'
  if (s === 'high')     return 'bg-orange-500/20 text-orange-400 border border-orange-500/30'
  if (s === 'warning')  return 'bg-yellow-500/20 text-yellow-400 border border-yellow-500/30'
  return 'bg-blue-500/20 text-blue-400 border border-blue-500/30'
}

export default function AdminPage() {
  const { user, loading: authLoading } = useAuth()

  const [alerts, setAlerts] = useState<CriticalAlert[]>([])
  const [metrics, setMetrics] = useState<Metrics>({ totalArtisans: 0, actifs: 0, appels: 0, essais: 0 })
  const [recentProfiles, setRecentProfiles] = useState<any[]>([])
  const [poolStats, setPoolStats] = useState<PoolStats>({ total: 0, disponibles: 0, assignes: 0 })
  const [dataLoading, setDataLoading] = useState(true)
  const [resolvingId, setResolvingId] = useState<string | null>(null)

  // Redirection si non-admin
  useEffect(() => {
    if (authLoading) return
    if (!user || user.id !== ADMIN_USER_ID) {
      window.location.href = '/'
    }
  }, [user, authLoading])

  useEffect(() => {
    if (!user || user.id !== ADMIN_USER_ID) return
    loadAll()
  }, [user])

  async function loadAll() {
    setDataLoading(true)
    await Promise.all([loadAlerts(), loadMetrics(), loadRecentProfiles(), loadPoolStats()])
    setDataLoading(false)
  }

  async function loadAlerts() {
    // NOTE : critical_alerts peut être restreint RLS (service_role only).
    // Si la liste est vide, ajouter une policy SELECT pour le rôle authenticated + ADMIN_USER_ID.
    const { data } = await supabase
      .from('critical_alerts')
      .select('id, created_at, alert_type, severity, message, user_id, resolved')
      .order('created_at', { ascending: false })
      .limit(50)
    setAlerts(data ?? [])
  }

  async function loadMetrics() {
    // NOTE : SELECT COUNT(*) FROM profiles peut être limité par RLS pour l'anon key.
    const startOfMonth = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString()
    const [total, actifs, appels, essais] = await Promise.all([
      supabase.from('profiles').select('*', { count: 'exact', head: true }),
      supabase.from('profiles').select('*', { count: 'exact', head: true })
        .in('subscription_plan', ['pro', 'solo', 'equipe', 'starter', 'expert'])
        .not('subscription_plan', 'is', null),
      supabase.from('calls').select('*', { count: 'exact', head: true })
        .gte('created_at', startOfMonth),
      supabase.from('profiles').select('*', { count: 'exact', head: true })
        .eq('subscription_status', 'trialing'),
    ])
    setMetrics({
      totalArtisans: total.count   ?? 0,
      actifs:        actifs.count  ?? 0,
      appels:        appels.count  ?? 0,
      essais:        essais.count  ?? 0,
    })
  }

  async function loadRecentProfiles() {
    const { data } = await supabase
      .from('profiles')
      .select('id, phone, company_name, created_at, subscription_plan, subscription_status')
      .order('created_at', { ascending: false })
      .limit(10)
    setRecentProfiles(data ?? [])
  }

  async function loadPoolStats() {
    // Essai phone_number_pool (CLAUDE.md) puis phone_numbers_pool (utilisé par replenish)
    const { data: d1 } = await supabase.from('phone_number_pool').select('is_assigned')
    if (d1) {
      setPoolStats({
        total:       d1.length,
        disponibles: d1.filter(r => !r.is_assigned).length,
        assignes:    d1.filter(r =>  r.is_assigned).length,
      })
      return
    }
    const { data: d2 } = await supabase.from('phone_numbers_pool').select('status')
    if (d2) {
      setPoolStats({
        total:       d2.length,
        disponibles: d2.filter(r => r.status === 'available').length,
        assignes:    d2.filter(r => r.status === 'assigned').length,
      })
    }
  }

  async function resolveAlert(id: string) {
    setResolvingId(id)
    await supabase.from('critical_alerts').update({ resolved: true }).eq('id', id)
    setAlerts(prev => prev.map(a => a.id === id ? { ...a, resolved: true } : a))
    setResolvingId(null)
  }

  if (authLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center dashboard-bg">
        <div className="w-6 h-6 border-2 border-[#2850c8] border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  if (!user || user.id !== ADMIN_USER_ID) return null

  const unresolvedCount = alerts.filter(a => !a.resolved).length

  return (
    <div className="dashboard-bg min-h-screen p-4 md:p-8" style={{ fontFamily: "'Inter', system-ui, sans-serif" }}>
      <div className="max-w-6xl mx-auto space-y-8">

        {/* ── Header ── */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-white">Admin — Fixlyy Internal</h1>
            <p className="text-[11px] text-red-400 mt-0.5 font-bold tracking-widest uppercase">Accès restreint</p>
          </div>
          <button
            onClick={() => window.location.href = '/'}
            className="text-sm text-slate-400 hover:text-white transition-colors px-4 py-2 rounded-xl border border-white/10 hover:border-white/20"
          >
            ← Dashboard
          </button>
        </div>

        {/* ── Section 2 : KPI globaux ── */}
        <section>
          <h2 className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-3">Métriques globales</h2>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {[
              { label: 'Total artisans',  value: metrics.totalArtisans, icon: '👷' },
              { label: 'Artisans actifs', value: metrics.actifs,         icon: '✅' },
              { label: 'Appels ce mois',  value: metrics.appels,         icon: '📞' },
              { label: 'Essais actifs',   value: metrics.essais,         icon: '🎁' },
            ].map(k => (
              <div key={k.label} className="glass rounded-2xl px-5 py-5">
                <div className="w-10 h-10 rounded-xl bg-[#2850c8]/10 flex items-center justify-center text-lg mb-3">
                  {k.icon}
                </div>
                <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-2 mb-1">{k.label}</p>
                <p className="text-2xl font-black text-white">{dataLoading ? '…' : k.value}</p>
              </div>
            ))}
          </div>
        </section>

        {/* ── Section 4 : Pool téléphonique ── */}
        <section>
          <h2 className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-3">Pool téléphonique</h2>
          <div className="glass-light rounded-2xl p-5">
            <div className="flex flex-wrap items-center gap-8">
              {[
                { label: 'Total',       value: poolStats.total,       color: 'text-gray-900' },
                { label: 'Disponibles', value: poolStats.disponibles, color: 'text-emerald-600' },
                { label: 'Assignés',    value: poolStats.assignes,    color: 'text-blue-600'   },
              ].map(s => (
                <div key={s.label} className="text-center">
                  <p className={`text-3xl font-black ${s.color}`}>{dataLoading ? '…' : s.value}</p>
                  <p className="text-xs text-gray-400 mt-1">{s.label}</p>
                </div>
              ))}
              {!dataLoading && poolStats.disponibles < 3 && (
                <span className="px-3 py-1.5 bg-red-50 border border-red-200 rounded-xl text-xs font-bold text-red-600">
                  🚨 Pool bas — action requise
                </span>
              )}
            </div>
          </div>
        </section>

        {/* ── Section 1 : Critical Alerts ── */}
        <section>
          <h2 className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-3">
            Critical Alerts
            {unresolvedCount > 0 && (
              <span className="ml-2 px-2 py-0.5 rounded-full bg-red-500/20 text-red-400 text-[10px] normal-case font-bold">
                {unresolvedCount} ouvertes
              </span>
            )}
          </h2>
          <div className="glass-light rounded-2xl p-5">
            {dataLoading ? (
              <p className="text-sm text-gray-400">Chargement…</p>
            ) : alerts.length === 0 ? (
              <p className="text-sm text-gray-400">Aucune alerte — ou accès RLS restreint.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-gray-100">
                      {['Date', 'Type', 'Message', 'User', 'Statut', ''].map(h => (
                        <th key={h} className="text-left py-2 px-3 text-gray-400 font-semibold whitespace-nowrap">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {alerts.map(a => (
                      <tr key={a.id} className="border-b border-gray-50 hover:bg-gray-50/60 transition-colors">
                        <td className="py-2 px-3 text-gray-500 whitespace-nowrap">{fmt(a.created_at)}</td>
                        <td className="py-2 px-3">
                          <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${severityBadge(a.severity)}`}>
                            {a.alert_type}
                          </span>
                        </td>
                        <td className="py-2 px-3 text-gray-700 max-w-xs truncate">{a.message}</td>
                        <td className="py-2 px-3 text-gray-400 font-mono">{a.user_id?.slice(0, 8) ?? '—'}</td>
                        <td className="py-2 px-3">
                          {a.resolved
                            ? <span className="px-2 py-0.5 rounded-full bg-emerald-50 border border-emerald-200 text-[10px] font-bold text-emerald-600">Résolu</span>
                            : <span className="px-2 py-0.5 rounded-full bg-red-50 border border-red-200 text-[10px] font-bold text-red-600">Ouvert</span>
                          }
                        </td>
                        <td className="py-2 px-3">
                          {!a.resolved && (
                            <button
                              onClick={() => resolveAlert(a.id)}
                              disabled={resolvingId === a.id}
                              className="text-[10px] font-semibold text-[#2850c8] hover:underline disabled:opacity-40"
                            >
                              {resolvingId === a.id ? '…' : 'Résoudre'}
                            </button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </section>

        {/* ── Section 3 : Derniers inscrits ── */}
        <section>
          <h2 className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-3">Derniers inscrits</h2>
          <div className="glass-light rounded-2xl p-5">
            {dataLoading ? (
              <p className="text-sm text-gray-400">Chargement…</p>
            ) : recentProfiles.length === 0 ? (
              <p className="text-sm text-gray-400">Aucun profil — ou accès RLS restreint.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-gray-100">
                      {['Entreprise', 'Téléphone', 'Inscrit le', 'Plan', 'Statut'].map(h => (
                        <th key={h} className="text-left py-2 px-3 text-gray-400 font-semibold">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {recentProfiles.map(p => (
                      <tr key={p.id} className="border-b border-gray-50 hover:bg-gray-50/60 transition-colors">
                        <td className="py-2 px-3 font-semibold text-gray-800">{p.company_name || '—'}</td>
                        <td className="py-2 px-3 text-gray-500 font-mono">{p.phone || '—'}</td>
                        <td className="py-2 px-3 text-gray-400 whitespace-nowrap">{fmt(p.created_at)}</td>
                        <td className="py-2 px-3">
                          <span className="px-2 py-0.5 rounded-full bg-[#2850c8]/10 text-[#2850c8] text-[10px] font-bold">
                            {p.subscription_plan || 'essai'}
                          </span>
                        </td>
                        <td className="py-2 px-3">
                          <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold border ${
                            p.subscription_status === 'active'   ? 'bg-emerald-50 text-emerald-600 border-emerald-200' :
                            p.subscription_status === 'trialing' ? 'bg-blue-50 text-blue-600 border-blue-200' :
                            'bg-gray-50 text-gray-500 border-gray-200'
                          }`}>
                            {p.subscription_status || 'essai'}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </section>

      </div>
    </div>
  )
}
