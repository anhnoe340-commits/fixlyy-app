import { useState, useEffect } from 'react'
import { useAuth } from '@/contexts/AuthContext'
import { useProfile } from '@/contexts/ProfileContext'
import { supabase } from '@/lib/supabase'

type Page =
  | 'today' | 'calls' | 'contacts' | 'agenda' | 'stats'
  | 'greeting' | 'inbound-reasons' | 'outbound-reasons' | 'call-transfer' | 'post-processing' | 'employees'
  | 'business-details' | 'hours' | 'assistant' | 'webhooks' | 'integrations' | 'timezone'
  | 'subscription'

const BRAND = '#2850c8'

// ── Mise à jour automatique de l'assistant Vapi à chaque session ─────────────
async function syncAssistant() {
  const sessionKey = 'mia_synced_v2'
  if (sessionStorage.getItem(sessionKey)) return // déjà fait cette session
  try {
    const { data: { session } } = await supabase.auth.getSession()
    if (!session?.access_token) return
    await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/provision-artisan`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${session.access_token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ force_update: true }),
    })
    sessionStorage.setItem(sessionKey, '1')
  } catch { /* silencieux — ne bloque pas l'app */ }
}

export default function Dashboard() {
  const { user, signOut } = useAuth()
  const { profile, uploadLogo } = useProfile()
  const [page, setPage] = useState<Page>('today')
  const [sidebarOpen, setSidebarOpen] = useState(false)

  // Ferme la sidebar mobile à chaque changement de page
  useEffect(() => { setSidebarOpen(false) }, [page])

  // Sync automatique de l'assistant au chargement (une fois par session)
  useEffect(() => {
    if (profile) syncAssistant()
  }, [!!profile])

  if (!profile) return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="w-6 h-6 border-2 border-[#2850c8] border-t-transparent rounded-full animate-spin" />
    </div>
  )

  const accent = BRAND

  return (
    <div className="flex min-h-screen bg-[#F5F5F4] text-[#1A1A1A]" style={{ fontFamily: "'system-ui', sans-serif" }}>
      {/* Overlay mobile sidebar */}
      {sidebarOpen && <div className="md:hidden fixed inset-0 bg-black/40 z-10" onClick={() => setSidebarOpen(false)} />}

      {/* Sidebar — dark */}
      <aside className={`w-56 bg-[#0F172A] flex flex-col flex-shrink-0 fixed top-0 left-0 h-screen z-20 transition-transform duration-200 ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'} md:translate-x-0`}>

        {/* Logo + entreprise */}
        <div className="px-4 py-4 flex items-center gap-3 border-b border-white/10">
          <div className="w-8 h-8 rounded-lg flex items-center justify-center text-white font-bold text-sm flex-shrink-0" style={{ background: BRAND }}>
            {(profile.company_name || 'A')[0].toUpperCase()}
          </div>
          <div className="min-w-0">
            <p className="font-semibold text-[13px] text-white truncate leading-tight">{profile.company_name || 'Mon entreprise'}</p>
            <p className="text-[11px] text-slate-500 truncate">{profile.twilio_number || 'N° en cours…'}</p>
          </div>
        </div>

        {/* Navigation */}
        <nav className="flex-1 py-3 overflow-y-auto">
          {/* Section principale — toujours visible */}
          <p className="px-4 mb-1 text-[10px] font-semibold text-slate-600 uppercase tracking-widest">Activité</p>
          <DarkNavItem icon={<HomeIcon />} label="Aujourd'hui" active={page === 'today'} onClick={() => setPage('today')} accent={accent} />
          <DarkNavItem icon={<PhoneIcon />} label="Appels" active={page === 'calls'} onClick={() => setPage('calls')} accent={accent} />
          <DarkNavItem icon={<UserIcon />} label="Contacts" active={page === 'contacts'} onClick={() => setPage('contacts')} accent={accent} />
          <DarkNavItem icon={<CalendarIcon />} label="Agenda" active={page === 'agenda'} onClick={() => setPage('agenda')} accent={accent} />
          <DarkNavItem icon={<ChartIcon />} label="Statistiques" active={page === 'stats'} onClick={() => setPage('stats')} accent={accent} />

          {/* Répondre — section repliable */}
          <SidebarGroup label="Répondre" defaultOpen={['greeting','inbound-reasons','outbound-reasons','call-transfer','post-processing','employees'].includes(page)}>
            <DarkNavItem icon={<MessageIcon />} label="Salutation" active={page === 'greeting'} onClick={() => setPage('greeting')} accent={accent} indent />
            <DarkNavItem icon={<PhoneInIcon />} label="Raisons entrantes" active={page === 'inbound-reasons'} onClick={() => setPage('inbound-reasons')} accent={accent} indent />
            <DarkNavItem icon={<PhoneOutIcon />} label="Raisons sortantes" active={page === 'outbound-reasons'} onClick={() => setPage('outbound-reasons')} accent={accent} indent />
            <DarkNavItem icon={<TransferIcon />} label="Transfert d'appel" active={page === 'call-transfer'} onClick={() => setPage('call-transfer')} accent={accent} indent />
            <DarkNavItem icon={<MailIcon />} label="Post-traitement" active={page === 'post-processing'} onClick={() => setPage('post-processing')} accent={accent} indent />
            <DarkNavItem icon={<TeamIcon />} label="Employés" active={page === 'employees'} onClick={() => setPage('employees')} accent={accent} indent />
          </SidebarGroup>

          {/* Plateforme — section repliable */}
          <SidebarGroup label="Plateforme" defaultOpen={['business-details','hours','assistant','webhooks','integrations','timezone','subscription'].includes(page)}>
            <DarkNavItem icon={<BuildingIcon />} label="Détails entreprise" active={page === 'business-details'} onClick={() => setPage('business-details')} accent={accent} indent />
            <DarkNavItem icon={<ClockIcon />} label="Horaires" active={page === 'hours'} onClick={() => setPage('hours')} accent={accent} indent />
            <DarkNavItem icon={<BotIcon />} label="Mon assistante" active={page === 'assistant'} onClick={() => setPage('assistant')} accent={accent} indent />
            <DarkNavItem icon={<WebhookIcon />} label="Webhooks" active={page === 'webhooks'} onClick={() => setPage('webhooks')} accent={accent} indent />
            <DarkNavItem icon={<PuzzleIcon />} label="Intégrations" active={page === 'integrations'} onClick={() => setPage('integrations')} accent={accent} indent />
            <DarkNavItem icon={<GlobeIcon />} label="Fuseau horaire" active={page === 'timezone'} onClick={() => setPage('timezone')} accent={accent} indent />
            <DarkNavItem icon={<CardIcon />} label="Abonnement" active={page === 'subscription'} onClick={() => setPage('subscription')} accent={accent} indent />
          </SidebarGroup>
        </nav>

        {/* Pied de page — utilisateur */}
        <div className="border-t border-white/10 px-4 py-3 flex items-center justify-between gap-2">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-7 h-7 rounded-full bg-slate-700 flex items-center justify-center text-[11px] font-semibold text-slate-300 flex-shrink-0">
              {user?.email?.[0]?.toUpperCase()}
            </div>
            <p className="text-[11px] text-slate-500 truncate">{user?.email}</p>
          </div>
          <button onClick={signOut} title="Se déconnecter"
            className="text-slate-600 hover:text-red-400 transition-colors flex-shrink-0">
            <LogoutIcon />
          </button>
        </div>
      </aside>

      {/* Bottom nav — mobile uniquement */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 z-20 flex h-14 safe-bottom">
        {([
          { p: 'today',    icon: <HomeIcon />,     label: 'Accueil' },
          { p: 'calls',    icon: <PhoneIcon />,    label: 'Appels' },
          { p: 'contacts', icon: <UserIcon />,     label: 'Contacts' },
          { p: 'stats',    icon: <ChartIcon />,    label: 'Stats' },
        ] as { p: Page; icon: React.ReactNode; label: string }[]).map(({ p, icon, label }) => (
          <button key={p} onClick={() => setPage(p)}
            className="flex-1 flex flex-col items-center justify-center gap-0.5 transition-colors"
            style={{ color: page === p ? accent : '#9CA3AF' }}>
            <span className="w-5 h-5">{icon}</span>
            <span className="text-[10px] font-medium">{label}</span>
          </button>
        ))}
      </nav>

      {/* Main */}
      <div className="flex-1 flex flex-col md:ml-56">
        {/* Topbar */}
        <header className="sticky top-0 z-10 bg-white border-b border-gray-200 flex items-center justify-between px-4 md:px-6 h-[52px]">
          <div className="flex items-center gap-3">
            <button className="md:hidden p-1.5 -ml-1 text-gray-500 hover:text-gray-700 transition-colors" onClick={() => setSidebarOpen(o => !o)}>
              <MenuIcon />
            </button>
            <span className="text-gray-700 font-medium text-sm">{PAGE_LABELS[page]}</span>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-xs px-3 py-1.5 rounded-full font-medium" style={{ background: accent + '15', color: accent }}>
              Essai — 7 jours
            </span>
          </div>
        </header>

        <main className="flex-1 p-4 md:p-6 overflow-y-auto overflow-x-hidden pb-20 md:pb-6">
          {page === 'today' && <TodayPage accent={accent} onNavigate={setPage} />}
          {page === 'calls' && <CallsPage accent={accent} />}
          {page === 'contacts' && <ContactsPage accent={accent} />}
          {page === 'agenda' && <AgendaPage accent={accent} onGoToIntegrations={() => setPage('integrations')} />}
          {page === 'stats' && <StatsPage accent={accent} />}
          {page === 'greeting' && <GreetingPage accent={accent} />}
          {page === 'inbound-reasons' && <InboundReasonsPage accent={accent} />}
          {page === 'outbound-reasons' && <OutboundReasonsPage accent={accent} />}
          {page === 'call-transfer' && <CallTransferPage accent={accent} />}
          {page === 'post-processing' && <PostProcessingPage accent={accent} />}
          {page === 'employees' && <EmployeesPage accent={accent} />}
          {page === 'business-details' && <BusinessDetailsPage accent={accent} uploadLogo={uploadLogo} />}
          {page === 'hours' && <HoursPage accent={accent} />}
          {page === 'assistant' && <AssistantPage accent={accent} />}
          {page === 'webhooks' && <WebhooksPage accent={accent} />}
          {page === 'integrations' && <IntegrationsPage accent={accent} />}
          {page === 'timezone' && <TimezonePage accent={accent} />}
          {page === 'subscription' && <SubscriptionPage accent={accent} />}
        </main>
      </div>
    </div>
  )
}

// ── Page Labels ───────────────────────────────────────────────────────────────
const PAGE_LABELS: Record<Page, string> = {
  today: "Aujourd'hui",
  calls: 'Appels',
  contacts: 'Contacts',
  agenda: 'Agenda',
  stats: 'Statistiques',
  greeting: 'Paramètres de salutation',
  'inbound-reasons': "Raisons d'appel entrantes",
  'outbound-reasons': "Raisons d'appel sortantes",
  'call-transfer': "Transfert d'appel",
  'post-processing': 'Post-traitement',
  employees: 'Employés',
  'business-details': "Détails de l'entreprise",
  hours: "Horaires d'ouverture",
  assistant: "Paramètres de l'assistante",
  webhooks: 'Webhooks',
  integrations: 'Intégrations',
  timezone: 'Fuseau horaire',
  subscription: 'Abonnement',
}

// ── Nav Components ────────────────────────────────────────────────────────────
function DarkNavItem({ icon, label, active, onClick, accent, indent = false }: { icon: React.ReactNode; label: string; active: boolean; onClick: () => void; accent: string; indent?: boolean }) {
  return (
    <button onClick={onClick}
      className={`w-full flex items-center gap-2.5 py-2 text-[13px] transition-colors border-l-2 ${indent ? 'pl-7 pr-4' : 'px-4'} ${
        active
          ? 'text-white font-medium bg-white/10'
          : 'text-slate-400 hover:text-slate-200 hover:bg-white/5 border-transparent'
      }`}
      style={active ? { borderLeftColor: accent } : {}}>
      <span className="w-3.5 h-3.5 flex-shrink-0 opacity-80">{icon}</span>
      <span className="truncate">{label}</span>
    </button>
  )
}

function SidebarGroup({ label, children, defaultOpen = false }: { label: string; children: React.ReactNode; defaultOpen?: boolean }) {
  const [open, setOpen] = useState(defaultOpen)
  return (
    <div className="mt-1">
      <button onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between px-4 py-2 text-[10px] font-semibold text-slate-600 uppercase tracking-widest hover:text-slate-400 transition-colors">
        <span>{label}</span>
        <span className={`transition-transform duration-200 ${open ? 'rotate-90' : ''}`}>
          <svg width="10" height="10" viewBox="0 0 10 10" fill="none"><path d="M3 2l4 3-4 3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>
        </span>
      </button>
      {open && <div>{children}</div>}
    </div>
  )
}

// ── Today Page ────────────────────────────────────────────────────────────────
function TodayPage({ accent, onNavigate }: { accent: string; onNavigate: (p: Page) => void }) {
  const { user } = useAuth()
  const { profile } = useProfile()
  const [calls, setCalls] = useState<CallRow[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!user) return
    supabase.from('calls').select('*').eq('artisan_id', user.id).order('created_at', { ascending: false }).limit(100)
      .then(({ data }) => { setCalls(data || []); setLoading(false) })
  }, [user])

  const hour = new Date().getHours()
  const greeting = hour < 12 ? 'Bonjour' : hour < 18 ? 'Bon après-midi' : 'Bonsoir'
  const today = new Date().toDateString()
  const todayCalls = calls.filter(c => new Date(c.created_at).toDateString() === today)
  const urgentCalls = calls.filter(c => c.status === 'urgent')
  const pendingCalls = calls.filter(c => c.status === 'pending')
  const recentCalls = calls.slice(0, 5)

  const fmtTime = (iso: string) => new Date(iso).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })
  const fmtDate = (iso: string) => {
    const diff = Date.now() - new Date(iso).getTime()
    const m = Math.floor(diff / 60000)
    if (m < 1) return "À l'instant"
    if (m < 60) return `${m} min`
    const h = Math.floor(m / 60)
    if (h < 24) return `${h}h`
    return new Date(iso).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })
  }

  return (
    <div className="flex flex-col gap-5">
      {/* ── Greeting ── */}
      <div className="flex items-start justify-between">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-widest text-gray-400 mb-0.5">
            {new Date().toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' })}
          </p>
          <h1 className="text-xl font-bold text-gray-900 tracking-tight">
            {greeting}, {profile?.company_name?.split(' ')[0] || 'artisan'} 👋
          </h1>
        </div>
        {urgentCalls.length > 0 && (
          <button onClick={() => onNavigate('calls')}
            className="flex items-center gap-1.5 bg-red-50 border border-red-100 rounded-xl px-3 py-1.5 flex-shrink-0">
            <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse" />
            <span className="text-xs font-semibold text-red-600">{urgentCalls.length} urgent{urgentCalls.length > 1 ? 's' : ''}</span>
          </button>
        )}
      </div>

      {/* ── Stats row ── */}
      {loading ? (
        <div className="flex gap-3">
          {[1,2,3].map(i => <div key={i} className="flex-1 h-20 bg-gray-100 rounded-2xl animate-pulse" />)}
        </div>
      ) : (
        <div className="grid grid-cols-3 gap-3">
          {[
            { label: "Aujourd'hui", value: todayCalls.length, sub: 'appels', color: accent },
            { label: 'À rappeler', value: urgentCalls.length + pendingCalls.length, sub: 'en attente', color: (urgentCalls.length + pendingCalls.length) > 0 ? '#EF4444' : '#10B981' },
            { label: 'Total', value: calls.length, sub: 'depuis toujours', color: '#6B7280' },
          ].map(s => (
            <div key={s.label} className="bg-white border border-gray-100 rounded-2xl px-4 py-3 shadow-sm">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-400 mb-1">{s.label}</p>
              <p className="text-2xl font-bold leading-none" style={{ color: s.color }}>{s.value}</p>
              <p className="text-[10px] text-gray-400 mt-0.5">{s.sub}</p>
            </div>
          ))}
        </div>
      )}

      {/* ── Urgent alert ── */}
      {urgentCalls.length > 0 && (
        <div className="bg-red-50 border border-red-100 rounded-2xl p-4">
          <div className="flex items-center justify-between mb-3">
            <p className="text-sm font-semibold text-red-700">À rappeler en priorité</p>
            <button onClick={() => onNavigate('calls')} className="text-xs font-medium text-red-500 hover:underline">Voir tout</button>
          </div>
          <div className="flex flex-col gap-2">
            {urgentCalls.slice(0,3).map(c => (
              <div key={c.id} className="flex items-center gap-3 bg-white rounded-xl px-3 py-2.5 border border-red-100">
                <div className="w-8 h-8 rounded-lg bg-red-100 flex items-center justify-center text-[11px] font-bold text-red-600 flex-shrink-0">
                  {(c.caller_name || '?').split(' ').map((w:string) => w[0]).join('').toUpperCase().slice(0,2)}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-[13px] text-gray-900 truncate">{c.caller_name || 'Inconnu'}</p>
                  <p className="text-[11px] text-gray-400 truncate">{c.reason || c.caller_phone || 'Demande générale'}</p>
                </div>
                <span className="text-[10px] text-red-400 flex-shrink-0">{fmtDate(c.created_at)}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Appels récents ── */}
      <div className="bg-white border border-gray-100 rounded-2xl shadow-sm overflow-hidden">
        <div className="flex items-center justify-between px-4 py-3.5 border-b border-gray-50">
          <p className="text-sm font-semibold text-gray-900">Appels récents</p>
          <button onClick={() => onNavigate('calls')} className="text-xs font-medium hover:underline" style={{ color: accent }}>
            Voir tout →
          </button>
        </div>
        {loading ? (
          <div className="flex items-center justify-center py-10">
            <div className="w-4 h-4 border-2 border-gray-200 border-t-transparent rounded-full animate-spin" style={{ borderTopColor: accent }} />
          </div>
        ) : recentCalls.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-10 text-center px-4">
            <p className="text-sm text-gray-400">Aucun appel pour l'instant</p>
            <p className="text-xs text-gray-300 mt-1">Mia vous notifiera dès le premier appel</p>
          </div>
        ) : (
          <div className="flex flex-col divide-y divide-gray-50">
            {recentCalls.map(c => {
              const sc = STATUS_COLORS[c.status] || STATUS_COLORS.new
              return (
                <div key={c.id} className="flex items-center gap-3 px-4 py-3"
                  style={{ borderLeftWidth: 3, borderLeftColor: sc.text }}>
                  <div className="w-9 h-9 rounded-xl flex items-center justify-center text-[11px] font-bold flex-shrink-0"
                    style={{ background: sc.bg, color: sc.text }}>
                    {(c.caller_name || '?').split(' ').map((w:string) => w[0]).join('').toUpperCase().slice(0,2)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-[13px] text-gray-900 truncate">{c.caller_name || 'Inconnu'}</p>
                    <p className="text-[11px] text-gray-400 truncate">{c.status === 'spam' ? 'Prospection' : (c.reason || 'Demande générale')}</p>
                  </div>
                  <div className="flex flex-col items-end gap-1 flex-shrink-0">
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded-full" style={{ background: sc.bg, color: sc.text }}>
                      {STATUS_LABELS[c.status] || c.status}
                    </span>
                    <span className="text-[10px] text-gray-400">{fmtTime(c.created_at)}</span>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* ── Assistante active ── */}
      <div className="bg-white border border-gray-100 rounded-2xl shadow-sm px-4 py-4 flex items-center gap-4">
        <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0" style={{ background: accent + '15' }}>
          <svg className="w-5 h-5" fill="none" stroke={accent} viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"/>
          </svg>
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-gray-900">{profile?.assistant_name || 'Mia'} est active</p>
          <p className="text-xs text-gray-400 mt-0.5">Répond à vos appels 24h/24, 7j/7</p>
        </div>
        <span className="flex items-center gap-1.5 text-xs font-semibold text-emerald-600 bg-emerald-50 border border-emerald-100 rounded-full px-2.5 py-1 flex-shrink-0">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
          En ligne
        </span>
      </div>
    </div>
  )
}

// ── Calls Page ────────────────────────────────────────────────────────────────
type CallRow = {
  id: string
  caller_name: string | null
  caller_phone: string | null
  caller_address: string | null
  summary: string | null
  transcript: string | null
  reason: string | null
  status: string
  duration_seconds: number | null
  created_at: string
}

const STATUS_LABELS: Record<string, string> = { new: 'Nouveau', pending: 'En attente', urgent: 'Urgent', done: 'Traité', spam: 'Spam' }
const STATUS_COLORS: Record<string, { bg: string; text: string }> = {
  urgent:  { bg: '#FEE2E2', text: '#B91C1C' },
  pending: { bg: '#FEF3C7', text: '#92400E' },
  new:     { bg: '#DBEAFE', text: '#1D4ED8' },
  done:    { bg: '#D1FAE5', text: '#065F46' },
  spam:    { bg: '#F3F4F6', text: '#6B7280' },
}

function parseTranscript(raw: string | null): { role: 'agent' | 'user'; text: string }[] {
  if (!raw) return []
  return raw.split('\n').filter(Boolean).map(line => {
    if (/^(AI|Agent|Assistant)\s*:/i.test(line)) return { role: 'agent' as const, text: line.replace(/^(AI|Agent|Assistant)\s*:\s*/i, '') }
    if (/^(User|Utilisateur|Client)\s*:/i.test(line)) return { role: 'user' as const, text: line.replace(/^(User|Utilisateur|Client)\s*:\s*/i, '') }
    return { role: 'agent' as const, text: line }
  })
}

function CopyBtn({ value }: { value: string }) {
  const [copied, setCopied] = useState(false)
  return (
    <button onClick={() => { navigator.clipboard.writeText(value); setCopied(true); setTimeout(() => setCopied(false), 1500) }}
      className="text-gray-300 hover:text-gray-500 transition-colors flex-shrink-0 ml-2">
      {copied
        ? <svg className="w-3.5 h-3.5 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7"/></svg>
        : <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><rect x="9" y="9" width="13" height="13" rx="2" strokeWidth={2}/><path strokeWidth={2} d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/></svg>}
    </button>
  )
}

function CallDetailPanel({ call: c, onClose, onStatusChange, accent }: { call: CallRow; onClose: () => void; onStatusChange: (id: string, s: string) => void; accent: string }) {
  const sc = STATUS_COLORS[c.status] || STATUS_COLORS.new
  const fmtAgo = (iso: string) => {
    const diff = Date.now() - new Date(iso).getTime()
    const m = Math.floor(diff / 60000)
    if (m < 1) return "à l'instant"
    if (m < 60) return `il y a ${m} min`
    const h = Math.floor(m / 60)
    if (h < 24) return `il y a ${h}h`
    return new Date(iso).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })
  }
  const fmtDur = (s: number | null) => {
    if (!s) return null
    const m = Math.floor(s / 60), sec = s % 60
    return `${String(m).padStart(2,'0')}:${String(sec).padStart(2,'0')}`
  }
  const lines = parseTranscript(c.transcript)

  return (
    <>
      {/* Overlay */}
      <div className="fixed inset-0 bg-black/20 z-30" onClick={onClose} />
      {/* Drawer */}
      <div className="fixed right-0 top-0 h-full w-full md:w-[440px] bg-white shadow-2xl z-40 flex flex-col overflow-hidden">
        {/* Header */}
        <div className="flex items-start justify-between px-5 py-4 border-b border-gray-100">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-9 h-9 rounded-full flex items-center justify-center text-sm font-semibold flex-shrink-0"
              style={{ background: accent + '20', color: accent }}>
              {(c.caller_name || '?').split(' ').map(w => w[0]).join('').toUpperCase().slice(0,2)}
            </div>
            <div className="min-w-0">
              <p className="font-semibold text-sm">{c.caller_name || 'Inconnu'}</p>
              {c.caller_phone && <p className="text-xs text-gray-400">{c.caller_phone}</p>}
            </div>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            {c.status !== 'spam' ? (
              <select value={c.status}
                onChange={e => onStatusChange(c.id, e.target.value)}
                className="text-[11px] font-semibold px-2.5 py-1 rounded-full border-0 cursor-pointer outline-none"
                style={{ background: sc.bg, color: sc.text }}>
                <option value="new">Nouveau</option>
                <option value="pending">En attente</option>
                <option value="urgent">Urgent</option>
                <option value="done">Traité</option>
              </select>
            ) : (
              <span className="text-[11px] font-semibold px-2.5 py-1 rounded-full" style={{ background: sc.bg, color: sc.text }}>Spam</span>
            )}
            <button onClick={onClose} className="text-gray-400 hover:text-gray-700 transition-colors">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12"/></svg>
            </button>
          </div>
        </div>

        {/* Meta */}
        <div className="flex items-center gap-4 px-5 py-2.5 border-b border-gray-100 bg-gray-50">
          <span className="flex items-center gap-1.5 text-xs text-gray-500">
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><path strokeLinecap="round" d="M12 6v6l4 2"/></svg>
            {fmtAgo(c.created_at)}
          </span>
          {fmtDur(c.duration_seconds) && (
            <span className="flex items-center gap-1.5 text-xs text-gray-500">
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z"/></svg>
              {fmtDur(c.duration_seconds)}
            </span>
          )}
        </div>

        {/* Scroll body */}
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-5">

          {/* Données extraites */}
          <section>
            <h3 className="text-sm font-semibold mb-3">Données extraites</h3>

            {/* Contact */}
            <div className="mb-3">
              <p className="text-[11px] font-semibold uppercase tracking-wider mb-2" style={{ color: accent }}>Contact</p>
              <div className="space-y-1.5">
                {c.caller_name && (
                  <div className="flex items-center justify-between bg-gray-50 rounded-lg px-3 py-2">
                    <div><span className="text-[10px] text-gray-400 block">Nom</span><span className="text-xs font-medium">{c.caller_name}</span></div>
                    <CopyBtn value={c.caller_name} />
                  </div>
                )}
                {c.caller_phone && (
                  <div className="flex items-center justify-between bg-gray-50 rounded-lg px-3 py-2">
                    <div><span className="text-[10px] text-gray-400 block">Téléphone</span><span className="text-xs font-medium">{c.caller_phone}</span></div>
                    <CopyBtn value={c.caller_phone} />
                  </div>
                )}
                {c.caller_address && (
                  <div className="flex items-center justify-between bg-gray-50 rounded-lg px-3 py-2">
                    <div><span className="text-[10px] text-gray-400 block">Adresse</span><span className="text-xs font-medium">{c.caller_address}</span></div>
                    <CopyBtn value={c.caller_address} />
                  </div>
                )}
              </div>
            </div>

            {/* Intervention */}
            {c.reason && (
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-wider mb-2" style={{ color: accent }}>Intervention</p>
                <div className="flex items-start justify-between bg-gray-50 rounded-lg px-3 py-2">
                  <div><span className="text-[10px] text-gray-400 block">Motif</span><span className="text-xs font-medium">{c.reason}</span></div>
                  <CopyBtn value={c.reason} />
                </div>
              </div>
            )}
          </section>

          {/* Résumé */}
          {c.summary && (
            <section>
              <h3 className="text-sm font-semibold mb-2">Résumé de l'appel</h3>
              <div className="bg-gray-50 rounded-lg px-3 py-3 text-xs text-gray-600 leading-relaxed border border-gray-100">
                {c.summary}
              </div>
            </section>
          )}

          {/* Transcription */}
          {lines.length > 0 && (
            <section>
              <h3 className="text-sm font-semibold mb-3">Transcription</h3>
              <div className="space-y-2">
                {lines.map((l, i) => (
                  <div key={i} className="flex gap-2">
                    <span className="text-[10px] font-semibold w-12 flex-shrink-0 pt-0.5" style={{ color: l.role === 'agent' ? accent : '#374151' }}>
                      {l.role === 'agent' ? 'Agent' : 'Client'}
                    </span>
                    <p className="text-xs text-gray-700 leading-relaxed">{l.text}</p>
                  </div>
                ))}
              </div>
            </section>
          )}
        </div>
      </div>
    </>
  )
}

function CallsPage({ accent }: { accent: string }) {
  const { user } = useAuth()
  const { profile } = useProfile()
  const [calls, setCalls] = useState<CallRow[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState<string>('all')
  const [selectedCall, setSelectedCall] = useState<CallRow | null>(null)

  useEffect(() => {
    if (!user) return
    setLoading(true)
    supabase.from('calls').select('*').eq('artisan_id', user.id).order('created_at', { ascending: false }).limit(50)
      .then(({ data }) => { setCalls(data || []); setLoading(false) })

    const sub = supabase.channel('calls-realtime')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'calls', filter: `artisan_id=eq.${user.id}` },
        payload => { setCalls(prev => [payload.new as CallRow, ...prev]) }
      )
      .subscribe()

    return () => { supabase.removeChannel(sub) }
  }, [user])

  const updateStatus = async (id: string, status: string) => {
    setCalls(prev => prev.map(c => c.id === id ? { ...c, status } : c))
    if (selectedCall?.id === id) setSelectedCall(prev => prev ? { ...prev, status } : null)
    await supabase.from('calls').update({ status }).eq('id', id)
  }

  const filtered = filter === 'all' ? calls : calls.filter(c => c.status === filter)
  const todayCalls = calls.filter(c => new Date(c.created_at).toDateString() === new Date().toDateString())
  const urgentCount = calls.filter(c => c.status === 'urgent').length

  const fmtRelative = (iso: string) => {
    const d = new Date(iso)
    const diff = Date.now() - d.getTime()
    const m = Math.floor(diff / 60000)
    if (m < 1) return 'À l\'instant'
    if (m < 60) return `${m} min`
    const h = Math.floor(m / 60)
    if (h < 24) return `${h}h`
    return d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })
  }

  const FILTER_CONFIG = [
    { key: 'all',     label: 'Tous',    dot: null },
    { key: 'new',     label: 'Nouveau', dot: STATUS_COLORS.new.text },
    { key: 'pending', label: 'En attente', dot: STATUS_COLORS.pending.text },
    { key: 'urgent',  label: 'Urgent',  dot: STATUS_COLORS.urgent.text },
    { key: 'done',    label: 'Traité',  dot: STATUS_COLORS.done.text },
    { key: 'spam',    label: 'Spam',    dot: '#9CA3AF' },
  ]

  return (
    <div className="flex flex-col h-full">
      {/* ── Header compact ── */}
      <div className="px-4 pt-5 pb-3 md:px-6 md:pt-6">
        <div className="flex items-end justify-between mb-4">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-widest text-gray-400 mb-0.5">Tableau de bord</p>
            <h1 className="text-xl font-bold text-gray-900 tracking-tight">Appels</h1>
          </div>
          {urgentCount > 0 && (
            <div className="flex items-center gap-1.5 bg-red-50 border border-red-100 rounded-xl px-3 py-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse" />
              <span className="text-xs font-semibold text-red-600">{urgentCount} urgent{urgentCount > 1 ? 's' : ''}</span>
            </div>
          )}
        </div>

        {/* Slim stats row */}
        <div className="flex gap-3 overflow-x-auto pb-1 -mx-4 px-4 md:mx-0 md:px-0 scrollbar-none">
          {[
            { label: "Aujourd'hui", value: todayCalls.length, sub: 'appels' },
            { label: 'Total',       value: calls.length,      sub: 'reçus' },
            { label: 'Urgents',     value: urgentCount,        sub: 'à rappeler', red: urgentCount > 0 },
            { label: 'Assistante',  value: profile?.assistant_name || 'Mia', sub: 'active 24/7', brand: true },
          ].map(s => (
            <div key={s.label} className="flex-shrink-0 flex flex-col bg-white border border-gray-100 rounded-2xl px-4 py-3 min-w-[100px] shadow-sm">
              <span className="text-[10px] font-semibold uppercase tracking-wider text-gray-400 mb-1">{s.label}</span>
              <span className={`text-lg font-bold leading-none ${s.red ? 'text-red-500' : s.brand ? '' : 'text-gray-900'}`}
                style={s.brand ? { color: accent } : {}}>
                {s.value}
              </span>
              <span className="text-[10px] text-gray-400 mt-0.5">{s.sub}</span>
            </div>
          ))}
        </div>
      </div>

      {/* ── Filter pills ── */}
      <div className="flex gap-2 overflow-x-auto px-4 md:px-6 pb-3 pt-1 scrollbar-none">
        {FILTER_CONFIG.map(f => {
          const active = filter === f.key
          return (
            <button key={f.key} onClick={() => setFilter(f.key)}
              className={`flex items-center gap-1.5 text-[12px] font-semibold px-3.5 py-1.5 rounded-full transition-all whitespace-nowrap flex-shrink-0 ${active ? 'shadow-sm' : 'bg-gray-100 text-gray-500 hover:bg-gray-200'}`}
              style={active ? { background: accent, color: '#fff' } : {}}>
              {f.dot && !active && <span className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ background: f.dot }} />}
              {f.label}
            </button>
          )
        })}
      </div>

      {/* ── List ── */}
      <div className="flex-1 px-4 md:px-6 pb-6">
        {loading ? (
          <div className="flex items-center justify-center py-16">
            <div className="w-5 h-5 border-2 border-gray-200 border-t-transparent rounded-full animate-spin" style={{ borderTopColor: accent }} />
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <div className="w-12 h-12 rounded-2xl bg-gray-50 flex items-center justify-center mb-3">
              <svg className="w-5 h-5 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z"/>
              </svg>
            </div>
            <p className="text-sm font-medium text-gray-400">Aucun appel</p>
            <p className="text-xs text-gray-300 mt-1">Ils apparaîtront ici dès que Mia aura traité un appel</p>
          </div>
        ) : (
          <>
            {/* Mobile */}
            <div className="md:hidden flex flex-col gap-2">
              {filtered.map(c => {
                const sc = STATUS_COLORS[c.status] || STATUS_COLORS.new
                const initials = (c.caller_name || '?').split(' ').map((w:string) => w[0]).join('').toUpperCase().slice(0,2)
                const isSpam = c.status === 'spam'
                return (
                  <div key={c.id} onClick={() => setSelectedCall(c)}
                    className="flex items-center gap-3 bg-white rounded-2xl border border-gray-100 px-4 py-3.5 cursor-pointer active:scale-[0.99] transition-all shadow-sm"
                    style={{ borderLeftWidth: 3, borderLeftColor: sc.text }}>
                    <div className="w-10 h-10 rounded-xl flex items-center justify-center text-[12px] font-bold flex-shrink-0"
                      style={{ background: isSpam ? '#F3F4F6' : (sc.bg), color: isSpam ? '#9CA3AF' : sc.text }}>
                      {initials}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className={`font-semibold text-[13px] truncate ${isSpam ? 'text-gray-400 line-through' : 'text-gray-900'}`}>
                        {c.caller_name || 'Inconnu'}
                      </p>
                      <p className="text-[11px] text-gray-400 truncate mt-0.5">
                        {isSpam ? 'Prospection commerciale' : (c.reason || c.caller_phone || 'Demande générale')}
                      </p>
                    </div>
                    <div className="flex flex-col items-end gap-1.5 flex-shrink-0">
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded-full" style={{ background: sc.bg, color: sc.text }}>
                        {STATUS_LABELS[c.status] || c.status}
                      </span>
                      <span className="text-[10px] text-gray-400">{fmtRelative(c.created_at)}</span>
                    </div>
                  </div>
                )
              })}
            </div>

            {/* Desktop */}
            <div className="hidden md:block bg-white border border-gray-100 rounded-2xl overflow-hidden shadow-sm">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-50 bg-gray-50/60">
                    <th className="text-left text-[11px] font-semibold text-gray-400 uppercase tracking-wider px-5 py-3 pr-4">Contact</th>
                    <th className="text-left text-[11px] font-semibold text-gray-400 uppercase tracking-wider py-3 pr-4">Motif</th>
                    <th className="text-left text-[11px] font-semibold text-gray-400 uppercase tracking-wider py-3 pr-4">Reçu</th>
                    <th className="text-left text-[11px] font-semibold text-gray-400 uppercase tracking-wider py-3">Statut</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map(c => {
                    const sc = STATUS_COLORS[c.status] || STATUS_COLORS.new
                    const isSpam = c.status === 'spam'
                    return (
                      <tr key={c.id} onClick={() => setSelectedCall(c)}
                        className="border-b border-gray-50 last:border-0 hover:bg-gray-50/60 cursor-pointer transition-colors"
                        style={{ borderLeftWidth: 3, borderLeftColor: sc.text }}>
                        <td className="py-3 px-5 pr-4">
                          <div className="flex items-center gap-2.5">
                            <div className="w-8 h-8 rounded-xl flex items-center justify-center text-[11px] font-bold flex-shrink-0"
                              style={{ background: isSpam ? '#F3F4F6' : sc.bg, color: isSpam ? '#9CA3AF' : sc.text }}>
                              {(c.caller_name || '?').split(' ').map((w:string) => w[0]).join('').toUpperCase().slice(0,2)}
                            </div>
                            <div>
                              <p className={`font-semibold text-[13px] ${isSpam ? 'text-gray-400 line-through' : ''}`}>{c.caller_name || 'Inconnu'}</p>
                              {c.caller_phone && <p className="text-[11px] text-gray-400">{c.caller_phone}</p>}
                            </div>
                          </div>
                        </td>
                        <td className="py-3 pr-4 text-[13px] text-gray-500 max-w-[200px] truncate">
                          {isSpam ? <span className="italic text-gray-400">Prospection commerciale</span> : (c.reason || 'Demande générale')}
                        </td>
                        <td className="py-3 pr-4 whitespace-nowrap">
                          <p className="text-[13px] text-gray-700 font-medium">{fmtRelative(c.created_at)}</p>
                          <p className="text-[11px] text-gray-400">{new Date(c.created_at).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}</p>
                        </td>
                        <td className="py-3">
                          <span className="text-[11px] font-bold px-2.5 py-1 rounded-full" style={{ background: sc.bg, color: sc.text }}>
                            {STATUS_LABELS[c.status] || c.status}
                          </span>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>

      {selectedCall && (
        <CallDetailPanel
          call={selectedCall}
          onClose={() => setSelectedCall(null)}
          onStatusChange={updateStatus}
          accent={accent}
        />
      )}
    </div>
  )
}

// ── Contacts Page ─────────────────────────────────────────────────────────────
type ContactRow = { id: string; name: string; phone: string | null; email: string | null; address: string | null; created_at: string; lastCallSummary?: string | null; lastCallDate?: string | null }

// Parseur CSV contacts (supporte : name/nom, phone/tel/téléphone, email/mail, address/adresse)
function parseCsv(text: string): { name: string; phone: string | null; email: string | null; address: string | null }[] {
  const lines = text.split(/\r?\n/).filter(l => l.trim())
  if (lines.length < 2) return []
  const sep = lines[0].includes(';') ? ';' : ','
  const headers = lines[0].split(sep).map(h => h.trim().toLowerCase().replace(/['"]/g, ''))
  const idx = (keys: string[]) => headers.findIndex(h => keys.some(k => h.includes(k)))
  const iName    = idx(['name', 'nom', 'full'])
  const iFirst   = idx(['first', 'prénom', 'prenom', 'firstname'])
  const iLast    = idx(['last', 'famille', 'lastname', 'surname'])
  const iPhone   = idx(['phone', 'tel', 'mobile', 'portable', 'numéro', 'numero'])
  const iEmail   = idx(['email', 'mail', 'courriel'])
  const iAddr    = idx(['address', 'adresse', 'addr'])
  return lines.slice(1).map(line => {
    const cols = line.split(sep).map(c => c.trim().replace(/^["']|["']$/g, ''))
    let name = ''
    if (iName >= 0 && cols[iName]) name = cols[iName]
    else if (iFirst >= 0 || iLast >= 0) {
      const first = iFirst >= 0 ? cols[iFirst] || '' : ''
      const last  = iLast  >= 0 ? cols[iLast]  || '' : ''
      name = `${first} ${last}`.trim()
    }
    return {
      name,
      phone:   iPhone >= 0 ? cols[iPhone]  || null : null,
      email:   iEmail  >= 0 ? cols[iEmail]  || null : null,
      address: iAddr   >= 0 ? cols[iAddr]   || null : null,
    }
  }).filter(c => c.name)
}

// Parseur VCF minimal
function parseVcf(text: string): { name: string; phone: string | null; email: string | null }[] {
  const cards = text.split(/BEGIN:VCARD/i).filter(c => c.includes('END:VCARD'))
  return cards.map(card => {
    const getName = () => {
      const fn = card.match(/^FN[^:]*:(.+)$/m)?.[1]?.trim()
      if (fn) return fn
      const n = card.match(/^N[^:]*:(.+)$/m)?.[1]?.trim()
      if (n) return n.split(';').filter(Boolean).reverse().join(' ')
      return ''
    }
    const phone = card.match(/^TEL[^:]*:(.+)$/m)?.[1]?.trim().replace(/\s+/g, '') || null
    const email = card.match(/^EMAIL[^:]*:(.+)$/m)?.[1]?.trim() || null
    return { name: getName(), phone, email }
  }).filter(c => c.name)
}

function ContactsPage({ accent }: { accent: string }) {
  const { user } = useAuth()
  const [contacts, setContacts] = useState<ContactRow[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [panelOpen, setPanelOpen] = useState(false)
  const [form, setForm] = useState({ name: '', phone: '', email: '', address: '' })
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [importing, setImporting] = useState(false)
  const [importResult, setImportResult] = useState<string | null>(null)
  useEffect(() => {
    if (!user) return
    Promise.all([
      supabase.rpc('get_contacts'),
      supabase.from('calls').select('caller_phone, summary, created_at').eq('artisan_id', user.id).order('created_at', { ascending: false })
    ]).then(([{ data: contactsData }, { data: callsData }]) => {
      const cts = (contactsData as ContactRow[]) || []
      const calls = callsData || []
      const enriched = cts.map(c => {
        const match = calls.find(call => call.caller_phone && c.phone && call.caller_phone === c.phone)
        return { ...c, lastCallSummary: match?.summary || null, lastCallDate: match?.created_at || null }
      })
      setContacts(enriched)
      setLoading(false)
    })
  }, [user])

  const filtered = contacts.filter(c =>
    c.name.toLowerCase().includes(search.toLowerCase()) ||
    (c.phone || '').includes(search) ||
    (c.email || '').toLowerCase().includes(search.toLowerCase())
  )

  const handleAdd = async () => {
    if (!user || !form.name.trim()) return
    setSaving(true); setSaveError(null)
    const { data, error } = await supabase.rpc('insert_contact', {
      p_name: form.name, p_phone: form.phone || null,
      p_email: form.email || null, p_address: form.address || null,
    })
    setSaving(false)
    if (error) { setSaveError(error.message); return }
    if (data) setContacts(prev => [...prev, data as ContactRow].sort((a, b) => a.name.localeCompare(b.name)))
    setForm({ name: '', phone: '', email: '', address: '' })
    setPanelOpen(false)
  }

  const handleDelete = async (id: string) => {
    setContacts(prev => prev.filter(c => c.id !== id))
    await supabase.from('contacts').delete().eq('id', id)
  }

  const [importingCsv, setImportingCsv] = useState(false)

  const importContacts = async (list: { name: string; phone: string | null; email: string | null; address?: string | null }[]) => {
    let added = 0
    for (const c of list) {
      const { error } = await supabase.rpc('insert_contact', {
        p_name: c.name, p_phone: c.phone || null, p_email: c.email || null, p_address: c.address || null,
      })
      if (!error) added++
    }
    const { data: contactsData } = await supabase.rpc('get_contacts')
    setContacts((contactsData as ContactRow[]) || [])
    setImportResult(`${added} contact${added > 1 ? 's' : ''} importé${added > 1 ? 's' : ''}`)
    setTimeout(() => setImportResult(null), 4000)
  }

  const handleVcfImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file || !user) return
    setImporting(true); setImportResult(null)
    const text = await file.text()
    await importContacts(parseVcf(text).map(c => ({ ...c, address: null })))
    setImporting(false)
    e.target.value = ''
  }

  const handleCsvImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file || !user) return
    setImportingCsv(true); setImportResult(null)
    const text = await file.text()
    await importContacts(parseCsv(text))
    setImportingCsv(false)
    e.target.value = ''
  }

  const initials = (name: string) => name.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2)

  return (
    <div className="flex flex-col gap-4">
      {/* ── Header ── */}
      <div className="flex items-end justify-between">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-widest text-gray-400 mb-0.5">Base clients</p>
          <h1 className="text-xl font-bold text-gray-900 tracking-tight">Contacts</h1>
        </div>
        <button onClick={() => { setPanelOpen(true); setForm({ name: '', phone: '', email: '', address: '' }) }}
          className="flex items-center gap-1.5 text-sm font-semibold text-white px-4 py-2 rounded-xl shadow-sm transition-opacity hover:opacity-90"
          style={{ background: accent }}>
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4"/></svg>
          Ajouter
        </button>
      </div>

      {/* ── Search + import bar ── */}
      <div className="bg-white border border-gray-100 rounded-2xl shadow-sm px-4 py-3 flex items-center gap-3 flex-wrap">
        <div className="flex items-center gap-2 flex-1 min-w-[160px]">
          <svg className="w-4 h-4 text-gray-300 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"/>
          </svg>
          <input placeholder="Rechercher un contact…" value={search} onChange={e => setSearch(e.target.value)}
            className="flex-1 text-sm outline-none placeholder-gray-300 bg-transparent" />
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          {importResult && <span className="text-xs text-emerald-600 font-semibold">✓ {importResult}</span>}
          <label className="text-xs px-3 py-1.5 rounded-xl border border-gray-200 text-gray-500 hover:bg-gray-50 cursor-pointer transition-colors flex items-center gap-1.5 font-medium">
            {importing ? <><div className="w-3 h-3 border border-gray-400 border-t-transparent rounded-full animate-spin"/>Import…</> : 'VCF'}
            <input type="file" accept=".vcf,.vcard" className="hidden" onChange={handleVcfImport} />
          </label>
          <label className="text-xs px-3 py-1.5 rounded-xl border border-gray-200 text-gray-500 hover:bg-gray-50 cursor-pointer transition-colors flex items-center gap-1.5 font-medium">
            {importingCsv ? <><div className="w-3 h-3 border border-gray-400 border-t-transparent rounded-full animate-spin"/>Import…</> : 'CSV'}
            <input type="file" accept=".csv" className="hidden" onChange={handleCsvImport} />
          </label>
        </div>
        <p className="w-full text-[11px] text-gray-400 -mt-1">{contacts.length} contact{contacts.length !== 1 ? 's' : ''}</p>
      </div>

      {/* ── List ── */}
      {loading ? (
        <div className="flex items-center justify-center py-16">
          <div className="w-5 h-5 border-2 border-gray-200 border-t-transparent rounded-full animate-spin" style={{ borderTopColor: accent }} />
        </div>
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <div className="w-12 h-12 rounded-2xl bg-gray-50 flex items-center justify-center mb-3">
            <svg className="w-5 h-5 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0"/>
            </svg>
          </div>
          <p className="text-sm font-medium text-gray-400">{search ? 'Aucun résultat' : 'Aucun contact'}</p>
          {!search && <p className="text-xs text-gray-300 mt-1">Importez un fichier VCF ou ajoutez manuellement</p>}
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {filtered.map(c => (
            <div key={c.id} className="group flex items-center gap-3 bg-white border border-gray-100 rounded-2xl px-4 py-3.5 shadow-sm transition-all hover:border-gray-200">
              <div className="w-10 h-10 rounded-xl flex items-center justify-center text-[12px] font-bold flex-shrink-0"
                style={{ background: accent + '15', color: accent }}>
                {initials(c.name)}
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-semibold text-[13px] text-gray-900 truncate">{c.name}</p>
                <p className="text-[11px] text-gray-400 mt-0.5 truncate">{[c.phone, c.email].filter(Boolean).join(' · ') || 'Aucune info'}</p>
              </div>
              <p className="text-[10px] text-gray-300 flex-shrink-0 hidden sm:block">{new Date(c.created_at).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })}</p>
              <button onClick={() => handleDelete(c.id)}
                className="opacity-0 group-hover:opacity-100 w-7 h-7 flex items-center justify-center rounded-lg text-gray-300 hover:text-red-500 hover:bg-red-50 transition-all flex-shrink-0 text-lg leading-none">
                ×
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Panneau nouveau contact */}
      {panelOpen && (
        <>
          <div className="fixed inset-0 bg-black/20 z-30" onClick={() => setPanelOpen(false)} />
          <div className="fixed right-0 top-0 h-full w-full md:w-[400px] bg-white shadow-2xl z-40 flex flex-col">
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
              <p className="text-sm font-semibold">Nouveau contact</p>
              <button onClick={() => setPanelOpen(false)}
                className="text-gray-400 hover:text-gray-700 transition-colors">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12"/></svg>
              </button>
            </div>
            <div className="flex-1 overflow-y-auto px-5 py-5 flex flex-col gap-4">
              <Field label="Nom complet *">
                <input autoFocus placeholder="Ex : Marie Dupont" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm outline-none focus:border-blue-400" />
              </Field>
              <Field label="Téléphone">
                <input placeholder="+33 6 00 00 00 00" value={form.phone} onChange={e => setForm(f => ({ ...f, phone: e.target.value }))}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm outline-none focus:border-blue-400" />
              </Field>
              <Field label="Adresse e-mail">
                <input placeholder="marie@exemple.fr" value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm outline-none focus:border-blue-400" />
              </Field>
              <Field label="Adresse postale">
                <input placeholder="12 rue de la Paix, Paris" value={form.address} onChange={e => setForm(f => ({ ...f, address: e.target.value }))}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm outline-none focus:border-blue-400" />
              </Field>
              <p className="text-[11px] text-gray-400">Vous pouvez aussi importer plusieurs contacts d'un coup depuis un fichier VCF (export depuis votre téléphone ou Google Contacts).</p>
            </div>
            {saveError && (
              <div className="mx-5 mb-2 px-3 py-2 bg-red-50 border border-red-200 rounded-lg text-xs text-red-600">
                Erreur : {saveError}
              </div>
            )}
            <div className="px-5 py-4 border-t border-gray-100 flex gap-3">
              <button onClick={() => setPanelOpen(false)} className="flex-1 py-2.5 rounded-lg border border-gray-200 text-sm text-gray-600 hover:bg-gray-50">Annuler</button>
              <button onClick={handleAdd} disabled={saving || !form.name.trim()}
                className="flex-1 py-2.5 rounded-lg text-white text-sm font-medium disabled:opacity-50 flex items-center justify-center gap-2"
                style={{ background: accent }}>
                {saving && <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />}
                Ajouter
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  )
}

// ── Greeting Page ─────────────────────────────────────────────────────────────
function GreetingPage({ accent }: { accent: string }) {
  const { profile, updateProfile } = useProfile()
  const [saved, setSaved] = useState(false)
  const [personalizedGreeting, setPersonalizedGreeting] = useState(true)

  if (!profile) return null

  const handleSave = async () => {
    await updateProfile({
      greeting_open: profile.greeting_open,
      greeting_closed: profile.greeting_closed,
    })
    setSaved(true)
    setTimeout(() => setSaved(false), 2500)
  }

  return (
    <div className="flex flex-col gap-4">
      <SettingsHeader section="Répondre" title="Salutation" />

      <Card>
        <div className="flex items-start justify-between gap-4 mb-3">
          <div>
            <p className="text-sm font-semibold">Heures d'ouverture</p>
            <p className="text-xs text-gray-400 mt-0.5">Message diffusé lors des appels pendant vos heures d'activité</p>
          </div>
          <button onClick={() => {}} className="text-xs px-3 py-1.5 rounded-xl border border-gray-200 text-gray-500 hover:bg-gray-50 flex items-center gap-1.5 flex-shrink-0 font-medium">
            <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 12 12"><polygon points="3,1 11,6 3,11"/></svg>
            Écouter
          </button>
        </div>
        <textarea
          value={profile.greeting_open || ''}
          onChange={e => updateProfile({ greeting_open: e.target.value })}
          rows={4}
          placeholder="Ex : Bonjour, vous avez bien joint l'entreprise Dupont Plomberie. Je suis Mia, l'assistante de Marc. Comment puis-je vous aider ?"
          className="w-full border border-gray-100 rounded-xl px-3 py-2.5 text-sm outline-none focus:border-gray-300 resize-none bg-gray-50/60"
        />
      </Card>

      <Card>
        <div className="flex items-start justify-between gap-4 mb-3">
          <div>
            <p className="text-sm font-semibold">Hors heures d'ouverture</p>
            <p className="text-xs text-gray-400 mt-0.5">Message diffusé en dehors de vos horaires d'activité</p>
          </div>
          <button onClick={() => {}} className="text-xs px-3 py-1.5 rounded-xl border border-gray-200 text-gray-500 hover:bg-gray-50 flex items-center gap-1.5 flex-shrink-0 font-medium">
            <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 12 12"><polygon points="3,1 11,6 3,11"/></svg>
            Écouter
          </button>
        </div>
        <textarea
          value={profile.greeting_closed || ''}
          onChange={e => updateProfile({ greeting_closed: e.target.value })}
          rows={4}
          placeholder="Ex : Bonjour, vous avez bien joint l'entreprise Dupont Plomberie. Nous sommes actuellement fermés. Laissez-moi votre message et nous vous rappellerons dès que possible."
          className="w-full border border-gray-100 rounded-xl px-3 py-2.5 text-sm outline-none focus:border-gray-300 resize-none bg-gray-50/60"
        />
      </Card>

      <Card>
        <ToggleRow label="Salutation personnalisée" desc="L'assistante utilise le prénom du client s'il est connu" defaultOn={personalizedGreeting} accent={accent} />
      </Card>

      <Card>
        <p className="text-sm font-semibold mb-1">Message de fin d'appel</p>
        <p className="text-xs text-gray-400 mb-3">Diffusé automatiquement à la fin de chaque conversation</p>
        <input
          defaultValue="Merci pour votre appel. Bonne journée !"
          className="w-full border border-gray-100 rounded-xl px-3 py-2.5 text-sm outline-none focus:border-gray-300 bg-gray-50/60"
        />
      </Card>

      <div className="flex justify-end items-center gap-3">
        {saved && <span className="text-xs text-emerald-600 font-semibold">✓ Enregistré</span>}
        <button onClick={handleSave} className="text-sm px-5 py-2.5 rounded-xl text-white font-semibold shadow-sm hover:opacity-90 transition-opacity" style={{ background: accent }}>
          Enregistrer
        </button>
      </div>
    </div>
  )
}

// ── Inbound Reasons Page ──────────────────────────────────────────────────────
type CallReason = { id: number; label: string; desc: string; on: boolean }

function InboundReasonsPage({ accent }: { accent: string }) {
  const [reasons, setReasons] = useState<CallReason[]>([
    { id: 1, label: 'Demande générale', desc: 'Collecte le motif, le nom et le numéro du client', on: true },
  ])
  const [showAdd, setShowAdd] = useState(false)
  const [newLabel, setNewLabel] = useState('')
  const [newDesc, setNewDesc] = useState('')

  const toggle = (id: number) => setReasons(prev => prev.map(r => r.id === id ? { ...r, on: !r.on } : r))
  const remove = (id: number) => setReasons(prev => prev.filter(r => r.id !== id))
  const add = () => {
    if (!newLabel.trim()) return
    setReasons(prev => [...prev, { id: Date.now(), label: newLabel, desc: newDesc, on: true }])
    setNewLabel(''); setNewDesc(''); setShowAdd(false)
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-end justify-between">
        <SettingsHeader section="Répondre" title="Raisons entrantes" />
        <button onClick={() => setShowAdd(true)} className="text-sm px-4 py-2 rounded-xl text-white font-semibold shadow-sm hover:opacity-90 transition-opacity mb-5 flex-shrink-0" style={{ background: accent }}>
          + Ajouter
        </button>
      </div>

      <Card>
        {reasons.length === 0 && !showAdd ? (
          <div className="flex flex-col items-center justify-center py-10 text-center">
            <div className="w-10 h-10 rounded-2xl bg-gray-50 flex items-center justify-center mb-3">
              <svg className="w-5 h-5 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z"/></svg>
            </div>
            <p className="text-sm font-medium text-gray-400">Aucune raison configurée</p>
            <p className="text-xs text-gray-300 mt-1">Ajoutez des motifs pour guider l'assistante</p>
          </div>
        ) : (
          <div className="flex flex-col divide-y divide-gray-50">
            {reasons.map(r => (
              <div key={r.id} className="flex items-center gap-4 py-3.5">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-gray-900">{r.label}</p>
                  {r.desc && <p className="text-xs text-gray-400 mt-0.5">{r.desc}</p>}
                </div>
                <Toggle defaultOn={r.on} accent={accent} onChange={() => toggle(r.id)} />
                <button onClick={() => remove(r.id)} className="w-7 h-7 flex items-center justify-center rounded-lg text-gray-300 hover:text-red-500 hover:bg-red-50 transition-all text-lg leading-none ml-1">×</button>
              </div>
            ))}
          </div>
        )}

        {showAdd && (
          <div className="mt-4 pt-4 border-t border-gray-100 flex flex-col gap-3">
            <Field label="Intitulé de la raison">
              <input autoFocus value={newLabel} onChange={e => setNewLabel(e.target.value)}
                placeholder="Ex : Demande de devis"
                className="w-full border border-gray-100 rounded-xl px-3 py-2.5 text-sm outline-none focus:border-gray-300 bg-gray-50/60" />
            </Field>
            <Field label="Description (optionnel)">
              <input value={newDesc} onChange={e => setNewDesc(e.target.value)}
                placeholder="Ex : L'assistante collecte le motif et planifie un rappel"
                className="w-full border border-gray-100 rounded-xl px-3 py-2.5 text-sm outline-none focus:border-gray-300 bg-gray-50/60" />
            </Field>
            <div className="flex gap-2 justify-end">
              <button onClick={() => setShowAdd(false)} className="text-xs px-4 py-2 rounded-xl border border-gray-200 text-gray-500 font-medium">Annuler</button>
              <button onClick={add} className="text-xs px-4 py-2 rounded-xl text-white font-semibold" style={{ background: accent }}>Ajouter</button>
            </div>
          </div>
        )}
      </Card>
    </div>
  )
}

// ── Outbound Reasons Page ─────────────────────────────────────────────────────
function OutboundReasonsPage({ accent }: { accent: string }) {
  const [reasons, setReasons] = useState<CallReason[]>([])
  const [showAdd, setShowAdd] = useState(false)
  const [newLabel, setNewLabel] = useState('')
  const [newDesc, setNewDesc] = useState('')

  const remove = (id: number) => setReasons(prev => prev.filter(r => r.id !== id))
  const toggle = (id: number) => setReasons(prev => prev.map(r => r.id === id ? { ...r, on: !r.on } : r))
  const add = () => {
    if (!newLabel.trim()) return
    setReasons(prev => [...prev, { id: Date.now(), label: newLabel, desc: newDesc, on: true }])
    setNewLabel(''); setNewDesc(''); setShowAdd(false)
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-end justify-between">
        <SettingsHeader section="Répondre" title="Raisons sortantes" />
        <button onClick={() => setShowAdd(true)} className="text-sm px-4 py-2 rounded-xl text-white font-semibold shadow-sm hover:opacity-90 transition-opacity mb-5 flex-shrink-0" style={{ background: accent }}>
          + Ajouter
        </button>
      </div>

      <Card>
        {reasons.length === 0 && !showAdd ? (
          <div className="flex flex-col items-center justify-center py-10 text-center">
            <div className="w-10 h-10 rounded-2xl bg-gray-50 flex items-center justify-center mb-3">
              <svg className="w-5 h-5 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M16 3h5m0 0v5m0-5l-6 6M5 3a2 2 0 00-2 2v1c0 8.284 6.716 15 15 15h1a2 2 0 002-2v-3.28a1 1 0 00-.684-.948l-4.493-1.498a1 1 0 00-1.21.502l-1.13 2.257a11.042 11.042 0 01-5.516-5.517l2.257-1.128a1 1 0 00.502-1.21L9.228 3.683A1 1 0 008.279 3H5z"/></svg>
            </div>
            <p className="text-sm font-medium text-gray-400">Aucune raison configurée</p>
            <p className="text-xs text-gray-300 mt-1">Ajoutez des motifs pour que l'assistante rappelle vos clients</p>
          </div>
        ) : (
          <div className="flex flex-col divide-y divide-gray-50">
            {reasons.map(r => (
              <div key={r.id} className="flex items-center gap-4 py-3.5">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-gray-900">{r.label}</p>
                  {r.desc && <p className="text-xs text-gray-400 mt-0.5">{r.desc}</p>}
                </div>
                <Toggle defaultOn={r.on} accent={accent} onChange={() => toggle(r.id)} />
                <button onClick={() => remove(r.id)} className="w-7 h-7 flex items-center justify-center rounded-lg text-gray-300 hover:text-red-500 hover:bg-red-50 transition-all text-lg leading-none ml-1">×</button>
              </div>
            ))}
          </div>
        )}

        {showAdd && (
          <div className="mt-4 pt-4 border-t border-gray-100 flex flex-col gap-3">
            <Field label="Intitulé de la raison">
              <input autoFocus value={newLabel} onChange={e => setNewLabel(e.target.value)}
                placeholder="Ex : Rappel devis envoyé"
                className="w-full border border-gray-100 rounded-xl px-3 py-2.5 text-sm outline-none focus:border-gray-300 bg-gray-50/60" />
            </Field>
            <Field label="Description (optionnel)">
              <input value={newDesc} onChange={e => setNewDesc(e.target.value)}
                placeholder="Ex : L'assistante rappelle le client 48h après l'envoi du devis"
                className="w-full border border-gray-100 rounded-xl px-3 py-2.5 text-sm outline-none focus:border-gray-300 bg-gray-50/60" />
            </Field>
            <div className="flex gap-2 justify-end">
              <button onClick={() => setShowAdd(false)} className="text-xs px-4 py-2 rounded-xl border border-gray-200 text-gray-500 font-medium">Annuler</button>
              <button onClick={add} className="text-xs px-4 py-2 rounded-xl text-white font-semibold" style={{ background: accent }}>Ajouter</button>
            </div>
          </div>
        )}
      </Card>
    </div>
  )
}

// ── Call Transfer Page ────────────────────────────────────────────────────────
function CallTransferPage({ accent }: { accent: string }) {
  const [externalTransfer, setExternalTransfer] = useState(false)
  const [externalNumber, setExternalNumber] = useState('')
  const [transferToEmployees, setTransferToEmployees] = useState(false)
  const [interEmployeeTransfer, setInterEmployeeTransfer] = useState(false)

  return (
    <div className="flex flex-col gap-4">
      <SettingsHeader section="Répondre" title="Transfert d'appel" />

      <Card>
        <ToggleRow label="Transfert externe" desc="Transférer les appels vers un numéro de téléphone externe" defaultOn={externalTransfer} accent={accent} />
        {externalTransfer && (
          <div className="mt-3 pt-3 border-t border-gray-50">
            <Field label="Numéro de destination">
              <input value={externalNumber} onChange={e => setExternalNumber(e.target.value)}
                placeholder="+33 6 00 00 00 00"
                className="w-full border border-gray-100 rounded-xl px-3 py-2.5 text-sm outline-none focus:border-gray-300 bg-gray-50/60 mt-1" />
            </Field>
          </div>
        )}
      </Card>

      <Card>
        <p className="text-sm font-semibold mb-1">Plages horaires actives</p>
        <p className="text-xs text-gray-400 mb-4">Le transfert n'est actif que pendant ces créneaux</p>
        <div className="flex flex-col gap-3">
          {['Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi', 'Dimanche'].map((day, i) => (
            <div key={day} className="flex items-center gap-4">
              <span className="text-sm font-medium text-gray-600 w-24 flex-shrink-0">{day}</span>
              {i < 5 ? (
                <div className="flex items-center gap-2 text-xs text-gray-500">
                  <input type="time" defaultValue="09:00" className="border border-gray-100 rounded-xl px-2.5 py-1.5 text-xs text-center outline-none focus:border-gray-300 bg-gray-50/60" />
                  <span className="text-gray-300">—</span>
                  <input type="time" defaultValue="18:00" className="border border-gray-100 rounded-xl px-2.5 py-1.5 text-xs text-center outline-none focus:border-gray-300 bg-gray-50/60" />
                </div>
              ) : (
                <span className="text-xs font-medium text-gray-300">Fermé</span>
              )}
            </div>
          ))}
        </div>
      </Card>

      <Card>
        <ToggleRow label="Transférer vers les employés" desc="L'assistante transfère l'appel vers un employé disponible" defaultOn={transferToEmployees} accent={accent} />
        {transferToEmployees && (
          <p className="text-xs text-gray-400 pt-3 mt-3 border-t border-gray-50">Ajoutez d'abord des employés dans la section "Employés"</p>
        )}
      </Card>

      <Card>
        <ToggleRow label="Transfert entre employés" desc="Permettre aux employés de se transférer des appels" defaultOn={interEmployeeTransfer} accent={accent} />
      </Card>
    </div>
  )
}

// ── Post Processing Page ──────────────────────────────────────────────────────
function PostProcessingPage({ accent }: { accent: string }) {
  const { profile, updateProfile } = useProfile()
  const [emailNotif, setEmailNotif] = useState(true)
  const [saved, setSaved] = useState(false)

  if (!profile) return null

  const handleSave = async () => {
    await updateProfile({ email: profile.email })
    setSaved(true)
    setTimeout(() => setSaved(false), 2500)
  }

  return (
    <div className="flex flex-col gap-4">
      <SettingsHeader section="Répondre" title="Post-traitement" />

      <Card>
        <ToggleRow label="Email de notification" desc="Recevez un résumé de chaque appel par email dès la fin de la conversation" defaultOn={emailNotif} accent={accent} />
        {emailNotif && (
          <div className="mt-3 pt-3 border-t border-gray-50">
            <Field label="Adresse email">
              <input
                value={profile.email || ''}
                onChange={e => updateProfile({ email: e.target.value })}
                placeholder="votre@email.fr"
                className="w-full border border-gray-100 rounded-xl px-3 py-2.5 text-sm outline-none focus:border-gray-300 bg-gray-50/60 mt-1"
              />
            </Field>
          </div>
        )}
      </Card>

      <Card>
        <p className="text-sm font-semibold mb-1">Contenu du résumé</p>
        <p className="text-xs text-gray-400 mb-3">Choisissez ce qui est inclus dans chaque email</p>
        <ToggleRow label="Nom du client" desc="Nom et numéro de téléphone" defaultOn={true} accent={accent} />
        <ToggleRow label="Résumé de l'appel" desc="Synthèse générée automatiquement par l'IA" defaultOn={true} accent={accent} />
        <ToggleRow label="Durée de l'appel" desc="Durée totale de la conversation" defaultOn={true} accent={accent} />
        <ToggleRow label="Niveau d'urgence" desc="Indique si l'appel a été classé comme urgent" defaultOn={true} accent={accent} />
      </Card>

      <div className="flex justify-end items-center gap-3">
        {saved && <span className="text-xs text-emerald-600 font-semibold">✓ Enregistré</span>}
        <button onClick={handleSave} className="text-sm px-5 py-2.5 rounded-xl text-white font-semibold shadow-sm hover:opacity-90 transition-opacity" style={{ background: accent }}>
          Enregistrer
        </button>
      </div>
    </div>
  )
}

// ── Employees Page ────────────────────────────────────────────────────────────
type Employee = { id: number; name: string; email: string; phone: string; role: string }

function EmployeesPage({ accent }: { accent: string }) {
  const [employees, setEmployees] = useState<Employee[]>([])
  const [showAdd, setShowAdd] = useState(false)
  const [form, setForm] = useState({ name: '', email: '', phone: '', role: '' })

  const add = () => {
    if (!form.name.trim()) return
    setEmployees(prev => [...prev, { id: Date.now(), ...form }])
    setForm({ name: '', email: '', phone: '', role: '' })
    setShowAdd(false)
  }

  const remove = (id: number) => setEmployees(prev => prev.filter(e => e.id !== id))
  const initials = (name: string) => name.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2)

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-end justify-between">
        <SettingsHeader section="Répondre" title="Employés" />
        <button onClick={() => setShowAdd(true)} className="text-sm px-4 py-2 rounded-xl text-white font-semibold shadow-sm hover:opacity-90 transition-opacity mb-5 flex-shrink-0" style={{ background: accent }}>
          + Ajouter
        </button>
      </div>

      <Card>
        {employees.length === 0 && !showAdd ? (
          <div className="flex flex-col items-center justify-center py-10 text-center">
            <div className="w-10 h-10 rounded-2xl bg-gray-50 flex items-center justify-center mb-3">
              <svg className="w-5 h-5 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z"/></svg>
            </div>
            <p className="text-sm font-medium text-gray-400">Aucun employé</p>
            <p className="text-xs text-gray-300 mt-1">Ajoutez vos collaborateurs pour activer le transfert d'appels</p>
          </div>
        ) : (
          <div className="flex flex-col divide-y divide-gray-50">
            {employees.map(emp => (
              <div key={emp.id} className="group flex items-center gap-3 py-3.5">
                <div className="w-10 h-10 rounded-xl flex items-center justify-center text-[12px] font-bold flex-shrink-0"
                  style={{ background: accent + '15', color: accent }}>
                  {initials(emp.name)}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-gray-900">{emp.name}</p>
                  <p className="text-xs text-gray-400 mt-0.5">{[emp.role, emp.phone].filter(Boolean).join(' · ')}</p>
                </div>
                <button onClick={() => remove(emp.id)} className="opacity-0 group-hover:opacity-100 w-7 h-7 flex items-center justify-center rounded-lg text-gray-300 hover:text-red-500 hover:bg-red-50 transition-all text-lg leading-none">×</button>
              </div>
            ))}
          </div>
        )}

        {showAdd && (
          <div className="mt-4 pt-4 border-t border-gray-100 flex flex-col gap-3">
            <div className="grid grid-cols-2 gap-3">
              <Field label="Nom complet *">
                <input autoFocus value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                  placeholder="Marie Dupont"
                  className="w-full border border-gray-100 rounded-xl px-3 py-2.5 text-sm outline-none focus:border-gray-300 bg-gray-50/60" />
              </Field>
              <Field label="Rôle / Poste">
                <input value={form.role} onChange={e => setForm(f => ({ ...f, role: e.target.value }))}
                  placeholder="Plombier, Commercial…"
                  className="w-full border border-gray-100 rounded-xl px-3 py-2.5 text-sm outline-none focus:border-gray-300 bg-gray-50/60" />
              </Field>
              <Field label="Email">
                <input value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))}
                  placeholder="marie@entreprise.fr"
                  className="w-full border border-gray-100 rounded-xl px-3 py-2.5 text-sm outline-none focus:border-gray-300 bg-gray-50/60" />
              </Field>
              <Field label="Téléphone">
                <input value={form.phone} onChange={e => setForm(f => ({ ...f, phone: e.target.value }))}
                  placeholder="+33 6 00 00 00 00"
                  className="w-full border border-gray-100 rounded-xl px-3 py-2.5 text-sm outline-none focus:border-gray-300 bg-gray-50/60" />
              </Field>
            </div>
            <div className="flex gap-2 justify-end">
              <button onClick={() => setShowAdd(false)} className="text-xs px-4 py-2 rounded-xl border border-gray-200 text-gray-500 font-medium">Annuler</button>
              <button onClick={add} className="text-xs px-4 py-2 rounded-xl text-white font-semibold" style={{ background: accent }}>Ajouter</button>
            </div>
          </div>
        )}
      </Card>
    </div>
  )
}

// ── Business Details Page ─────────────────────────────────────────────────────
function BusinessDetailsPage({ accent, uploadLogo: _uploadLogo }: { accent: string; uploadLogo: (f: File) => Promise<string | null> }) {
  const { profile, updateProfile } = useProfile()
  const [skills, setSkills] = useState<string[]>(['Plomberie', 'Chauffage'])
  const [newSkill, setNewSkill] = useState('')
  const [postalCodes, setPostalCodes] = useState<Array<{ code: string; radius: number }>>([])
  const [newPostal, setNewPostal] = useState('')
  const [saved, setSaved] = useState(false)

  if (!profile) return null

  const addSkill = () => {
    if (!newSkill.trim()) return
    setSkills(prev => [...prev, newSkill.trim()])
    setNewSkill('')
  }

  const addPostal = () => {
    if (!newPostal.trim()) return
    setPostalCodes(prev => [...prev, { code: newPostal.trim(), radius: 10 }])
    setNewPostal('')
  }

  const handleSave = async () => {
    await updateProfile({
      company_name: profile.company_name,
      address: profile.address,
      company_type: profile.company_type,
      email: profile.email,
      phone: profile.phone,
    })
    setSaved(true)
    setTimeout(() => setSaved(false), 2500)
  }

  const callStatuses = [
    { label: 'Nouveau', color: 'bg-blue-100 text-blue-700' },
    { label: 'En cours', color: 'bg-amber-100 text-amber-700' },
    { label: 'Traité', color: 'bg-emerald-100 text-emerald-700' },
  ]

  const inputCls = 'w-full border border-gray-100 rounded-xl px-3 py-2.5 text-sm outline-none focus:border-gray-300 bg-gray-50/60'

  return (
    <div className="flex flex-col gap-4">
      <SettingsHeader section="Plateforme" title="Détails entreprise" />

      <Card>
        <p className="text-sm font-semibold mb-4">Informations générales</p>
        <div className="grid grid-cols-2 gap-4">
          <Field label="Nom de l'entreprise">
            <input value={profile.company_name || ''} onChange={e => updateProfile({ company_name: e.target.value })} className={inputCls} />
          </Field>
          <Field label="Type d'activité">
            <select value={profile.company_type || ''} onChange={e => updateProfile({ company_type: e.target.value })} className={inputCls}>
              <option value="">Sélectionner…</option>
              {['Plomberie / Chauffage / Climatisation', 'Électricité / Solaire', 'Services à domicile', 'Menuiserie / Charpenterie', 'Peinture / Décoration', 'Serrurerie', 'Jardinage / Paysagisme', 'Autre'].map(t => <option key={t}>{t}</option>)}
            </select>
          </Field>
          <Field label="Adresse">
            <input value={profile.address || ''} onChange={e => updateProfile({ address: e.target.value })} placeholder="12 rue de la Paix, 75001 Paris" className={inputCls} />
          </Field>
          <Field label="Téléphone">
            <input value={profile.phone || ''} onChange={e => updateProfile({ phone: e.target.value })} placeholder="+33 6 00 00 00 00" className={inputCls} />
          </Field>
          <Field label="Email">
            <input value={profile.email || ''} onChange={e => updateProfile({ email: e.target.value })} placeholder="contact@entreprise.fr" className={inputCls} />
          </Field>
          <Field label="Site web">
            <input defaultValue="" placeholder="https://www.monentreprise.fr" className={inputCls} />
          </Field>
        </div>
        <div className="mt-4">
          <Field label="Description de l'entreprise">
            <textarea defaultValue="" placeholder="Décrivez votre activité, vos spécialités et votre zone d'intervention…" rows={3}
              className="w-full border border-gray-100 rounded-xl px-3 py-2.5 text-sm outline-none focus:border-gray-300 resize-none bg-gray-50/60" />
          </Field>
        </div>
      </Card>

      <Card>
        <p className="text-sm font-semibold mb-1">Compétences</p>
        <p className="text-xs text-gray-400 mb-3">Vos domaines d'expertise communiqués aux clients lors des appels</p>
        <div className="flex flex-wrap gap-2">
          {skills.map((s, i) => (
            <div key={i} className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-full font-semibold" style={{ background: accent + '15', color: accent }}>
              {s}
              <button onClick={() => setSkills(prev => prev.filter((_, idx) => idx !== i))} className="hover:opacity-60 leading-none">×</button>
            </div>
          ))}
          <div className="flex items-center gap-1.5">
            <input value={newSkill} onChange={e => setNewSkill(e.target.value)} onKeyDown={e => e.key === 'Enter' && addSkill()}
              placeholder="Ajouter…"
              className="text-xs border border-dashed border-gray-200 rounded-full px-3 py-1.5 outline-none focus:border-gray-400 w-36 bg-transparent" />
            <button onClick={addSkill} className="text-xs px-2.5 py-1.5 rounded-full text-white font-bold" style={{ background: accent }}>+</button>
          </div>
        </div>
      </Card>

      <Card>
        <p className="text-sm font-semibold mb-1">Zone d'intervention</p>
        <p className="text-xs text-gray-400 mb-3">Codes postaux couverts avec rayon d'intervention</p>
        <div className="flex flex-col gap-2 mb-3">
          {postalCodes.map((pc, i) => (
            <div key={i} className="flex items-center gap-3 px-3 py-2.5 bg-gray-50/60 border border-gray-100 rounded-xl">
              <span className="text-sm font-semibold flex-1">{pc.code}</span>
              <select value={pc.radius} onChange={e => setPostalCodes(prev => prev.map((p, idx) => idx === i ? { ...p, radius: +e.target.value } : p))}
                className="text-xs border border-gray-100 rounded-lg px-2 py-1 outline-none bg-white">
                {[5, 10, 15, 20, 30, 50].map(r => <option key={r} value={r}>{r} km</option>)}
              </select>
              <button onClick={() => setPostalCodes(prev => prev.filter((_, idx) => idx !== i))} className="text-gray-300 hover:text-red-500 text-lg leading-none">×</button>
            </div>
          ))}
        </div>
        <div className="flex gap-2">
          <input value={newPostal} onChange={e => setNewPostal(e.target.value)} onKeyDown={e => e.key === 'Enter' && addPostal()}
            placeholder="Ex : 75001"
            className="flex-1 border border-gray-100 rounded-xl px-3 py-2.5 text-sm outline-none focus:border-gray-300 bg-gray-50/60" />
          <button onClick={addPostal} className="text-sm px-4 py-2 rounded-xl text-white font-semibold" style={{ background: accent }}>+ Ajouter</button>
        </div>
      </Card>

      <div className="flex justify-end items-center gap-3">
        {saved && <span className="text-xs text-emerald-600 font-semibold">✓ Enregistré</span>}
        <button onClick={handleSave} className="text-sm px-5 py-2.5 rounded-xl text-white font-semibold shadow-sm hover:opacity-90 transition-opacity" style={{ background: accent }}>
          Enregistrer
        </button>
      </div>
    </div>
  )
}

// ── Hours Page ────────────────────────────────────────────────────────────────
type DaySlot = { day: string; open: string; close: string; on: boolean }

const DEFAULT_HOURS: DaySlot[] = [
  { day: 'Lundi', open: '09:00', close: '18:00', on: true },
  { day: 'Mardi', open: '09:00', close: '18:00', on: true },
  { day: 'Mercredi', open: '09:00', close: '18:00', on: true },
  { day: 'Jeudi', open: '09:00', close: '18:00', on: true },
  { day: 'Vendredi', open: '09:00', close: '18:00', on: true },
  { day: 'Samedi', open: '09:00', close: '12:00', on: false },
  { day: 'Dimanche', open: '', close: '', on: false },
]

function HoursPage({ accent }: { accent: string }) {
  const { profile, updateProfile } = useProfile()
  const [days, setDays] = useState<DaySlot[]>(() => {
    try { return (profile as any)?.hours ? JSON.parse((profile as any).hours) : DEFAULT_HOURS }
    catch { return DEFAULT_HOURS }
  })
  const [saved, setSaved] = useState(false)

  const updateDay = (i: number, field: keyof DaySlot, value: string | boolean) => {
    setDays(prev => prev.map((d, idx) => idx === i ? { ...d, [field]: value } : d))
  }

  const handleSave = async () => {
    await updateProfile({ hours: JSON.stringify(days) } as any)
    setSaved(true)
    setTimeout(() => setSaved(false), 2500)
  }

  return (
    <div className="flex flex-col gap-4">
      <SettingsHeader section="Plateforme" title="Horaires" />

      <Card>
        <div className="flex flex-col gap-3">
          {days.map((d, i) => (
            <div key={d.day} className="flex items-center gap-3 py-1">
              <span className="text-sm font-semibold text-gray-700 w-24 flex-shrink-0">{d.day}</span>
              {d.on ? (
                <div className="flex items-center gap-2 flex-1">
                  <input type="time" value={d.open} onChange={e => updateDay(i, 'open', e.target.value)}
                    className="border border-gray-100 rounded-xl px-2.5 py-1.5 text-xs text-center outline-none focus:border-gray-300 bg-gray-50/60" />
                  <span className="text-gray-300 text-xs">—</span>
                  <input type="time" value={d.close} onChange={e => updateDay(i, 'close', e.target.value)}
                    className="border border-gray-100 rounded-xl px-2.5 py-1.5 text-xs text-center outline-none focus:border-gray-300 bg-gray-50/60" />
                </div>
              ) : (
                <span className="text-sm font-medium text-gray-300 flex-1">Fermé</span>
              )}
              <button onClick={() => updateDay(i, 'on', !d.on)}
                className="relative w-9 h-5 rounded-full transition-colors flex-shrink-0"
                style={{ background: d.on ? accent : '#D1D5DB' }}>
                <span className={`absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform ${d.on ? 'translate-x-[18px]' : 'translate-x-0.5'}`} />
              </button>
            </div>
          ))}
        </div>
      </Card>

      <div className="flex justify-end items-center gap-3">
        {saved && <span className="text-xs text-emerald-600 font-semibold">✓ Enregistré</span>}
        <button onClick={handleSave} className="text-sm px-5 py-2.5 rounded-xl text-white font-semibold shadow-sm hover:opacity-90 transition-opacity" style={{ background: accent }}>
          Enregistrer
        </button>
      </div>
    </div>
  )
}

// ── Assistant Page ────────────────────────────────────────────────────────────
function formatFrPhone(e164: string): string {
  const local = e164.replace('+33', '0')
  return local.replace(/(\d{2})(?=\d)/g, '$1 ').trim()
}

function AssistantPage({ accent }: { accent: string }) {
  const { profile, updateProfile } = useProfile()
  const [saved, setSaved] = useState(false)
  const [extraLangs, setExtraLangs] = useState<string[]>([])
  const [updating, setUpdating] = useState(false)
  const [updateMsg, setUpdateMsg] = useState<string | null>(null)
  const [copiedCode, setCopiedCode] = useState<string | null>(null)

  function copyCode(code: string) {
    navigator.clipboard.writeText(code)
    setCopiedCode(code)
    setTimeout(() => setCopiedCode(null), 2000)
  }

  if (!profile) return null

  const handleSave = async () => {
    await updateProfile({ assistant_name: profile.assistant_name, assistant_voice: profile.assistant_voice })
    setSaved(true)
    setTimeout(() => setSaved(false), 2500)
  }

  const handleUpdateAssistant = async () => {
    const { data: { session } } = await supabase.auth.getSession()
    if (!session?.access_token) return
    setUpdating(true); setUpdateMsg(null)
    try {
      const res = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/provision-artisan`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${session.access_token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ force_update: true }),
      })
      const data = await res.json()
      setUpdateMsg(data.updated ? '✓ Mia mise à jour avec les nouveaux outils' : data.success ? '✓ Déjà à jour' : 'Erreur lors de la mise à jour')
    } catch {
      setUpdateMsg('Erreur réseau')
    }
    setUpdating(false)
    setTimeout(() => setUpdateMsg(null), 4000)
  }

  const availableLangs = ['Anglais', 'Espagnol', 'Allemand', 'Italien', 'Portugais', 'Arabe']

  const inputCls2 = 'w-full border border-gray-100 rounded-xl px-3 py-2.5 text-sm outline-none focus:border-gray-300 bg-gray-50/60'

  return (
    <div className="flex flex-col gap-4">
      <SettingsHeader section="Plateforme" title="Mon assistante" />

      <Card>
        <p className="text-sm font-semibold mb-4">Identité</p>
        <div className="grid grid-cols-2 gap-4">
          <Field label="Prénom de l'assistante">
            <input value={profile.assistant_name || ''} onChange={e => updateProfile({ assistant_name: e.target.value })}
              placeholder="Mia" className={inputCls2} />
          </Field>
          <Field label="Type de voix">
            <select value={profile.assistant_voice || ''} onChange={e => updateProfile({ assistant_voice: e.target.value })} className={inputCls2}>
              {['Féminin conviviale', 'Féminin professionnelle', 'Féminin énergique', 'Masculin convivial', 'Masculin professionnel'].map(v => (
                <option key={v} value={v}>{v}</option>
              ))}
            </select>
          </Field>
        </div>
      </Card>

      <Card>
        <p className="text-sm font-semibold mb-4">Langue</p>
        <div className="grid grid-cols-2 gap-4 mb-4">
          <Field label="Langue principale">
            <select defaultValue="Français" className={inputCls2}>
              <option>Français</option><option>Anglais</option><option>Espagnol</option>
            </select>
          </Field>
        </div>
        <Field label="Langues supplémentaires">
          <div className="flex flex-wrap gap-2 mt-1">
            {extraLangs.map((lang, i) => (
              <div key={i} className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-full font-semibold" style={{ background: accent + '15', color: accent }}>
                {lang}
                <button onClick={() => setExtraLangs(prev => prev.filter((_, idx) => idx !== i))} className="hover:opacity-60 leading-none">×</button>
              </div>
            ))}
            {availableLangs.filter(l => !extraLangs.includes(l)).map(lang => (
              <button key={lang} onClick={() => setExtraLangs(prev => [...prev, lang])}
                className="text-xs px-3 py-1.5 rounded-full border border-dashed border-gray-200 text-gray-400 hover:border-gray-400 transition-colors">
                + {lang}
              </button>
            ))}
          </div>
        </Field>
      </Card>

      <Card>
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-semibold">Prévisualisation de la voix</p>
            <p className="text-xs text-gray-400 mt-0.5">Écoutez un exemple avec les paramètres actuels</p>
          </div>
          <button className="text-xs px-4 py-2 rounded-xl border border-gray-200 text-gray-500 hover:bg-gray-50 flex items-center gap-2 font-medium">
            <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 12 12"><polygon points="3,1 11,6 3,11"/></svg>
            Écouter
          </button>
        </div>
      </Card>

        {/* Renvoi d'appel */}
        <Card>
          <p className="text-sm font-semibold mb-1">Renvoi d'appel vers Mia</p>
          <p className="text-xs text-gray-400 mb-4">Composez l'un de ces codes depuis votre téléphone pour rediriger vos appels vers votre assistante.</p>

          {profile.twilio_number ? (
            <>
              {/* Numéro Mia */}
              <div className="rounded-xl border-2 p-4 mb-4 text-center" style={{ borderColor: accent + '30', background: accent + '06' }}>
                <p className="text-[10px] font-semibold uppercase tracking-widest mb-1" style={{ color: accent }}>Votre numéro Fixlyy</p>
                <p className="text-2xl font-bold tracking-wide text-gray-900">{formatFrPhone(profile.twilio_number)}</p>
                <p className="text-xs text-gray-400 mt-0.5">Mia répond sur ce numéro</p>
              </div>

              {/* Codes USSD */}
              <div className="flex flex-col gap-3">
                {[
                  { label: 'Renvoi total', desc: 'Tous vos appels → Mia (recommandé)', code: `**21*${profile.twilio_number}#`, badge: true },
                  { label: 'Si occupé',    desc: 'Quand vous êtes déjà en ligne',       code: `**67*${profile.twilio_number}#`, badge: false },
                  { label: 'Si pas de réponse', desc: 'Quand vous ne décrochez pas',    code: `**61*${profile.twilio_number}#`, badge: false },
                ].map(opt => (
                  <div key={opt.code} className="border border-gray-200 rounded-xl p-3.5">
                    <div className="flex items-center gap-2 mb-2">
                      <p className="text-xs font-semibold text-gray-800">{opt.label}</p>
                      {opt.badge && (
                        <span className="text-[10px] font-bold px-2 py-0.5 rounded-full text-white" style={{ background: accent }}>Recommandé</span>
                      )}
                      <p className="text-xs text-gray-400 ml-auto">{opt.desc}</p>
                    </div>
                    <div className="flex items-center gap-2 bg-gray-50 rounded-lg px-3 py-2">
                      <code className="text-sm font-mono text-gray-700 flex-1">{opt.code}</code>
                      <button onClick={() => copyCode(opt.code)}
                        className="text-xs font-medium px-2.5 py-1 rounded-md transition-all flex-shrink-0"
                        style={{ background: copiedCode === opt.code ? '#10b981' : accent + '15', color: copiedCode === opt.code ? 'white' : accent }}>
                        {copiedCode === opt.code ? '✓ Copié' : 'Copier'}
                      </button>
                    </div>
                  </div>
                ))}
              </div>

              <div className="mt-3 p-3 bg-gray-50 rounded-xl text-xs text-gray-500">
                <span className="font-semibold">Comment faire :</span> composez le code depuis votre téléphone et appuyez sur Appel. Actif immédiatement.
                <span className="block mt-1 text-gray-400">Pour annuler tous les renvois : <code className="font-mono bg-white px-1.5 py-0.5 rounded border border-gray-200">##002#</code></span>
              </div>
            </>
          ) : (
            <div className="text-center py-4 text-sm text-gray-400">Numéro Mia en cours d'attribution…</div>
          )}
        </Card>

      <div className="flex justify-between items-center">
        <div className="flex items-center gap-3">
          {updateMsg && <span className={`text-xs font-semibold ${updateMsg.startsWith('✓') ? 'text-emerald-600' : 'text-red-500'}`}>{updateMsg}</span>}
          <button onClick={handleUpdateAssistant} disabled={updating}
            className="text-xs px-4 py-2.5 rounded-xl border border-gray-200 text-gray-500 hover:bg-gray-50 flex items-center gap-1.5 disabled:opacity-50 font-medium">
            {updating ? <><div className="w-3 h-3 border border-gray-400 border-t-transparent rounded-full animate-spin" />Mise à jour…</> : '↑ Synchroniser Mia'}
          </button>
        </div>
        <div className="flex items-center gap-3">
          {saved && <span className="text-xs text-emerald-600 font-semibold">✓ Enregistré</span>}
          <button onClick={handleSave} className="text-sm px-5 py-2.5 rounded-xl text-white font-semibold shadow-sm hover:opacity-90 transition-opacity" style={{ background: accent }}>
            Enregistrer
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Webhooks Page ─────────────────────────────────────────────────────────────
type Webhook = { id: number; url: string; events: string[]; active: boolean }

function WebhooksPage({ accent }: { accent: string }) {
  const [webhooks, setWebhooks] = useState<Webhook[]>([])
  const [showAdd, setShowAdd] = useState(false)
  const [form, setForm] = useState({ url: '', events: [] as string[] })

  const eventOptions = ['end-of-call-report', 'status-update', 'call-started', 'call-ended']

  const add = () => {
    if (!form.url.trim()) return
    setWebhooks(prev => [...prev, { id: Date.now(), url: form.url, events: form.events, active: true }])
    setForm({ url: '', events: [] })
    setShowAdd(false)
  }

  const toggleEvent = (ev: string) => {
    setForm(f => ({
      ...f,
      events: f.events.includes(ev) ? f.events.filter(e => e !== ev) : [...f.events, ev]
    }))
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-end justify-between">
        <SettingsHeader section="Plateforme" title="Webhooks" />
        <button onClick={() => setShowAdd(true)} className="text-sm px-4 py-2 rounded-xl text-white font-semibold shadow-sm hover:opacity-90 transition-opacity mb-5 flex-shrink-0" style={{ background: accent }}>
          + Créer
        </button>
      </div>

      <Card>
        {webhooks.length === 0 && !showAdd ? (
          <div className="flex flex-col items-center justify-center py-10 text-center">
            <div className="w-10 h-10 rounded-2xl bg-gray-50 flex items-center justify-center mb-3">
              <svg className="w-5 h-5 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z"/></svg>
            </div>
            <p className="text-sm font-medium text-gray-400">Aucun webhook configuré</p>
            <p className="text-xs text-gray-300 mt-1">Recevez des données en temps réel lors de chaque appel</p>
          </div>
        ) : (
          <div className="flex flex-col divide-y divide-gray-50">
            {webhooks.map(wh => (
              <div key={wh.id} className="py-3.5 flex items-center gap-3">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-mono text-gray-700 truncate">{wh.url}</p>
                  <div className="flex gap-1.5 mt-1.5 flex-wrap">
                    {wh.events.map(ev => (
                      <span key={ev} className="text-[10px] px-2 py-0.5 rounded-full bg-gray-100 text-gray-500 font-medium">{ev}</span>
                    ))}
                  </div>
                </div>
                <span className={`text-[11px] font-semibold px-2.5 py-1 rounded-full flex-shrink-0 ${wh.active ? 'bg-emerald-100 text-emerald-700' : 'bg-gray-100 text-gray-500'}`}>
                  {wh.active ? 'Actif' : 'Inactif'}
                </span>
                <button onClick={() => setWebhooks(prev => prev.filter(w => w.id !== wh.id))} className="text-gray-300 hover:text-red-500 text-lg leading-none flex-shrink-0">×</button>
              </div>
            ))}
          </div>
        )}

        {showAdd && (
          <div className="mt-4 pt-4 border-t border-gray-100 flex flex-col gap-4">
            <Field label="URL du webhook">
              <input autoFocus value={form.url} onChange={e => setForm(f => ({ ...f, url: e.target.value }))}
                placeholder="https://votre-serveur.com/webhook"
                className="w-full border border-gray-100 rounded-xl px-3 py-2.5 text-sm outline-none focus:border-gray-300 font-mono bg-gray-50/60" />
            </Field>
            <div>
              <label className="text-xs font-medium text-gray-500 block mb-2">Événements à écouter</label>
              <div className="flex flex-wrap gap-2">
                {eventOptions.map(ev => (
                  <button key={ev} onClick={() => toggleEvent(ev)}
                    className={`text-xs px-3 py-1.5 rounded-full border transition-colors font-medium ${form.events.includes(ev) ? 'text-white border-transparent' : 'border-gray-200 text-gray-500 hover:border-gray-300'}`}
                    style={form.events.includes(ev) ? { background: accent } : {}}>
                    {ev}
                  </button>
                ))}
              </div>
            </div>
            <div className="flex gap-2 justify-end">
              <button onClick={() => setShowAdd(false)} className="text-xs px-4 py-2 rounded-xl border border-gray-200 text-gray-500 font-medium">Annuler</button>
              <button onClick={add} className="text-xs px-4 py-2 rounded-xl text-white font-semibold" style={{ background: accent }}>Créer le webhook</button>
            </div>
          </div>
        )}
      </Card>
    </div>
  )
}

// ── Integrations Page ─────────────────────────────────────────────────────────
function IntegrationsPage({ accent }: { accent: string }) {
  const { profile, updateProfile } = useProfile()
  const [apiKey] = useState<string | null>(null)
  const [apiKeyGenerated, setApiKeyGenerated] = useState(false)
  const [generatedKey, setGeneratedKey] = useState('')
  const [calUrl, setCalUrl] = useState(profile?.onboarding_calendar || '')
  const [calSaved, setCalSaved] = useState(false)
  const [authorizedDomains, setAuthorizedDomains] = useState<string[]>([])
  const [newDomain, setNewDomain] = useState('')
  const [copied, setCopied] = useState(false)

  const saveCalUrl = async () => {
    // Normaliser l'URL : s'assurer qu'elle commence par https://
    let normalized = calUrl.trim()
    if (normalized && !/^https?:\/\//i.test(normalized)) {
      normalized = 'https://' + normalized.replace(/^https?:\/*/i, '')
    }
    if (normalized !== calUrl) setCalUrl(normalized)
    await updateProfile({ onboarding_calendar: normalized || null } as any)
    setCalSaved(true)
    setTimeout(() => setCalSaved(false), 2500)
  }

  const generateKey = () => {
    const key = 'fix_' + Array.from({ length: 32 }, () => Math.random().toString(36)[2]).join('')
    setGeneratedKey(key)
    setApiKeyGenerated(true)
  }

  const copyKey = () => {
    navigator.clipboard.writeText(generatedKey)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const addDomain = () => {
    if (!newDomain.trim()) return
    setAuthorizedDomains(prev => [...prev, newDomain.trim()])
    setNewDomain('')
  }

  return (
    <div className="flex flex-col gap-4">
      <SettingsHeader section="Plateforme" title="Intégrations" />

      <Card>
        <div className="flex items-center gap-4">
          <div className="w-10 h-10 rounded-2xl border border-gray-100 bg-gray-50 flex items-center justify-center text-lg flex-shrink-0">🧩</div>
          <div className="flex-1">
            <p className="text-sm font-semibold">Widget Fixlyy</p>
            <p className="text-xs text-gray-400 mt-0.5">Bouton d'appel direct sur votre site web</p>
          </div>
          <span className="text-[11px] font-semibold px-2.5 py-1 rounded-full bg-gray-100 text-gray-400">Non configuré</span>
        </div>
        <div className="mt-4 pt-4 border-t border-gray-50">
          <p className="text-xs text-gray-400 mb-2">Copiez ce code dans le <code className="bg-gray-100 px-1.5 py-0.5 rounded-lg text-gray-600">&lt;head&gt;</code> de votre site</p>
          <div className="bg-gray-900 rounded-xl px-4 py-3 font-mono text-xs text-gray-300 relative">
            {'<script src="https://widget.fixlyy.fr/v1.js" data-key="YOUR_KEY"></script>'}
            <button className="absolute top-2 right-2 text-[10px] text-gray-400 hover:text-white px-2 py-1 rounded-lg bg-gray-700 font-medium">Copier</button>
          </div>
        </div>
      </Card>

      <Card>
        <p className="text-sm font-semibold mb-1">Clé API</p>
        <p className="text-xs text-gray-400 mb-3">Intégrez Fixlyy dans vos propres applications</p>
        {!apiKeyGenerated && !apiKey ? (
          <button onClick={generateKey} className="text-sm px-4 py-2 rounded-xl text-white font-semibold" style={{ background: accent }}>
            Générer une clé API
          </button>
        ) : (
          <div className="flex items-center gap-2">
            <div className="flex-1 bg-gray-50/60 border border-gray-100 rounded-xl px-3 py-2.5 font-mono text-xs text-gray-600 overflow-hidden">
              {generatedKey || apiKey}
            </div>
            <button onClick={copyKey} className={`text-xs px-3 py-2.5 rounded-xl border transition-colors font-medium ${copied ? 'border-emerald-200 text-emerald-600 bg-emerald-50' : 'border-gray-200 text-gray-500 hover:bg-gray-50'}`}>
              {copied ? '✓ Copié' : 'Copier'}
            </button>
          </div>
        )}
      </Card>

      <Card>
        <p className="text-sm font-semibold mb-1">Domaines autorisés</p>
        <p className="text-xs text-gray-400 mb-3">Seuls ces domaines peuvent utiliser votre clé API et widget</p>
        <div className="flex flex-col gap-2 mb-3">
          {authorizedDomains.map((domain, i) => (
            <div key={i} className="flex items-center justify-between px-3 py-2.5 bg-gray-50/60 border border-gray-100 rounded-xl">
              <span className="text-sm font-mono text-gray-700">{domain}</span>
              <button onClick={() => setAuthorizedDomains(prev => prev.filter((_, idx) => idx !== i))} className="text-gray-300 hover:text-red-500 text-lg leading-none">×</button>
            </div>
          ))}
        </div>
        <div className="flex gap-2">
          <input value={newDomain} onChange={e => setNewDomain(e.target.value)} onKeyDown={e => e.key === 'Enter' && addDomain()}
            placeholder="ex : monsite.fr"
            className="flex-1 border border-gray-100 rounded-xl px-3 py-2.5 text-sm outline-none focus:border-gray-300 bg-gray-50/60" />
          <button onClick={addDomain} className="text-sm px-4 py-2 rounded-xl text-white font-semibold" style={{ background: accent }}>+ Ajouter</button>
        </div>
      </Card>

      <Card>
        <div className="flex items-center gap-4 mb-4">
          <div className="w-10 h-10 rounded-2xl border border-gray-100 bg-gray-50 flex items-center justify-center text-lg flex-shrink-0">📅</div>
          <div className="flex-1">
            <p className="text-sm font-semibold">Cal.com — Prise de RDV</p>
            <p className="text-xs text-gray-400 mt-0.5">Votre assistante partage votre lien aux clients qui demandent un créneau</p>
          </div>
          <span className={`text-[11px] font-semibold px-2.5 py-1 rounded-full flex-shrink-0 ${profile?.onboarding_calendar ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'}`}>
            {profile?.onboarding_calendar ? 'Connecté' : 'À configurer'}
          </span>
        </div>

        {!profile?.onboarding_calendar && (
          <div className="mb-4 p-3.5 bg-gray-50/60 border border-gray-100 rounded-xl text-xs text-gray-600 space-y-1.5">
            <p className="font-semibold text-gray-700 mb-2">3 étapes pour activer la prise de RDV :</p>
            {[
              <>Créez un compte gratuit sur <a href="https://cal.com" target="_blank" rel="noreferrer" className="underline font-medium" style={{ color: accent }}>cal.com</a></>,
              <>Dans Cal.com, allez dans <strong>Partager</strong> et copiez votre lien</>,
              <>Collez-le ci-dessous et enregistrez</>,
            ].map((step, i) => (
              <p key={i} className="flex items-start gap-2">
                <span className="inline-flex items-center justify-center w-4 h-4 rounded-full text-white text-[10px] font-bold flex-shrink-0 mt-0.5" style={{ background: accent }}>{i+1}</span>
                <span>{step}</span>
              </p>
            ))}
          </div>
        )}

        <Field label="Votre lien Cal.com">
          <input value={calUrl} onChange={e => setCalUrl(e.target.value)}
            placeholder="https://cal.com/votre-nom"
            className="w-full border border-gray-100 rounded-xl px-3 py-2.5 text-sm outline-none focus:border-gray-300 bg-gray-50/60 mt-1" />
        </Field>
        <div className="flex items-center justify-between mt-3">
          <p className="text-xs text-gray-400">{profile?.onboarding_calendar ? "Lien actif · l'assistante l'utilise déjà" : 'Optionnel'}</p>
          <div className="flex items-center gap-2">
            {calSaved && <span className="text-xs text-emerald-600 font-semibold">✓ Enregistré</span>}
            <button onClick={saveCalUrl} disabled={calUrl === (profile?.onboarding_calendar || '')}
              className="text-xs px-3 py-2 rounded-xl text-white font-semibold disabled:opacity-40 transition-opacity"
              style={{ background: accent }}>
              Enregistrer
            </button>
          </div>
        </div>
      </Card>
    </div>
  )
}

// ── Timezone Page ─────────────────────────────────────────────────────────────
function TimezonePage({ accent }: { accent: string }) {
  const [timezone, setTimezone] = useState('Europe/Paris')
  const [saved, setSaved] = useState(false)

  const timezones = [
    { value: 'Europe/Paris', label: 'Heure d\'Europe centrale — CET/CEST (UTC+1/+2)' },
    { value: 'Europe/London', label: 'Heure du Royaume-Uni — GMT/BST (UTC+0/+1)' },
    { value: 'Europe/Berlin', label: 'Heure d\'Europe centrale — CET/CEST (UTC+1/+2)' },
    { value: 'Europe/Madrid', label: 'Heure d\'Europe centrale — CET/CEST (UTC+1/+2)' },
    { value: 'America/New_York', label: 'Heure de l\'Est — EST/EDT (UTC-5/-4)' },
    { value: 'America/Los_Angeles', label: 'Heure du Pacifique — PST/PDT (UTC-8/-7)' },
    { value: 'UTC', label: 'Temps universel coordonné — UTC (UTC+0)' },
  ]

  const now = new Date()
  const localTime = now.toLocaleTimeString('fr-FR', { timeZone: timezone, hour: '2-digit', minute: '2-digit' })
  const localDate = now.toLocaleDateString('fr-FR', { timeZone: timezone, weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })

  return (
    <div className="flex flex-col gap-4">
      <SettingsHeader section="Plateforme" title="Fuseau horaire" />

      <Card>
        <div className="flex items-center justify-between mb-3">
          <div className="flex-1 mr-4">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-400 mb-0.5">Heure actuelle</p>
            <p className="text-2xl font-bold text-gray-900 leading-none">{localTime}</p>
            <p className="text-xs text-gray-400 mt-1 capitalize">{localDate}</p>
          </div>
          <div className="w-12 h-12 rounded-2xl flex items-center justify-center text-xl bg-gray-50 border border-gray-100 flex-shrink-0">🌍</div>
        </div>
        <div className="mt-3 pt-3 border-t border-gray-50">
          <Field label="Fuseau horaire">
            <select value={timezone} onChange={e => setTimezone(e.target.value)}
              className="w-full border border-gray-100 rounded-xl px-3 py-2.5 text-sm outline-none focus:border-gray-300 bg-gray-50/60 mt-1">
              {timezones.map(tz => <option key={tz.value} value={tz.value}>{tz.label}</option>)}
            </select>
          </Field>
        </div>
      </Card>

      <Card>
        <p className="text-sm font-semibold mb-3">Ce fuseau affecte</p>
        <div className="flex flex-col gap-2">
          {[
            { icon: '🕐', label: "Horaires d'ouverture", desc: 'Vos plages horaires sont interprétées dans ce fuseau' },
            { icon: '📧', label: 'Notifications email', desc: "Les résumés d'appels affichent l'heure locale" },
            { icon: '📋', label: "Logs d'appels", desc: 'Les horodatages des appels utilisent ce fuseau' },
          ].map((item, i) => (
            <div key={i} className="flex items-start gap-3 px-3.5 py-3 bg-gray-50/60 border border-gray-100 rounded-xl">
              <span className="text-base flex-shrink-0">{item.icon}</span>
              <div>
                <p className="text-sm font-semibold text-gray-800">{item.label}</p>
                <p className="text-xs text-gray-400 mt-0.5">{item.desc}</p>
              </div>
            </div>
          ))}
        </div>
      </Card>

      <div className="flex justify-end items-center gap-3">
        {saved && <span className="text-xs text-emerald-600 font-semibold">✓ Enregistré</span>}
        <button onClick={() => { setSaved(true); setTimeout(() => setSaved(false), 2500) }}
          className="text-sm px-5 py-2.5 rounded-xl text-white font-semibold shadow-sm hover:opacity-90 transition-opacity" style={{ background: accent }}>
          Enregistrer
        </button>
      </div>
    </div>
  )
}

// ── Subscription Page ─────────────────────────────────────────────────────────
function SubscriptionPage({ accent }: { accent: string }) {
  const { user } = useAuth()
  const { profile } = useProfile()
  const [callCount, setCallCount] = useState<number | null>(null)
  const [monthCallCount, setMonthCallCount] = useState<number | null>(null)
  const [selected, setSelected] = useState<number | null>(null)
  const [checkoutLoading, setCheckoutLoading] = useState(false)
  const [checkoutError, setCheckoutError] = useState('')

  // Calcul de l'essai
  const TRIAL_DAYS = 7
  const trialStart = user?.created_at ? new Date(user.created_at) : new Date()
  const trialEnd = new Date(trialStart); trialEnd.setDate(trialEnd.getDate() + TRIAL_DAYS)
  const now = new Date()
  const daysLeft = Math.max(0, Math.ceil((trialEnd.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)))
  const isTrialActive = now < trialEnd
  const trialPct = Math.min(100, Math.round(((now.getTime() - trialStart.getTime()) / (trialEnd.getTime() - trialStart.getTime())) * 100))
  const hasPaid = !!profile?.stripe_customer_id

  useEffect(() => {
    if (!user) return
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).toISOString()
    Promise.all([
      supabase.from('calls').select('id', { count: 'exact', head: true }).eq('artisan_id', user.id),
      supabase.from('calls').select('id', { count: 'exact', head: true }).eq('artisan_id', user.id).gte('created_at', startOfMonth),
    ]).then(([{ count: total }, { count: month }]) => {
      setCallCount(total ?? 0)
      setMonthCallCount(month ?? 0)
    })
  }, [user])

  const plans = [
    { id: 0, name: 'Solo',   price: 79,  priceId: 'price_1TJv9uB5dBerNSsDbvCQFO2P', desc: '150 appels inclus · 1 artisan',   features: ['Secrétaire IA 24/7', 'Email résumé après appel', 'Prise de RDV', 'Support email'] },
    { id: 1, name: 'Pro',    price: 149, priceId: 'price_1TJv9uB5dBerNSsDpOIyE2UP', desc: 'Appels illimités · 1 artisan',     features: ['Tout Solo inclus', 'Appels illimités', 'Transfert intelligent', 'Statistiques avancées'], popular: true },
    { id: 2, name: 'Équipe', price: 249, priceId: 'price_1TJv9vB5dBerNSsDlnsXltWh', desc: 'Appels illimités · 5 artisans',    features: ["Tout Pro inclus", "Jusqu'à 5 artisans", 'Tableau de bord équipe', 'Support prioritaire'] },
  ]

  async function handleCheckout() {
    if (selected === null) return
    setCheckoutError('')
    setCheckoutLoading(true)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) throw new Error('Non authentifié')
      const plan = plans[selected]
      const res = await fetch('https://hxkpmmekaotwmzgqxafp.supabase.co/functions/v1/create-checkout-session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${session.access_token}` },
        body: JSON.stringify({
          priceId: plan.priceId,
          trade: profile?.company_type ?? '',
          company: profile?.company_name ?? '',
          email: user?.email ?? '',
        }),
      })
      const result = await res.json()
      if (!res.ok || result.error) throw new Error(result.error || result.message || `Erreur ${res.status}`)
      if (!result.url) throw new Error('URL de paiement manquante')
      window.location.href = result.url
    } catch (e: any) {
      setCheckoutError(e.message)
      setCheckoutLoading(false)
    }
  }

  const currentPlanName = hasPaid ? 'Pro' : 'Essai gratuit'

  return (
    <div className="flex flex-col gap-4">
      <SettingsHeader section="Plateforme" title="Abonnement" />

      {/* ── Bannière essai ── */}
      {isTrialActive && !hasPaid && (
        <div className="rounded-2xl px-5 py-4 flex items-center justify-between gap-4"
          style={{ background: daysLeft <= 2 ? '#FEF2F2' : '#FFFBEB', border: `1px solid ${daysLeft <= 2 ? '#FECACA' : '#FDE68A'}` }}>
          <div className="flex items-center gap-3">
            <span className="text-xl">{daysLeft <= 2 ? '⚠️' : '🎁'}</span>
            <div>
              <p className="text-sm font-semibold" style={{ color: daysLeft <= 2 ? '#B91C1C' : '#92400E' }}>
                {daysLeft === 0 ? "Votre essai se termine aujourd'hui" : `Essai gratuit — ${daysLeft} jour${daysLeft > 1 ? 's' : ''} restant${daysLeft > 1 ? 's' : ''}`}
              </p>
              <p className="text-xs mt-0.5" style={{ color: daysLeft <= 2 ? '#DC2626' : '#B45309' }}>
                Se termine le {trialEnd.toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' })}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-3 flex-shrink-0">
            <div className="hidden sm:block w-24">
              <div className="h-1.5 bg-white/60 rounded-full overflow-hidden">
                <div className="h-full rounded-full transition-all" style={{ width: `${trialPct}%`, background: daysLeft <= 2 ? '#EF4444' : '#F59E0B' }} />
              </div>
              <p className="text-[10px] text-right mt-0.5" style={{ color: daysLeft <= 2 ? '#DC2626' : '#B45309' }}>{trialPct}% écoulé</p>
            </div>
          </div>
        </div>
      )}

      {/* ── KPI row ── */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { label: 'Appels ce mois', value: monthCallCount === null ? '…' : String(monthCallCount), sub: 'depuis le 1er', icon: '📞' },
          { label: 'Appels au total', value: callCount === null ? '…' : String(callCount), sub: 'depuis le début', icon: '📊' },
          { label: 'Forfait actuel', value: currentPlanName, sub: hasPaid ? 'actif' : `${daysLeft}j restants`, icon: '👑', highlight: true },
          { label: 'Statut', value: hasPaid ? 'Actif' : 'Essai', sub: hasPaid ? 'abonnement en cours' : 'sans carte bancaire', icon: hasPaid ? '✅' : '🔓' },
        ].map(s => (
          <div key={s.label} className="bg-white border border-gray-100 rounded-2xl px-4 py-4 shadow-sm">
            <div className="flex items-center justify-between mb-2">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-400">{s.label}</p>
              <span className="text-base">{s.icon}</span>
            </div>
            <p className="text-xl font-bold leading-none" style={s.highlight ? { color: accent } : { color: '#111827' }}>{s.value}</p>
            <p className="text-[10px] text-gray-400 mt-1">{s.sub}</p>
          </div>
        ))}
      </div>

      {/* ── Séparateur ── */}
      <div className="text-center pt-2">
        <p className="text-[11px] font-semibold uppercase tracking-widest text-gray-400 mb-0.5">Tarifs</p>
        <p className="text-base font-bold text-gray-900">Choisissez votre formule</p>
        <p className="text-xs text-gray-400 mt-0.5">Sans engagement · annulation à tout moment</p>
      </div>

      {/* ── Plans ── */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        {plans.map((p) => {
          const isActive = selected === p.id
          return (
            <div key={p.id} onClick={() => setSelected(p.id)}
              className="bg-white rounded-2xl p-5 cursor-pointer transition-all relative overflow-hidden"
              style={{
                border: isActive ? `2px solid ${accent}` : '1px solid #F3F4F6',
                boxShadow: isActive ? `0 0 0 4px ${accent}12` : '0 1px 3px 0 rgb(0 0 0/0.05)',
              }}>
              {p.popular && (
                <div className="absolute top-0 left-0 right-0 text-center py-1 text-[10px] font-bold uppercase tracking-wide text-white" style={{ background: accent }}>
                  Recommandé
                </div>
              )}
              <div className={p.popular ? 'pt-5' : ''}>
                <p className="font-bold text-gray-900 mb-1">{p.name}</p>
                <p className="text-[28px] font-bold tracking-tight leading-none mb-1" style={{ color: accent }}>
                  {p.price}<span className="text-sm font-normal text-gray-400"> €/mois</span>
                </p>
                <p className="text-xs text-gray-400 mb-4">{p.desc}</p>
                <div className="flex flex-col gap-2">
                  {p.features.map((f, j) => (
                    <div key={j} className="flex items-center gap-2 text-xs text-gray-600">
                      <span className="w-4 h-4 rounded-full flex items-center justify-center text-[9px] font-bold flex-shrink-0" style={{ background: accent + '15', color: accent }}>✓</span>
                      {f}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )
        })}
      </div>

      {/* ── CTA ── */}
      {checkoutError && (
        <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-xl px-3 py-2">{checkoutError}</p>
      )}

      {hasPaid && isTrialActive ? (
        /* Déjà souscrit, essai en cours */
        <div className="rounded-2xl px-5 py-4 flex items-center justify-between gap-4" style={{ background: '#F0FDF4', border: '1px solid #BBF7D0' }}>
          <div className="flex items-center gap-3">
            <span className="text-xl">✅</span>
            <div>
              <p className="text-sm font-semibold text-emerald-800">Abonnement Pro activé</p>
              <p className="text-xs text-emerald-700 mt-0.5">
                Votre essai gratuit se termine le {trialEnd.toLocaleDateString('fr-FR', { day: 'numeric', month: 'long' })}.
                Votre abonnement démarrera automatiquement à cette date.
              </p>
            </div>
          </div>
        </div>
      ) : hasPaid && !isTrialActive ? (
        /* Abonné actif — portail Stripe */
        <div className="rounded-2xl px-5 py-4 flex items-center justify-between gap-4" style={{ background: accent + '08', border: `1px solid ${accent}20` }}>
          <div>
            <p className="text-sm font-semibold" style={{ color: accent }}>Abonnement actif</p>
            <p className="text-xs text-gray-500 mt-0.5">Gérez vos factures et votre abonnement · support@fixlyy.fr</p>
          </div>
          <a href="https://billing.stripe.com/p/login/test_28o5lx0WJeRgflK144"
            className="text-sm px-5 py-2.5 rounded-xl text-white font-semibold shadow-sm hover:opacity-90 transition-opacity flex-shrink-0 no-underline"
            style={{ background: accent }}>
            Gérer mon abonnement
          </a>
        </div>
      ) : (
        /* Pas encore souscrit → Stripe checkout */
        <div className="rounded-2xl px-5 py-4 flex items-center justify-between gap-4" style={{ background: accent + '08', border: `1px solid ${accent}20` }}>
          <div>
            <p className="text-sm font-semibold" style={{ color: accent }}>Garantie satisfait ou remboursé 30 jours</p>
            <p className="text-xs text-gray-500 mt-0.5">Annulez à tout moment · support@fixlyy.fr</p>
          </div>
          <button
            onClick={handleCheckout}
            disabled={selected === null || checkoutLoading}
            className="text-sm px-5 py-2.5 rounded-xl text-white font-semibold shadow-sm hover:opacity-90 transition-opacity flex-shrink-0 disabled:opacity-40"
            style={{ background: accent }}>
            {checkoutLoading ? 'Redirection…' : selected === null ? 'Choisir un plan' : `Activer ${plans[selected].name}`}
          </button>
        </div>
      )}
    </div>
  )
}

// ── Shared UI Components ──────────────────────────────────────────────────────
function PageHeader({ title, sub }: { title: string; sub: string }) {
  return <div className="mb-5"><h1 className="text-[22px] font-semibold tracking-tight">{title}</h1><p className="text-sm text-gray-500 mt-1">{sub}</p></div>
}

function Card({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return <div className={`bg-white border border-gray-100 rounded-2xl p-5 shadow-sm ${className}`}>{children}</div>
}

function SettingsHeader({ section, title }: { section: string; title: string }) {
  return (
    <div className="mb-5">
      <p className="text-[11px] font-semibold uppercase tracking-widest text-gray-400 mb-0.5">{section}</p>
      <h1 className="text-xl font-bold text-gray-900 tracking-tight">{title}</h1>
    </div>
  )
}

function StatCard({ label, value, trend, trendUp, accent }: { label: string; value: string; trend: string; trendUp?: boolean; accent?: string }) {
  return (
    <div className="bg-gray-50 rounded-xl p-4">
      <p className="text-xs text-gray-500 mb-1.5">{label}</p>
      <p className="text-[22px] font-semibold tracking-tight leading-none" style={accent ? { color: accent } : {}}>{value}</p>
      <p className={`text-xs mt-1.5 ${trendUp ? 'text-emerald-600' : 'text-gray-400'}`}>{trend}</p>
    </div>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <div><label className="text-xs text-gray-500 block mb-1">{label}</label>{children}</div>
}

function Toggle({ defaultOn, accent, onChange, className = '' }: { defaultOn: boolean; accent: string; onChange?: (v: boolean) => void; className?: string }) {
  const [on, setOn] = useState(defaultOn)
  return (
    <button onClick={() => { setOn(!on); onChange?.(!on) }}
      className={`relative w-9 h-5 rounded-full transition-colors flex-shrink-0 ${className}`}
      style={{ background: on ? accent : '#D1D5DB' }}>
      <span className={`absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform ${on ? 'translate-x-4' : 'translate-x-0'}`} />
    </button>
  )
}

function ToggleRow({ label, desc, defaultOn, accent }: { label: string; desc: string; defaultOn: boolean; accent: string }) {
  return (
    <div className="flex items-center justify-between gap-4 py-3 border-b border-gray-100 last:border-0">
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium">{label}</p>
        <p className="text-xs text-gray-400 mt-0.5">{desc}</p>
      </div>
      <Toggle defaultOn={defaultOn} accent={accent} className="flex-shrink-0" />
    </div>
  )
}


// ── Agenda Page ───────────────────────────────────────────────────────────────
type AppointmentRow = { id: string; client_name: string | null; client_phone: string | null; reason: string | null; appointment_date: string; appointment_time: string; duration_minutes: number; status: string; created_at: string }

function AgendaPage({ accent, onGoToIntegrations: _onGoToIntegrations }: { accent: string; onGoToIntegrations: () => void }) {
  const { user } = useAuth()
  const [calls, setCalls] = useState<CallRow[]>([])
  const [appointments, setAppointments] = useState<AppointmentRow[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedDate, setSelectedDate] = useState<Date>(() => { const d = new Date(); d.setHours(0,0,0,0); return d })
  const [viewMonth, setViewMonth] = useState<Date>(() => new Date(new Date().getFullYear(), new Date().getMonth(), 1))

  useEffect(() => {
    if (!user) return
    const since = new Date(); since.setDate(since.getDate() - 90)
    Promise.all([
      supabase.from('calls').select('*').eq('artisan_id', user.id)
        .gte('created_at', since.toISOString())
        .order('created_at', { ascending: false }),
      supabase.from('appointments').select('*').eq('artisan_id', user.id)
        .gte('appointment_date', since.toISOString().split('T')[0])
        .order('appointment_date', { ascending: true }),
    ]).then(([{ data: callsData }, { data: apptData }]) => {
      setCalls(callsData || [])
      setAppointments(apptData || [])
      setLoading(false)
    })
  }, [user])

  const today = new Date(); today.setHours(0,0,0,0)

  const callsForDay = (d: Date) => calls.filter(c => {
    const cd = new Date(c.created_at); cd.setHours(0,0,0,0)
    return cd.getTime() === d.getTime()
  })

  const apptForDay = (d: Date) => appointments.filter(a => {
    const ad = new Date(a.appointment_date + 'T12:00:00'); ad.setHours(0,0,0,0)
    return ad.getTime() === d.getTime()
  })

  // Build calendar grid for viewMonth
  const firstDay = new Date(viewMonth.getFullYear(), viewMonth.getMonth(), 1)
  const lastDay = new Date(viewMonth.getFullYear(), viewMonth.getMonth() + 1, 0)
  const startOffset = (firstDay.getDay() + 6) % 7 // Mon=0
  const calDays: (Date | null)[] = [
    ...Array(startOffset).fill(null),
    ...Array.from({ length: lastDay.getDate() }, (_, i) => new Date(viewMonth.getFullYear(), viewMonth.getMonth(), i + 1))
  ]

  const selectedCalls = callsForDay(selectedDate)
  const pendingCalls = calls.filter(c => ['new', 'pending', 'urgent'].includes(c.status))

  const goToPrevMonth = () => setViewMonth(new Date(viewMonth.getFullYear(), viewMonth.getMonth() - 1, 1))
  const goToNextMonth = () => setViewMonth(new Date(viewMonth.getFullYear(), viewMonth.getMonth() + 1, 1))
  const goToToday = () => {
    const t = new Date(); t.setHours(0,0,0,0)
    setSelectedDate(t)
    setViewMonth(new Date(t.getFullYear(), t.getMonth(), 1))
  }

  const statusStyle = (status: string) => {
    if (status === 'urgent') return 'bg-red-100 text-red-700'
    if (status === 'spam')   return 'bg-gray-100 text-gray-500'
    if (status === 'done')   return 'bg-emerald-100 text-emerald-700'
    return 'bg-amber-100 text-amber-700'
  }

  return (
    <div>
      <SettingsHeader section="Activité" title="Agenda" />

      <div className="grid gap-4 grid-cols-1 md:grid-cols-[1fr_300px]">
        {/* ── Calendrier ── */}
        <Card>
          {/* Navigation mois */}
          <div className="flex items-center justify-between mb-5">
            <button onClick={goToPrevMonth} className="p-1.5 rounded-lg hover:bg-gray-100 transition-colors text-gray-500">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7"/></svg>
            </button>
            <div className="flex items-center gap-3">
              <p className="text-sm font-semibold capitalize">
                {viewMonth.toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' })}
              </p>
              <button onClick={goToToday} className="text-[11px] px-2 py-0.5 rounded border border-gray-200 text-gray-500 hover:bg-gray-50 transition-colors">
                Aujourd'hui
              </button>
            </div>
            <button onClick={goToNextMonth} className="p-1.5 rounded-lg hover:bg-gray-100 transition-colors text-gray-500">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7"/></svg>
            </button>
          </div>

          {/* En-têtes jours */}
          <div className="grid grid-cols-7 mb-1">
            {['Lun','Mar','Mer','Jeu','Ven','Sam','Dim'].map(d => (
              <div key={d} className="text-center text-[11px] font-medium text-gray-400 py-1">{d}</div>
            ))}
          </div>

          {/* Grille jours */}
          <div className="grid grid-cols-7 gap-1">
            {calDays.map((d, i) => {
              if (!d) return <div key={i} />
              const dc = callsForDay(d)
              const ac = apptForDay(d)
              const hasUrgent = dc.some(c => c.status === 'urgent')
              const hasCalls = dc.length > 0
              const hasAppt = ac.length > 0
              const isSel = d.getTime() === selectedDate.getTime()
              const isTod = d.getTime() === today.getTime()
              return (
                <button key={i} onClick={() => setSelectedDate(d)}
                  className={`relative flex flex-col items-center justify-center h-10 w-full rounded-lg transition-all text-sm font-medium
                    ${isSel ? 'text-white shadow-sm' : 'hover:bg-gray-100 text-gray-700'}`}
                  style={isSel ? { background: accent } : {}}>
                  <span style={isTod && !isSel ? { color: accent, fontWeight: 700 } : {}}>{d.getDate()}</span>
                  {(hasCalls || hasAppt) && (
                    <div className="absolute bottom-1 flex gap-0.5">
                      {hasCalls && <div className={`w-1 h-1 rounded-full ${isSel ? 'bg-white/80' : hasUrgent ? 'bg-red-500' : ''}`}
                        style={!isSel && !hasUrgent ? { background: accent } : {}} />}
                      {hasAppt && <div className={`w-1 h-1 rounded-full ${isSel ? 'bg-white/80' : 'bg-emerald-500'}`} />}
                    </div>
                  )}
                </button>
              )
            })}
          </div>

          {/* Légende */}
          <div className="flex gap-4 mt-4 pt-3 border-t border-gray-100">
            <div className="flex items-center gap-1.5">
              <div className="w-2 h-2 rounded-full" style={{ background: accent }} />
              <span className="text-[11px] text-gray-400">Appels</span>
            </div>
            <div className="flex items-center gap-1.5">
              <div className="w-2 h-2 rounded-full bg-red-500" />
              <span className="text-[11px] text-gray-400">Urgents</span>
            </div>
            <div className="flex items-center gap-1.5">
              <div className="w-2 h-2 rounded-full bg-emerald-500" />
              <span className="text-[11px] text-gray-400">Rendez-vous</span>
            </div>
          </div>
        </Card>

        {/* ── Panneau droit ── */}
        <div className="flex flex-col gap-4">
          {/* Appels du jour sélectionné */}
          <Card>
            <div className="mb-3">
              <p className="text-sm font-semibold capitalize">
                {selectedDate.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' })}
              </p>
              <p className="text-xs text-gray-400 mt-0.5">{selectedCalls.length} appel{selectedCalls.length !== 1 ? 's' : ''}</p>
            </div>

            {loading ? (
              <div className="flex justify-center py-6"><div className="w-4 h-4 border-2 border-gray-300 border-t-transparent rounded-full animate-spin" /></div>
            ) : selectedCalls.length === 0 ? (
              <div className="text-center py-5">
                <p className="text-2xl mb-1">📅</p>
                <p className="text-xs text-gray-400">Aucun appel ce jour</p>
              </div>
            ) : (
              <div className="flex flex-col gap-2 max-h-52 overflow-y-auto">
                {selectedCalls.map(c => (
                  <div key={c.id} className="p-2.5 rounded-lg bg-gray-50">
                    <div className="flex items-center justify-between gap-1 mb-0.5">
                      <p className="text-xs font-medium truncate">{c.caller_name || c.caller_phone || 'Inconnu'}</p>
                      <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full flex-shrink-0 ${statusStyle(c.status)}`}>
                        {STATUS_LABELS[c.status] || c.status}
                      </span>
                    </div>
                    <p className="text-[11px] text-gray-400">{new Date(c.created_at).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}</p>
                    {c.summary && <p className="text-[11px] text-gray-500 mt-1 line-clamp-2">{c.summary}</p>}
                  </div>
                ))}
              </div>
            )}
          </Card>

          {/* Rendez-vous du jour */}
          {apptForDay(selectedDate).length > 0 && (
            <Card>
              <p className="text-xs font-semibold mb-3">Rendez-vous</p>
              <div className="flex flex-col gap-2">
                {apptForDay(selectedDate).map(a => (
                  <div key={a.id} className="p-2.5 rounded-lg bg-emerald-50 border border-emerald-100">
                    <div className="flex items-center justify-between gap-1 mb-0.5">
                      <p className="text-xs font-medium truncate text-emerald-800">{a.client_name || a.client_phone || 'Client inconnu'}</p>
                      <span className="text-[10px] font-semibold text-emerald-600 flex-shrink-0">
                        {a.appointment_time.slice(0, 5)}
                      </span>
                    </div>
                    {a.reason && <p className="text-[11px] text-emerald-600 truncate">{a.reason}</p>}
                    {a.client_phone && <p className="text-[11px] text-emerald-500 mt-0.5">{a.client_phone}</p>}
                  </div>
                ))}
              </div>
            </Card>
          )}

          {/* Rappels en attente */}
          <Card>
            <div className="flex items-center justify-between mb-3">
              <p className="text-xs font-semibold">Rappels en attente</p>
              <span className="text-[11px] px-2 py-0.5 rounded-full font-medium" style={{ background: accent + '15', color: accent }}>
                {pendingCalls.length}
              </span>
            </div>
            {pendingCalls.length === 0 ? (
              <div className="text-center py-4">
                <p className="text-xl">✓</p>
                <p className="text-xs text-gray-400 mt-1">Tout est traité</p>
              </div>
            ) : (
              <div className="flex flex-col gap-1.5 max-h-48 overflow-y-auto">
                {pendingCalls.slice(0, 8).map(c => (
                  <div key={c.id} className="flex items-center gap-2 p-2 rounded-lg bg-gray-50">
                    <div className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ background: c.status === 'urgent' ? '#EF4444' : accent }} />
                    <p className="text-xs truncate flex-1">{c.caller_name || c.caller_phone || 'Inconnu'}</p>
                    <span className="text-[10px] text-gray-400 flex-shrink-0">
                      {new Date(c.created_at).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </Card>
        </div>
      </div>
    </div>
  )
}

// ── Stats Page ────────────────────────────────────────────────────────────────
function StatsPage({ accent }: { accent: string }) {
  const { user } = useAuth()
  const [calls, setCalls] = useState<{ created_at: string; status: string; duration_seconds: number | null }[]>([])
  const [contacts, setContacts] = useState(0)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!user) return
    Promise.all([
      supabase.from('calls').select('created_at, status, duration_seconds').eq('artisan_id', user.id).order('created_at', { ascending: false }),
      supabase.from('contacts').select('id', { count: 'exact', head: true }).eq('user_id', user.id),
    ]).then(([{ data: callsData }, { count }]) => {
      setCalls(callsData || [])
      setContacts(count || 0)
      setLoading(false)
    })
  }, [user])

  if (loading) return (
    <div className="flex items-center justify-center py-20">
      <div className="w-5 h-5 border-2 border-gray-300 border-t-transparent rounded-full animate-spin" />
    </div>
  )

  const today = new Date().toDateString()
  const todayCount = calls.filter(c => new Date(c.created_at).toDateString() === today).length
  const urgentCount = calls.filter(c => c.status === 'urgent').length
  const doneCount = calls.filter(c => c.status === 'done').length
  const durations = calls.filter(c => c.duration_seconds != null).map(c => c.duration_seconds!)
  const avgDuration = durations.length ? Math.round(durations.reduce((a, b) => a + b, 0) / durations.length) : 0
  const avgMinStr = avgDuration > 0 ? `${Math.floor(avgDuration / 60)}min ${avgDuration % 60}s` : '—'

  // Graphique 7 derniers jours
  const days7: { label: string; count: number; date: string }[] = []
  for (let i = 6; i >= 0; i--) {
    const d = new Date(); d.setDate(d.getDate() - i)
    const ds = d.toDateString()
    const label = d.toLocaleDateString('fr-FR', { weekday: 'short', day: 'numeric' })
    const count = calls.filter(c => new Date(c.created_at).toDateString() === ds).length
    days7.push({ label, count, date: ds })
  }
  const maxDay = Math.max(...days7.map(d => d.count), 1)

  // Répartition des statuts
  const statuses = [
    { label: 'Nouveaux', key: 'new', color: '#3B82F6' },
    { label: 'Urgents', key: 'urgent', color: '#EF4444' },
    { label: 'En attente', key: 'pending', color: '#F59E0B' },
    { label: 'Traités', key: 'done', color: '#10B981' },
  ]
  const totalCalls = calls.length

  return (
    <div className="flex flex-col gap-4">
      {/* ── Header ── */}
      <div>
        <p className="text-[11px] font-semibold uppercase tracking-widest text-gray-400 mb-0.5">Activité</p>
        <h1 className="text-xl font-bold text-gray-900 tracking-tight">Statistiques</h1>
      </div>

      {/* ── KPI row ── */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { label: 'Total appels', value: String(totalCalls), sub: 'depuis le début', color: accent },
          { label: "Aujourd'hui", value: String(todayCount), sub: 'appels reçus', color: todayCount > 0 ? accent : '#9CA3AF' },
          { label: 'Durée moy.', value: avgMinStr, sub: 'par appel', color: '#374151' },
          { label: 'Contacts', value: String(contacts), sub: 'dans la base', color: contacts > 0 ? '#10B981' : '#9CA3AF' },
        ].map(s => (
          <div key={s.label} className="bg-white border border-gray-100 rounded-2xl px-4 py-3.5 shadow-sm">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-400 mb-1">{s.label}</p>
            <p className="text-2xl font-bold leading-none" style={{ color: s.color }}>{s.value}</p>
            <p className="text-[10px] text-gray-400 mt-0.5">{s.sub}</p>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Graphique 7 jours */}
        <div className="bg-white border border-gray-100 rounded-2xl shadow-sm p-5">
          <p className="text-sm font-semibold mb-4">7 derniers jours</p>
          <div className="flex items-end justify-around h-28 gap-1.5">
            {days7.map((d, i) => {
              const pct = d.count / maxDay
              const isToday = d.date === today
              return (
                <div key={i} className="flex flex-col items-center gap-1 flex-1">
                  {d.count > 0 && <span className="text-[10px] text-gray-500 font-semibold">{d.count}</span>}
                  <div className="w-full rounded-t-lg transition-all" style={{
                    height: `${Math.max(pct * 96, d.count > 0 ? 8 : 3)}px`,
                    background: isToday ? accent : accent + '40',
                  }} />
                  <span className={`text-[9px] text-center leading-tight ${isToday ? 'font-semibold' : 'text-gray-400'}`}
                    style={isToday ? { color: accent } : {}}>{d.label}</span>
                </div>
              )
            })}
          </div>
        </div>

        {/* Répartition statuts */}
        <div className="bg-white border border-gray-100 rounded-2xl shadow-sm p-5">
          <p className="text-sm font-semibold mb-4">Répartition des statuts</p>
          {totalCalls === 0 ? (
            <div className="flex items-center justify-center h-28">
              <p className="text-sm text-gray-300">Aucun appel pour l'instant</p>
            </div>
          ) : (
            <div className="space-y-3.5">
              {statuses.map(s => {
                const cnt = calls.filter(c => c.status === s.key).length
                const pct = totalCalls > 0 ? Math.round((cnt / totalCalls) * 100) : 0
                return (
                  <div key={s.key}>
                    <div className="flex items-center justify-between mb-1.5">
                      <div className="flex items-center gap-1.5">
                        <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: s.color }} />
                        <span className="text-xs font-medium text-gray-600">{s.label}</span>
                      </div>
                      <span className="text-xs font-bold text-gray-700">{cnt} <span className="font-normal text-gray-400">({pct}%)</span></span>
                    </div>
                    <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
                      <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, background: s.color }} />
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </div>

      {/* Taux de traitement */}
      <div className="bg-white border border-gray-100 rounded-2xl shadow-sm p-5">
        <div className="flex items-center justify-between mb-3">
          <div>
            <p className="text-sm font-semibold">Taux de traitement</p>
            <p className="text-xs text-gray-400 mt-0.5">Appels marqués comme "Traité"</p>
          </div>
          <p className="text-[32px] font-bold tracking-tight leading-none" style={{ color: accent }}>
            {totalCalls > 0 ? `${Math.round((doneCount / totalCalls) * 100)}%` : '—'}
          </p>
        </div>
        <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
          <div className="h-full rounded-full transition-all" style={{ width: totalCalls > 0 ? `${Math.round((doneCount / totalCalls) * 100)}%` : '0%', background: accent }} />
        </div>
        <p className="text-xs text-gray-400 mt-2">{doneCount} sur {totalCalls} appels traités</p>
      </div>
    </div>
  )
}

// ── SVG Icons ──────────────────────────────────────────────────────────────────
const HomeIcon = () => <svg viewBox="0 0 16 16" fill="none"><path d="M2 6.5L8 2l6 4.5V14a1 1 0 01-1 1H9.5v-4h-3v4H3a1 1 0 01-1-1V6.5z" stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round"/></svg>
const PhoneIcon = () => <svg viewBox="0 0 16 16" fill="none"><path d="M3 2.5A1.5 1.5 0 014.5 1h.879a1 1 0 01.949.684l.674 2.022A1 1 0 016.657 5l-.74.74a7.05 7.05 0 003.344 3.344l.74-.74a1 1 0 011.293-.345l2.022.674A1 1 0 0114 9.621V10.5A1.5 1.5 0 0112.5 12H12A9.5 9.5 0 012.5 2.5V2" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/></svg>
const UserIcon = () => <svg viewBox="0 0 16 16" fill="none"><circle cx="8" cy="5" r="3" stroke="currentColor" strokeWidth="1.2"/><path d="M2 13c0-3.314 2.686-6 6-6s6 2.686 6 6" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/></svg>
const BotIcon = () => <svg viewBox="0 0 16 16" fill="none"><circle cx="8" cy="8" r="5.5" stroke="currentColor" strokeWidth="1.2"/><circle cx="6" cy="7.5" r="1" fill="currentColor"/><circle cx="10" cy="7.5" r="1" fill="currentColor"/><path d="M6 10.5c.5.5 3.5.5 4 0" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round"/><path d="M8 2.5v1" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/></svg>
const ClockIcon = () => <svg viewBox="0 0 16 16" fill="none"><circle cx="8" cy="8" r="6" stroke="currentColor" strokeWidth="1.2"/><path d="M8 5v3l2 1" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/></svg>
const CardIcon = () => <svg viewBox="0 0 16 16" fill="none"><rect x="1" y="4" width="14" height="10" rx="1.5" stroke="currentColor" strokeWidth="1.2"/><path d="M4 8h2M4 10.5h4" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/><path d="M1 7h14" stroke="currentColor" strokeWidth="1.2"/></svg>
const MenuIcon = () => <svg width="18" height="18" viewBox="0 0 18 18" fill="none"><path d="M2 4h14M2 9h14M2 14h14" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/></svg>
const PuzzleIcon = () => <svg viewBox="0 0 16 16" fill="none"><path d="M6 2.5h4v1.5a1 1 0 002 0V2.5h1.5A.5.5 0 0114 3v2.5h-1.5a1 1 0 000 2H14V10h-1.5a1 1 0 000 2H14v1.5a.5.5 0 01-.5.5H10v-1.5a1 1 0 00-2 0V14H5.5A.5.5 0 015 13.5V12H3.5a1 1 0 010-2H5V7.5H3.5a1 1 0 010-2H5V3a.5.5 0 01.5-.5H6" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/></svg>
const MessageIcon = () => <svg viewBox="0 0 16 16" fill="none"><path d="M2 3a1 1 0 011-1h10a1 1 0 011 1v7a1 1 0 01-1 1H6l-3 2.5V11H3a1 1 0 01-1-1V3z" stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round"/><path d="M5 6h6M5 8.5h4" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/></svg>
const PhoneInIcon = () => <svg viewBox="0 0 16 16" fill="none"><path d="M9.5 2h4.5v4.5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round"/><path d="M14 2l-5 5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/><path d="M3 2.5A1.5 1.5 0 014.5 1h.879a1 1 0 01.949.684l.674 2.022A1 1 0 016.657 5l-.74.74a7.05 7.05 0 003.344 3.344l.74-.74a1 1 0 011.293-.345l2.022.674A1 1 0 0114 9.621V10.5A1.5 1.5 0 0112.5 12H12A9.5 9.5 0 012.5 2.5" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round"/></svg>
const PhoneOutIcon = () => <svg viewBox="0 0 16 16" fill="none"><path d="M14 2h-4.5M14 2v4.5M14 2l-5 5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round"/><path d="M3 2.5A1.5 1.5 0 014.5 1h.879a1 1 0 01.949.684l.674 2.022A1 1 0 016.657 5l-.74.74a7.05 7.05 0 003.344 3.344l.74-.74a1 1 0 011.293-.345l2.022.674A1 1 0 0114 9.621V10.5A1.5 1.5 0 0112.5 12H12A9.5 9.5 0 012.5 2.5" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round"/></svg>
const TransferIcon = () => <svg viewBox="0 0 16 16" fill="none"><path d="M2 5h9M8 2l3 3-3 3" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round"/><path d="M14 11H5M8 8l-3 3 3 3" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round"/></svg>
const MailIcon = () => <svg viewBox="0 0 16 16" fill="none"><rect x="1" y="3" width="14" height="10" rx="1.5" stroke="currentColor" strokeWidth="1.2"/><path d="M1 5l7 4.5L15 5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/></svg>
const TeamIcon = () => <svg viewBox="0 0 16 16" fill="none"><circle cx="6" cy="5" r="2.5" stroke="currentColor" strokeWidth="1.2"/><path d="M1 13c0-2.761 2.239-5 5-5s5 2.239 5 5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/><circle cx="11.5" cy="5" r="2" stroke="currentColor" strokeWidth="1.1"/><path d="M13.5 12c0-2-1.343-3.716-3.2-4.253" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round"/></svg>
const BuildingIcon = () => <svg viewBox="0 0 16 16" fill="none"><rect x="1.5" y="3" width="13" height="12" rx="1" stroke="currentColor" strokeWidth="1.2"/><path d="M5 15V9h6v6" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round"/><rect x="4" y="5" width="2" height="2" rx="0.5" fill="currentColor"/><rect x="10" y="5" width="2" height="2" rx="0.5" fill="currentColor"/><path d="M1.5 7h13" stroke="currentColor" strokeWidth="1.2"/></svg>
const WebhookIcon = () => <svg viewBox="0 0 16 16" fill="none"><circle cx="4" cy="12" r="2" stroke="currentColor" strokeWidth="1.2"/><circle cx="12" cy="12" r="2" stroke="currentColor" strokeWidth="1.2"/><circle cx="8" cy="4" r="2" stroke="currentColor" strokeWidth="1.2"/><path d="M10 4.5l2 5.5M6 4.5L4 10M6 12h4" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/></svg>
const ChartIcon = () => <svg viewBox="0 0 16 16" fill="none"><path d="M2 12V7M6 12V5M10 12V8M14 12V3" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/><path d="M1 13.5h14" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/></svg>
const CalendarIcon = () => <svg viewBox="0 0 16 16" fill="none"><rect x="1.5" y="2.5" width="13" height="12" rx="1.5" stroke="currentColor" strokeWidth="1.2"/><path d="M5 1.5v2M11 1.5v2" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/><path d="M1.5 6.5h13" stroke="currentColor" strokeWidth="1.2"/><circle cx="5.5" cy="10" r="1" fill="currentColor"/><circle cx="8" cy="10" r="1" fill="currentColor"/><circle cx="10.5" cy="10" r="1" fill="currentColor"/></svg>
const GlobeIcon = () => <svg viewBox="0 0 16 16" fill="none"><circle cx="8" cy="8" r="6.5" stroke="currentColor" strokeWidth="1.2"/><path d="M8 1.5C8 1.5 5.5 4 5.5 8s2.5 6.5 2.5 6.5M8 1.5C8 1.5 10.5 4 10.5 8S8 14.5 8 14.5M1.5 8h13" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/></svg>
const LogoutIcon = () => <svg viewBox="0 0 16 16" fill="none" width="14" height="14"><path d="M6 2H3a1 1 0 00-1 1v10a1 1 0 001 1h3" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/><path d="M10.5 11l3-3-3-3" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"/><path d="M13.5 8H6" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/></svg>
