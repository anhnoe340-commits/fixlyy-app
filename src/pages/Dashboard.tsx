import { useState, useEffect } from 'react'
import { useAuth } from '@/contexts/AuthContext'
import { useProfile } from '@/contexts/ProfileContext'
import { supabase } from '@/lib/supabase'

type Page =
  | 'calls' | 'contacts' | 'agenda' | 'stats'
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
  const [page, setPage] = useState<Page>('calls')
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
          { p: 'calls',    icon: <PhoneIcon />,    label: 'Appels' },
          { p: 'contacts', icon: <UserIcon />,     label: 'Contacts' },
          { p: 'agenda',   icon: <CalendarIcon />, label: 'Agenda' },
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

  return (
    <div>
      <PageHeader title="Appels" sub="Gérez et consultez vos appels reçus" />
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-5">
        <StatCard label="Appels aujourd'hui" value={String(todayCalls.length)} trend="via votre assistante" trendUp={todayCalls.length > 0} />
        <StatCard label="Appels urgents" value={String(urgentCount)} trend={urgentCount > 0 ? 'à traiter' : 'aucun en attente'} trendUp={false} />
        <StatCard label="Total appels" value={String(calls.length)} trend="depuis le début" />
        <StatCard label="Assistante" value={profile?.assistant_name || 'Mia'} trend="active 24/7" trendUp accent={accent} />
      </div>

      <Card>
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-4">
          <div><p className="text-sm font-semibold">Appels récents</p><p className="text-xs text-gray-400 mt-0.5">Appuyez sur une ligne pour voir les détails</p></div>
          <div className="flex gap-1.5 overflow-x-auto pb-0.5 flex-shrink-0">
            {['all','new','pending','urgent','done','spam'].map(f => (
              <button key={f} onClick={() => setFilter(f)}
                className={`text-xs px-2.5 py-1 rounded-md transition-colors whitespace-nowrap flex-shrink-0 ${filter === f ? 'text-white font-medium' : 'border border-gray-200 hover:bg-gray-50'}`}
                style={filter === f ? { background: f === 'spam' ? '#6B7280' : accent } : {}}>
                {f === 'all' ? 'Tous' : STATUS_LABELS[f]}
              </button>
            ))}
          </div>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-10">
            <div className="w-5 h-5 border-2 border-gray-300 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-10">
            <p className="text-sm text-gray-400">Aucun appel pour l'instant</p>
            <p className="text-xs text-gray-300 mt-1">Ils apparaîtront ici dès que votre assistante aura traité un appel</p>
          </div>
        ) : (
          <>
            {/* Vue mobile : cartes */}
            <div className="md:hidden flex flex-col divide-y divide-gray-50">
              {filtered.map(c => {
                const sc = STATUS_COLORS[c.status] || STATUS_COLORS.new
                return (
                  <div key={c.id} onClick={() => setSelectedCall(c)}
                    className="flex items-center gap-3 py-3 cursor-pointer active:bg-gray-50">
                    <div className="w-9 h-9 rounded-full flex items-center justify-center text-[11px] font-semibold flex-shrink-0"
                      style={{ background: accent + '15', color: accent }}>
                      {(c.caller_name || '?').split(' ').map((w:string) => w[0]).join('').toUpperCase().slice(0,2)}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-[13px] truncate">{c.caller_name || 'Inconnu'}</p>
                      <p className="text-[11px] text-gray-400 truncate">{c.status === 'spam' ? 'Prospection commerciale' : (c.reason || c.caller_phone || 'Demande générale')}</p>
                    </div>
                    <div className="flex flex-col items-end gap-1 flex-shrink-0">
                      <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full" style={{ background: sc.bg, color: sc.text }}>
                        {STATUS_LABELS[c.status] || c.status}
                      </span>
                      <span className="text-[10px] text-gray-400">
                        {new Date(c.created_at).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })}
                      </span>
                    </div>
                  </div>
                )
              })}
            </div>

            {/* Vue desktop : tableau */}
            <table className="hidden md:table w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100">
                  <th className="text-left text-[11px] font-semibold text-gray-400 uppercase tracking-wider pb-2 pr-4">Contact</th>
                  <th className="text-left text-[11px] font-semibold text-gray-400 uppercase tracking-wider pb-2 pr-4">Motif</th>
                  <th className="text-left text-[11px] font-semibold text-gray-400 uppercase tracking-wider pb-2 pr-4">Date / Heure</th>
                  <th className="text-left text-[11px] font-semibold text-gray-400 uppercase tracking-wider pb-2">Statut</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map(c => {
                  const sc = STATUS_COLORS[c.status] || STATUS_COLORS.new
                  const fmtDate = (iso: string) => {
                    const d = new Date(iso)
                    const diff = Date.now() - d.getTime()
                    const m = Math.floor(diff / 60000)
                    if (m < 60) return `${m} min`
                    const h = Math.floor(m / 60)
                    if (h < 24) return `${h}h`
                    return d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })
                  }
                  return (
                    <tr key={c.id}
                      onClick={() => setSelectedCall(c)}
                      className="border-b border-gray-50 hover:bg-gray-50 cursor-pointer transition-colors">
                      <td className="py-3 pr-4">
                        <div className="flex items-center gap-2.5">
                          <div className="w-7 h-7 rounded-full flex items-center justify-center text-[11px] font-semibold flex-shrink-0"
                            style={{ background: accent + '15', color: accent }}>
                            {(c.caller_name || '?').split(' ').map((w:string) => w[0]).join('').toUpperCase().slice(0,2)}
                          </div>
                          <div>
                            <p className="font-medium text-[13px]">{c.caller_name || 'Inconnu'}</p>
                            {c.caller_phone && <p className="text-[11px] text-gray-400">{c.caller_phone}</p>}
                          </div>
                        </div>
                      </td>
                      <td className="py-3 pr-4 text-[13px] text-gray-500 max-w-[180px] truncate">
                        {c.status === 'spam' ? <span className="italic text-gray-400">Prospection commerciale</span> : (c.reason || 'Demande générale')}
                      </td>
                      <td className="py-3 pr-4 text-[13px] text-gray-500 whitespace-nowrap">
                        {new Date(c.created_at).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}
                        <br />
                        <span className="text-[11px] text-gray-400">{fmtDate(c.created_at)}</span>
                      </td>
                      <td className="py-3">
                        <span className="text-[11px] font-semibold px-2.5 py-1 rounded-full" style={{ background: sc.bg, color: sc.text }}>
                          {STATUS_LABELS[c.status] || c.status}
                        </span>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </>
        )}
      </Card>

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
    <div>
      <PageHeader title="Contacts" sub="Gérez votre base de données clients" />
      <Card>
        <div className="flex items-center justify-between mb-4 gap-3 flex-wrap">
          <p className="text-sm font-semibold">Contacts ({contacts.length})</p>
          <div className="flex gap-2 items-center flex-wrap">
            {importResult && <span className="text-xs text-emerald-600 font-medium">✓ {importResult}</span>}
            <input placeholder="Rechercher..." value={search} onChange={e => setSearch(e.target.value)}
              className="border border-gray-200 rounded-md px-3 py-1.5 text-xs outline-none focus:border-gray-400 w-40" />
            {/* Import VCF */}
            <label className="text-xs px-3 py-1.5 rounded-md border border-gray-200 text-gray-600 hover:bg-gray-50 cursor-pointer transition-colors flex items-center gap-1.5">
              {importing
                ? <><div className="w-3 h-3 border border-gray-400 border-t-transparent rounded-full animate-spin" />Import…</>
                : <>
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12"/></svg>
                  Importer VCF
                </>}
              <input type="file" accept=".vcf,.vcard" className="hidden" onChange={handleVcfImport} />
            </label>
            {/* Import CSV */}
            <label className="text-xs px-3 py-1.5 rounded-md border border-gray-200 text-gray-600 hover:bg-gray-50 cursor-pointer transition-colors flex items-center gap-1.5">
              {importingCsv
                ? <><div className="w-3 h-3 border border-gray-400 border-t-transparent rounded-full animate-spin" />Import…</>
                : <>
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12"/></svg>
                  Importer CSV
                </>}
              <input type="file" accept=".csv" className="hidden" onChange={handleCsvImport} />
            </label>
            <button onClick={() => { setPanelOpen(true); setForm({ name: '', phone: '', email: '', address: '' }) }}
              className="text-xs px-3 py-1.5 rounded-md text-white font-medium flex items-center gap-1" style={{ background: accent }}>
              + Ajouter
            </button>
          </div>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-10">
            <div className="w-5 h-5 border-2 border-gray-300 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-10">
            <p className="text-sm text-gray-400">{search ? 'Aucun résultat' : 'Aucun contact encore'}</p>
            {!search && <p className="text-xs text-gray-300 mt-1">Ajoutez un contact ou importez un fichier VCF depuis votre téléphone</p>}
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            {filtered.map(c => (
              <div key={c.id} className="group flex items-center gap-3 px-3 py-2.5 bg-gray-50 rounded-lg hover:bg-blue-50 transition-colors overflow-hidden">
                <div className="w-9 h-9 rounded-full border flex items-center justify-center text-sm font-semibold flex-shrink-0"
                  style={{ background: accent + '15', color: accent, borderColor: accent + '30' }}>
                  {initials(c.name)}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{c.name}</p>
                  <p className="text-xs text-gray-400 mt-0.5 truncate">{[c.phone, c.email].filter(Boolean).join(' · ')}</p>
                </div>
                <p className="text-xs text-gray-300 flex-shrink-0">{new Date(c.created_at).toLocaleDateString('fr-FR')}</p>
                <button onClick={() => handleDelete(c.id)}
                  className="opacity-0 group-hover:opacity-100 w-6 h-6 flex items-center justify-center rounded text-gray-300 hover:text-red-500 hover:bg-red-50 transition-all flex-shrink-0">
                  ×
                </button>
              </div>
            ))}
          </div>
        )}
      </Card>

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
    <div>
      <PageHeader title="Paramètres de salutation" sub="Configurez les messages de votre assistante en fonction des horaires" />

      <div className="flex flex-col gap-4">
        {/* Pendant les heures d'ouverture */}
        <Card>
          <div className="flex items-center justify-between mb-4">
            <div>
              <p className="text-sm font-semibold">Pendant les heures d'ouverture</p>
              <p className="text-xs text-gray-400 mt-0.5">Message diffusé lors des appels reçus pendant vos heures d'activité</p>
            </div>
            <button onClick={() => {}} className="text-xs px-3 py-1.5 rounded-md border border-gray-200 text-gray-600 hover:bg-gray-50 flex items-center gap-1.5">
              <span>▶</span> Prévisualiser la voix
            </button>
          </div>
          <textarea
            value={profile.greeting_open || ''}
            onChange={e => updateProfile({ greeting_open: e.target.value })}
            rows={4}
            placeholder="Ex : Bonjour, vous avez bien joint l'entreprise Dupont Plomberie. Je suis Mia, l'assistante de Marc. Comment puis-je vous aider ?"
            className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm outline-none focus:border-gray-400 resize-none"
          />
        </Card>

        {/* Hors heures d'ouverture */}
        <Card>
          <div className="flex items-center justify-between mb-4">
            <div>
              <p className="text-sm font-semibold">Hors heures d'ouverture</p>
              <p className="text-xs text-gray-400 mt-0.5">Message diffusé en dehors de vos horaires d'activité</p>
            </div>
            <button onClick={() => {}} className="text-xs px-3 py-1.5 rounded-md border border-gray-200 text-gray-600 hover:bg-gray-50 flex items-center gap-1.5">
              <span>▶</span> Prévisualiser la voix
            </button>
          </div>
          <textarea
            value={profile.greeting_closed || ''}
            onChange={e => updateProfile({ greeting_closed: e.target.value })}
            rows={4}
            placeholder="Ex : Bonjour, vous avez bien joint l'entreprise Dupont Plomberie. Nous sommes actuellement fermés. Laissez-moi votre message et nous vous rappellerons dès que possible."
            className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm outline-none focus:border-gray-400 resize-none"
          />
        </Card>

        {/* Salutation personnalisée */}
        <Card>
          <div className="flex items-center justify-between gap-4 py-1">
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold">Activer le message de salutation personnalisé</p>
              <p className="text-xs text-gray-400 mt-0.5">L'assistante utilise le prénom du client s'il est connu</p>
            </div>
            <Toggle defaultOn={personalizedGreeting} accent={accent} onChange={setPersonalizedGreeting} className="flex-shrink-0" />
          </div>
        </Card>

        {/* Message de fin d'appel */}
        <Card>
          <p className="text-sm font-semibold mb-3">Message de fin d'appel</p>
          <p className="text-xs text-gray-400 mb-3">Diffusé automatiquement à la fin de chaque appel</p>
          <input
            defaultValue="Merci pour votre appel. Bonne journée !"
            className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm outline-none focus:border-gray-400"
          />
        </Card>

        <div className="flex justify-end">
          {saved && <span className="text-xs text-emerald-600 font-medium mr-3 self-center">✓ Enregistré</span>}
          <button onClick={handleSave} className="text-sm px-5 py-2.5 rounded-lg text-white font-medium" style={{ background: accent }}>
            Enregistrer les modifications
          </button>
        </div>
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
    <div>
      <PageHeader title="Raisons d'appel entrantes" sub="Définissez les motifs pour lesquels vos clients vous appellent" />
      <Card>
        <div className="flex items-center justify-between mb-4">
          <p className="text-sm font-semibold">{reasons.length} raison{reasons.length > 1 ? 's' : ''} configurée{reasons.length > 1 ? 's' : ''}</p>
          <button onClick={() => setShowAdd(true)} className="text-xs px-3 py-1.5 rounded-md text-white font-medium" style={{ background: accent }}>
            + Ajouter une raison d'appel
          </button>
        </div>

        {reasons.length === 0 ? (
          <div className="text-center py-10">
            <p className="text-sm text-gray-400">Aucune raison d'appel configurée</p>
            <p className="text-xs text-gray-300 mt-1">Ajoutez des raisons pour guider l'assistante lors des appels</p>
          </div>
        ) : (
          <div className="flex flex-col divide-y divide-gray-100">
            {reasons.map(r => (
              <div key={r.id} className="flex items-center gap-4 py-3.5">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium">{r.label}</p>
                  <p className="text-xs text-gray-400 mt-0.5">{r.desc}</p>
                </div>
                <Toggle defaultOn={r.on} accent={accent} onChange={() => toggle(r.id)} />
                <button onClick={() => remove(r.id)} className="w-6 h-6 flex items-center justify-center rounded text-gray-300 hover:text-red-500 hover:bg-red-50 transition-all text-sm ml-1">
                  ×
                </button>
              </div>
            ))}
          </div>
        )}

        {showAdd && (
          <div className="mt-4 pt-4 border-t border-gray-100 flex flex-col gap-3">
            <Field label="Intitulé de la raison">
              <input autoFocus value={newLabel} onChange={e => setNewLabel(e.target.value)}
                placeholder="Ex : Demande de devis"
                className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm outline-none focus:border-gray-400" />
            </Field>
            <Field label="Description (optionnel)">
              <input value={newDesc} onChange={e => setNewDesc(e.target.value)}
                placeholder="Ex : L'assistante collecte le motif et planifie un rappel"
                className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm outline-none focus:border-gray-400" />
            </Field>
            <div className="flex gap-2 justify-end">
              <button onClick={() => setShowAdd(false)} className="text-xs px-4 py-2 rounded-lg border border-gray-200 text-gray-600">Annuler</button>
              <button onClick={add} className="text-xs px-4 py-2 rounded-lg text-white font-medium" style={{ background: accent }}>Ajouter</button>
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
    <div>
      <PageHeader title="Raisons d'appel sortantes" sub="Définissez les motifs pour lesquels votre assistante rappelle vos clients" />
      <Card>
        <div className="flex items-center justify-between mb-4">
          <p className="text-sm font-semibold">{reasons.length} raison{reasons.length !== 1 ? 's' : ''} configurée{reasons.length !== 1 ? 's' : ''}</p>
          <button onClick={() => setShowAdd(true)} className="text-xs px-3 py-1.5 rounded-md text-white font-medium" style={{ background: accent }}>
            + Ajouter une raison d'appel
          </button>
        </div>

        {reasons.length === 0 && !showAdd ? (
          <div className="text-center py-12">
            <div className="w-10 h-10 rounded-full bg-gray-100 flex items-center justify-center mx-auto mb-3">
              <PhoneOutIcon />
            </div>
            <p className="text-sm text-gray-400">Aucune raison d'appel sortant configurée</p>
            <p className="text-xs text-gray-300 mt-1">Ajoutez des raisons pour que l'assistante puisse rappeler vos clients</p>
            <button onClick={() => setShowAdd(true)} className="mt-4 text-xs px-4 py-2 rounded-lg text-white font-medium" style={{ background: accent }}>
              + Ajouter une raison d'appel
            </button>
          </div>
        ) : (
          <div className="flex flex-col divide-y divide-gray-100">
            {reasons.map(r => (
              <div key={r.id} className="flex items-center gap-4 py-3.5">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium">{r.label}</p>
                  <p className="text-xs text-gray-400 mt-0.5">{r.desc}</p>
                </div>
                <Toggle defaultOn={r.on} accent={accent} onChange={() => toggle(r.id)} />
                <button onClick={() => remove(r.id)} className="w-6 h-6 flex items-center justify-center rounded text-gray-300 hover:text-red-500 hover:bg-red-50 transition-all text-sm ml-1">×</button>
              </div>
            ))}
          </div>
        )}

        {showAdd && (
          <div className="mt-4 pt-4 border-t border-gray-100 flex flex-col gap-3">
            <Field label="Intitulé de la raison">
              <input autoFocus value={newLabel} onChange={e => setNewLabel(e.target.value)}
                placeholder="Ex : Rappel devis envoyé"
                className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm outline-none focus:border-gray-400" />
            </Field>
            <Field label="Description (optionnel)">
              <input value={newDesc} onChange={e => setNewDesc(e.target.value)}
                placeholder="Ex : L'assistante rappelle le client 48h après l'envoi du devis"
                className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm outline-none focus:border-gray-400" />
            </Field>
            <div className="flex gap-2 justify-end">
              <button onClick={() => setShowAdd(false)} className="text-xs px-4 py-2 rounded-lg border border-gray-200 text-gray-600">Annuler</button>
              <button onClick={add} className="text-xs px-4 py-2 rounded-lg text-white font-medium" style={{ background: accent }}>Ajouter</button>
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
    <div>
      <PageHeader title="Transfert d'appel" sub="Configurez le transfert d'appels vers des numéros externes ou des employés" />

      <div className="flex flex-col gap-4">
        {/* Transfert externe */}
        <Card>
          <div className="flex items-center justify-between gap-4 mb-4">
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold">Transfert d'appel externe</p>
              <p className="text-xs text-gray-400 mt-0.5">Transférer les appels vers un numéro de téléphone externe</p>
            </div>
            <Toggle defaultOn={externalTransfer} accent={accent} onChange={setExternalTransfer} className="flex-shrink-0" />
          </div>
          {externalTransfer && (
            <Field label="Numéro de destination">
              <input value={externalNumber} onChange={e => setExternalNumber(e.target.value)}
                placeholder="+33 6 00 00 00 00"
                className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm outline-none focus:border-gray-400 mt-1" />
            </Field>
          )}
        </Card>

        {/* Heures actives de l'assistant */}
        <Card>
          <p className="text-sm font-semibold mb-1">Heures actives de l'assistant</p>
          <p className="text-xs text-gray-400 mb-4">Le transfert d'appel est actif uniquement pendant ces horaires</p>
          <div className="flex flex-col gap-3">
            {['Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi', 'Dimanche'].map((day, i) => (
              <div key={day} className="flex items-center gap-4">
                <span className="text-sm text-gray-600 w-24">{day}</span>
                {i < 5 ? (
                  <div className="flex items-center gap-2 text-xs text-gray-500">
                    <input type="time" defaultValue="09:00" className="border border-gray-200 rounded-md px-2 py-1 text-xs text-center outline-none focus:border-gray-400" />
                    <span>à</span>
                    <input type="time" defaultValue="18:00" className="border border-gray-200 rounded-md px-2 py-1 text-xs text-center outline-none focus:border-gray-400" />
                  </div>
                ) : (
                  <span className="text-xs text-gray-300 italic">Fermé</span>
                )}
              </div>
            ))}
          </div>
        </Card>

        {/* Transfert vers des employés */}
        <Card>
          <div className="flex items-center justify-between gap-4 mb-1">
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold">Transférer vers des employés</p>
              <p className="text-xs text-gray-400 mt-0.5">L'assistante transfère l'appel vers un employé disponible</p>
            </div>
            <Toggle defaultOn={transferToEmployees} accent={accent} onChange={setTransferToEmployees} className="flex-shrink-0" />
          </div>
          {transferToEmployees && (
            <div className="mt-4 pt-4 border-t border-gray-100">
              <p className="text-xs text-gray-400 text-center py-4">Ajoutez d'abord des employés dans la section "Employés"</p>
            </div>
          )}
        </Card>

        {/* Transfert entre employés */}
        <Card>
          <div className="flex items-center justify-between gap-4">
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold">Transfert entre employés</p>
              <p className="text-xs text-gray-400 mt-0.5">Permettre aux employés de transférer des appels entre eux</p>
            </div>
            <Toggle defaultOn={interEmployeeTransfer} accent={accent} onChange={setInterEmployeeTransfer} className="flex-shrink-0" />
          </div>
        </Card>
      </div>
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
    <div>
      <PageHeader title="Post-traitement" sub="Actions effectuées automatiquement après chaque appel" />
      <div className="flex flex-col gap-4">
        <Card>
          <div className="flex items-center justify-between gap-4 mb-4">
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold">Envoyer un email de notification après l'appel</p>
              <p className="text-xs text-gray-400 mt-0.5">Recevez un résumé de chaque appel par email dès la fin de la conversation</p>
            </div>
            <Toggle defaultOn={emailNotif} accent={accent} onChange={setEmailNotif} className="flex-shrink-0" />
          </div>
          {emailNotif && (
            <Field label="Adresse email de notification">
              <input
                value={profile.email || ''}
                onChange={e => updateProfile({ email: e.target.value })}
                placeholder="votre@email.fr"
                className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm outline-none focus:border-gray-400 mt-1"
              />
            </Field>
          )}
        </Card>

        <Card>
          <p className="text-sm font-semibold mb-4">Contenu du résumé</p>
          <div className="flex flex-col gap-3">
            <ToggleRow label="Nom du client" desc="Inclure le nom et le numéro du client dans le résumé" defaultOn={true} accent={accent} />
            <ToggleRow label="Résumé de l'appel" desc="Synthèse générée automatiquement par l'IA" defaultOn={true} accent={accent} />
            <ToggleRow label="Durée de l'appel" desc="Durée totale de la conversation" defaultOn={true} accent={accent} />
            <ToggleRow label="Niveau d'urgence" desc="Indique si l'appel a été classé comme urgent" defaultOn={true} accent={accent} />
          </div>
        </Card>

        <div className="flex justify-end">
          {saved && <span className="text-xs text-emerald-600 font-medium mr-3 self-center">✓ Enregistré</span>}
          <button onClick={handleSave} className="text-sm px-5 py-2.5 rounded-lg text-white font-medium" style={{ background: accent }}>
            Enregistrer les modifications
          </button>
        </div>
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
    <div>
      <PageHeader title="Employés" sub="Gérez les membres de votre équipe" />
      <Card>
        <div className="flex items-center justify-between mb-4">
          <p className="text-sm font-semibold">{employees.length} employé{employees.length !== 1 ? 's' : ''}</p>
          <button onClick={() => setShowAdd(true)} className="text-xs px-3 py-1.5 rounded-md text-white font-medium" style={{ background: accent }}>
            + Ajouter un employé
          </button>
        </div>

        {employees.length === 0 && !showAdd ? (
          <div className="text-center py-12">
            <div className="w-10 h-10 rounded-full bg-gray-100 flex items-center justify-center mx-auto mb-3">
              <TeamIcon />
            </div>
            <p className="text-sm text-gray-400">Aucun employé ajouté</p>
            <p className="text-xs text-gray-300 mt-1">Ajoutez vos collaborateurs pour activer le transfert d'appels</p>
            <button onClick={() => setShowAdd(true)} className="mt-4 text-xs px-4 py-2 rounded-lg text-white font-medium" style={{ background: accent }}>
              + Ajouter un employé
            </button>
          </div>
        ) : (
          <div className="flex flex-col divide-y divide-gray-100">
            {employees.map(emp => (
              <div key={emp.id} className="group flex items-center gap-3 py-3.5">
                <div className="w-9 h-9 rounded-full flex items-center justify-center text-sm font-semibold flex-shrink-0"
                  style={{ background: accent + '15', color: accent }}>
                  {initials(emp.name)}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium">{emp.name}</p>
                  <p className="text-xs text-gray-400 mt-0.5">{[emp.email, emp.phone].filter(Boolean).join(' · ')}</p>
                  {emp.role && <p className="text-xs text-gray-300 mt-0.5">{emp.role}</p>}
                </div>
                <button onClick={() => remove(emp.id)} className="opacity-0 group-hover:opacity-100 w-6 h-6 flex items-center justify-center rounded text-gray-300 hover:text-red-500 hover:bg-red-50 transition-all text-sm">×</button>
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
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-gray-400" />
              </Field>
              <Field label="Rôle / Poste">
                <input value={form.role} onChange={e => setForm(f => ({ ...f, role: e.target.value }))}
                  placeholder="Plombier, Commercial..."
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-gray-400" />
              </Field>
              <Field label="Email">
                <input value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))}
                  placeholder="marie@entreprise.fr"
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-gray-400" />
              </Field>
              <Field label="Téléphone">
                <input value={form.phone} onChange={e => setForm(f => ({ ...f, phone: e.target.value }))}
                  placeholder="+33 6 00 00 00 00"
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-gray-400" />
              </Field>
            </div>
            <div className="flex gap-2 justify-end">
              <button onClick={() => setShowAdd(false)} className="text-xs px-4 py-2 rounded-lg border border-gray-200 text-gray-600">Annuler</button>
              <button onClick={add} className="text-xs px-4 py-2 rounded-lg text-white font-medium" style={{ background: accent }}>Ajouter</button>
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

  return (
    <div>
      <PageHeader title="Détails de l'entreprise" sub="Informations utilisées par votre assistante pour se présenter" />
      <div className="flex flex-col gap-4">
        {/* Infos principales */}
        <Card>
          <p className="text-sm font-semibold mb-4">Informations générales</p>
          <div className="grid grid-cols-2 gap-4">
            <Field label="Nom de l'entreprise">
              <input value={profile.company_name || ''} onChange={e => updateProfile({ company_name: e.target.value })}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-gray-400" />
            </Field>
            <Field label="Type d'activité">
              <select value={profile.company_type || ''} onChange={e => updateProfile({ company_type: e.target.value })}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none">
                <option value="">Sélectionner...</option>
                {['Plomberie / Chauffage / Climatisation', 'Électricité / Solaire', 'Services à domicile', 'Menuiserie / Charpenterie', 'Peinture / Décoration', 'Serrurerie', 'Jardinage / Paysagisme', 'Autre'].map(t => <option key={t}>{t}</option>)}
              </select>
            </Field>
            <Field label="Adresse">
              <input value={profile.address || ''} onChange={e => updateProfile({ address: e.target.value })}
                placeholder="12 rue de la Paix, 75001 Paris"
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-gray-400" />
            </Field>
            <Field label="Téléphone">
              <input value={profile.phone || ''} onChange={e => updateProfile({ phone: e.target.value })}
                placeholder="+33 6 00 00 00 00"
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-gray-400" />
            </Field>
            <Field label="Email">
              <input value={profile.email || ''} onChange={e => updateProfile({ email: e.target.value })}
                placeholder="contact@entreprise.fr"
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-gray-400" />
            </Field>
            <Field label="Site web">
              <input defaultValue="" placeholder="https://www.monentreprise.fr"
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-gray-400" />
            </Field>
          </div>
          <div className="mt-4">
            <Field label="Description de l'entreprise">
              <textarea
                defaultValue=""
                placeholder="Décrivez votre activité, vos spécialités et votre zone d'intervention..."
                rows={3}
                className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm outline-none focus:border-gray-400 resize-none"
              />
            </Field>
          </div>
        </Card>

        {/* Compétences */}
        <Card>
          <p className="text-sm font-semibold mb-1">Compétences</p>
          <p className="text-xs text-gray-400 mb-4">Vos domaines d'expertise communiqués aux clients lors des appels</p>
          <div className="flex flex-wrap gap-2 mb-3">
            {skills.map((s, i) => (
              <div key={i} className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-full font-medium" style={{ background: accent + '15', color: accent }}>
                {s}
                <button onClick={() => setSkills(prev => prev.filter((_, idx) => idx !== i))} className="hover:opacity-70 ml-0.5">×</button>
              </div>
            ))}
            <div className="flex items-center gap-1.5">
              <input value={newSkill} onChange={e => setNewSkill(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && addSkill()}
                placeholder="Ajouter une compétence..."
                className="text-xs border border-dashed border-gray-300 rounded-full px-3 py-1.5 outline-none focus:border-gray-400 w-44" />
              <button onClick={addSkill} className="text-xs px-2.5 py-1.5 rounded-full text-white" style={{ background: accent }}>+</button>
            </div>
          </div>
        </Card>

        {/* Statuts des appels */}
        <Card>
          <p className="text-sm font-semibold mb-1">Statuts des appels</p>
          <p className="text-xs text-gray-400 mb-4">Étiquettes utilisées pour classer vos appels</p>
          <div className="flex gap-2 flex-wrap">
            {callStatuses.map((s, i) => (
              <span key={i} className={`text-xs font-semibold px-3 py-1.5 rounded-full ${s.color}`}>{s.label}</span>
            ))}
            <span className="text-xs px-3 py-1.5 rounded-full border border-dashed border-gray-300 text-gray-400 cursor-pointer hover:border-gray-400">
              + Ajouter un statut
            </span>
          </div>
        </Card>

        {/* Codes postaux / Zone d'intervention */}
        <Card>
          <p className="text-sm font-semibold mb-1">Zone d'intervention</p>
          <p className="text-xs text-gray-400 mb-4">Codes postaux couverts avec rayon d'intervention</p>
          <div className="flex flex-col gap-2 mb-3">
            {postalCodes.map((pc, i) => (
              <div key={i} className="flex items-center gap-3 px-3 py-2 bg-gray-50 rounded-lg">
                <span className="text-sm font-medium flex-1">{pc.code}</span>
                <div className="flex items-center gap-1.5">
                  <span className="text-xs text-gray-400">Rayon :</span>
                  <select value={pc.radius} onChange={e => setPostalCodes(prev => prev.map((p, idx) => idx === i ? { ...p, radius: +e.target.value } : p))}
                    className="text-xs border border-gray-200 rounded-md px-2 py-1 outline-none">
                    {[5, 10, 15, 20, 30, 50].map(r => <option key={r} value={r}>{r} km</option>)}
                  </select>
                </div>
                <button onClick={() => setPostalCodes(prev => prev.filter((_, idx) => idx !== i))} className="text-gray-300 hover:text-red-500 text-sm">×</button>
              </div>
            ))}
          </div>
          <div className="flex gap-2">
            <input value={newPostal} onChange={e => setNewPostal(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && addPostal()}
              placeholder="Ex : 75001"
              className="flex-1 border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-gray-400" />
            <button onClick={addPostal} className="text-xs px-4 py-2 rounded-lg text-white font-medium" style={{ background: accent }}>
              + Ajouter
            </button>
          </div>
        </Card>

        <div className="flex justify-end">
          {saved && <span className="text-xs text-emerald-600 font-medium mr-3 self-center">✓ Enregistré</span>}
          <button onClick={handleSave} className="text-sm px-5 py-2.5 rounded-lg text-white font-medium" style={{ background: accent }}>
            Enregistrer les modifications
          </button>
        </div>
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
    <div>
      <PageHeader title="Horaires d'ouverture" sub="Configurez les heures de disponibilité de votre assistante" />
      <Card>
        <div className="flex items-center justify-between mb-5">
          <p className="text-sm font-semibold">Plages horaires</p>
          <div className="flex items-center gap-3">
            {saved && <span className="text-xs text-emerald-600 font-medium">✓ Enregistré</span>}
            <button onClick={handleSave} className="text-xs px-3 py-1.5 rounded-md text-white font-medium" style={{ background: accent }}>Enregistrer</button>
          </div>
        </div>
        <div className="flex flex-col gap-4">
          {days.map((d, i) => (
            <div key={d.day} className="flex items-center gap-4">
              <span className="text-sm font-medium w-28">{d.day}</span>
              {d.on ? (
                <div className="flex items-center gap-2 text-sm text-gray-500">
                  <input type="time" value={d.open} onChange={e => updateDay(i, 'open', e.target.value)}
                    className="border border-gray-200 rounded-md px-2.5 py-1.5 text-xs text-center outline-none focus:border-gray-400" />
                  <span className="text-gray-300">–</span>
                  <input type="time" value={d.close} onChange={e => updateDay(i, 'close', e.target.value)}
                    className="border border-gray-200 rounded-md px-2.5 py-1.5 text-xs text-center outline-none focus:border-gray-400" />
                </div>
              ) : (
                <span className="text-sm text-gray-300 italic">Fermé</span>
              )}
              <button onClick={() => updateDay(i, 'on', !d.on)}
                className="relative w-9 h-5 rounded-full transition-colors flex-shrink-0 ml-auto"
                style={{ background: d.on ? accent : '#D1D5DB' }}>
                <span className={`absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform ${d.on ? 'translate-x-[18px]' : 'translate-x-0.5'}`} />
              </button>
            </div>
          ))}
        </div>
      </Card>
    </div>
  )
}

// ── Assistant Page ────────────────────────────────────────────────────────────
function AssistantPage({ accent }: { accent: string }) {
  const { profile, updateProfile } = useProfile()
  const [saved, setSaved] = useState(false)
  const [extraLangs, setExtraLangs] = useState<string[]>([])
  const [updating, setUpdating] = useState(false)
  const [updateMsg, setUpdateMsg] = useState<string | null>(null)

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

  return (
    <div>
      <PageHeader title="Paramètres de l'assistant" sub="Configurez l'identité et la voix de votre assistante IA" />
      <div className="flex flex-col gap-4">
        <Card>
          <p className="text-sm font-semibold mb-4">Identité</p>
          <div className="grid grid-cols-2 gap-4">
            <Field label="Prénom de l'assistante">
              <input value={profile.assistant_name || ''} onChange={e => updateProfile({ assistant_name: e.target.value })}
                placeholder="Mia"
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-gray-400" />
            </Field>
            <Field label="Type de voix">
              <select value={profile.assistant_voice || ''} onChange={e => updateProfile({ assistant_voice: e.target.value })}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none">
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
              <select defaultValue="Français" className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none">
                <option>Français</option>
                <option>Anglais</option>
                <option>Espagnol</option>
              </select>
            </Field>
          </div>
          <Field label="Langues supplémentaires">
            <div className="flex flex-wrap gap-2 mt-1">
              {extraLangs.map((lang, i) => (
                <div key={i} className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-full" style={{ background: accent + '15', color: accent }}>
                  {lang}
                  <button onClick={() => setExtraLangs(prev => prev.filter((_, idx) => idx !== i))} className="hover:opacity-70">×</button>
                </div>
              ))}
              {availableLangs.filter(l => !extraLangs.includes(l)).map(lang => (
                <button key={lang} onClick={() => setExtraLangs(prev => [...prev, lang])}
                  className="text-xs px-3 py-1.5 rounded-full border border-dashed border-gray-300 text-gray-400 hover:border-gray-400">
                  + {lang}
                </button>
              ))}
            </div>
          </Field>
        </Card>

        <Card>
          <div className="flex items-center justify-between mb-1">
            <div>
              <p className="text-sm font-semibold">Prévisualisation de la voix</p>
              <p className="text-xs text-gray-400 mt-0.5">Écoutez un exemple avec les paramètres actuels</p>
            </div>
            <button className="text-xs px-4 py-2 rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50 flex items-center gap-2">
              <span>▶</span> Écouter
            </button>
          </div>
        </Card>

        <div className="flex justify-between items-center">
          <div className="flex items-center gap-3">
            {updateMsg && <span className={`text-xs font-medium ${updateMsg.startsWith('✓') ? 'text-emerald-600' : 'text-red-500'}`}>{updateMsg}</span>}
            <button onClick={handleUpdateAssistant} disabled={updating}
              className="text-xs px-4 py-2.5 rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50 flex items-center gap-1.5 disabled:opacity-50">
              {updating ? <><div className="w-3 h-3 border border-gray-400 border-t-transparent rounded-full animate-spin" />Mise à jour…</> : '↑ Mettre à jour Mia'}
            </button>
          </div>
          <div className="flex items-center gap-3">
            {saved && <span className="text-xs text-emerald-600 font-medium">✓ Enregistré</span>}
            <button onClick={handleSave} className="text-sm px-5 py-2.5 rounded-lg text-white font-medium" style={{ background: accent }}>
              Enregistrer les modifications
            </button>
          </div>
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
    <div>
      <PageHeader title="Webhooks" sub="Recevez des notifications en temps réel pour chaque événement d'appel" />
      <Card>
        <div className="flex items-center justify-between mb-4">
          <p className="text-sm font-semibold">{webhooks.length} webhook{webhooks.length !== 1 ? 's' : ''} configuré{webhooks.length !== 1 ? 's' : ''}</p>
          <button onClick={() => setShowAdd(true)} className="text-xs px-3 py-1.5 rounded-md text-white font-medium" style={{ background: accent }}>
            + Créer un webhook
          </button>
        </div>

        {webhooks.length === 0 && !showAdd ? (
          <div className="text-center py-12">
            <div className="w-10 h-10 rounded-full bg-gray-100 flex items-center justify-center mx-auto mb-3">
              <WebhookIcon />
            </div>
            <p className="text-sm text-gray-400">Aucun webhook configuré</p>
            <p className="text-xs text-gray-300 mt-1">Créez un webhook pour recevoir des données lors de chaque appel</p>
            <button onClick={() => setShowAdd(true)} className="mt-4 text-xs px-4 py-2 rounded-lg text-white font-medium" style={{ background: accent }}>
              + Créer un webhook
            </button>
          </div>
        ) : (
          <div className="flex flex-col divide-y divide-gray-100">
            {webhooks.map(wh => (
              <div key={wh.id} className="py-3.5 flex items-center gap-3">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-mono text-gray-700 truncate">{wh.url}</p>
                  <div className="flex gap-1.5 mt-1.5">
                    {wh.events.map(ev => (
                      <span key={ev} className="text-[10px] px-2 py-0.5 rounded-full bg-gray-100 text-gray-500">{ev}</span>
                    ))}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <span className={`text-[11px] font-semibold px-2.5 py-1 rounded-full ${wh.active ? 'bg-emerald-100 text-emerald-700' : 'bg-gray-100 text-gray-500'}`}>
                    {wh.active ? 'Actif' : 'Inactif'}
                  </span>
                  <button onClick={() => setWebhooks(prev => prev.filter(w => w.id !== wh.id))} className="text-gray-300 hover:text-red-500 text-sm">×</button>
                </div>
              </div>
            ))}
          </div>
        )}

        {showAdd && (
          <div className="mt-4 pt-4 border-t border-gray-100 flex flex-col gap-4">
            <Field label="URL du webhook">
              <input autoFocus value={form.url} onChange={e => setForm(f => ({ ...f, url: e.target.value }))}
                placeholder="https://votre-serveur.com/webhook"
                className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm outline-none focus:border-gray-400 font-mono" />
            </Field>
            <div>
              <label className="text-xs text-gray-500 block mb-2">Événements à écouter</label>
              <div className="flex flex-wrap gap-2">
                {eventOptions.map(ev => (
                  <button key={ev} onClick={() => toggleEvent(ev)}
                    className={`text-xs px-3 py-1.5 rounded-full border transition-colors ${form.events.includes(ev) ? 'text-white border-transparent' : 'border-gray-200 text-gray-500 hover:border-gray-400'}`}
                    style={form.events.includes(ev) ? { background: accent } : {}}>
                    {ev}
                  </button>
                ))}
              </div>
            </div>
            <div className="flex gap-2 justify-end">
              <button onClick={() => setShowAdd(false)} className="text-xs px-4 py-2 rounded-lg border border-gray-200 text-gray-600">Annuler</button>
              <button onClick={add} className="text-xs px-4 py-2 rounded-lg text-white font-medium" style={{ background: accent }}>Créer le webhook</button>
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
    <div>
      <PageHeader title="Intégrations" sub="Connectez Fixlyy à vos outils et configurez l'accès API" />
      <div className="flex flex-col gap-4">

        {/* Widget */}
        <Card>
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-xl border border-gray-200 bg-gray-50 flex items-center justify-center text-xl flex-shrink-0">
              🧩
            </div>
            <div className="flex-1">
              <p className="text-sm font-semibold">Widget Fixlyy</p>
              <p className="text-xs text-gray-400 mt-0.5">Intégrez un bouton d'appel direct sur votre site web</p>
            </div>
            <span className="text-[11px] font-semibold px-2.5 py-1 rounded-full bg-gray-100 text-gray-500">Non configuré</span>
          </div>
          <div className="mt-4 pt-4 border-t border-gray-100">
            <p className="text-xs text-gray-500 mb-2">Copiez ce code dans le <code className="bg-gray-100 px-1 rounded">&lt;head&gt;</code> de votre site</p>
            <div className="bg-gray-900 rounded-lg px-4 py-3 font-mono text-xs text-gray-300 relative">
              {'<script src="https://widget.fixlyy.fr/v1.js" data-key="YOUR_KEY"></script>'}
              <button className="absolute top-2 right-2 text-[10px] text-gray-400 hover:text-white px-2 py-1 rounded bg-gray-700">
                Copier
              </button>
            </div>
          </div>
        </Card>

        {/* Clé API */}
        <Card>
          <p className="text-sm font-semibold mb-1">Clé API</p>
          <p className="text-xs text-gray-400 mb-4">Utilisez cette clé pour intégrer Fixlyy dans vos propres applications</p>
          {!apiKeyGenerated && !apiKey ? (
            <button onClick={generateKey} className="text-xs px-4 py-2 rounded-lg text-white font-medium" style={{ background: accent }}>
              Générer une clé API
            </button>
          ) : (
            <div className="flex items-center gap-2">
              <div className="flex-1 bg-gray-50 border border-gray-200 rounded-lg px-3 py-2 font-mono text-xs text-gray-600 overflow-hidden">
                {generatedKey || apiKey}
              </div>
              <button onClick={copyKey} className={`text-xs px-3 py-2 rounded-lg border transition-colors ${copied ? 'border-emerald-300 text-emerald-600 bg-emerald-50' : 'border-gray-200 text-gray-600 hover:bg-gray-50'}`}>
                {copied ? '✓ Copié' : 'Copier'}
              </button>
            </div>
          )}
        </Card>

        {/* Domaines autorisés */}
        <Card>
          <p className="text-sm font-semibold mb-1">Domaines autorisés</p>
          <p className="text-xs text-gray-400 mb-4">Seuls ces domaines peuvent utiliser votre clé API et widget</p>
          <div className="flex flex-col gap-2 mb-3">
            {authorizedDomains.map((domain, i) => (
              <div key={i} className="flex items-center justify-between px-3 py-2 bg-gray-50 rounded-lg">
                <span className="text-sm font-mono text-gray-700">{domain}</span>
                <button onClick={() => setAuthorizedDomains(prev => prev.filter((_, idx) => idx !== i))} className="text-gray-300 hover:text-red-500 text-sm">×</button>
              </div>
            ))}
          </div>
          <div className="flex gap-2">
            <input value={newDomain} onChange={e => setNewDomain(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && addDomain()}
              placeholder="ex : monsite.fr"
              className="flex-1 border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-gray-400" />
            <button onClick={addDomain} className="text-xs px-4 py-2 rounded-lg text-white font-medium" style={{ background: accent }}>
              + Ajouter
            </button>
          </div>
        </Card>

        {/* Cal.com */}
        <Card>
          <div className="flex items-center gap-4 mb-4">
            <div className="w-12 h-12 rounded-xl border border-gray-200 bg-gray-50 flex items-center justify-center text-xl flex-shrink-0">
              📅
            </div>
            <div className="flex-1">
              <p className="text-sm font-semibold">Cal.com — Prise de rendez-vous</p>
              <p className="text-xs text-gray-400 mt-0.5">Votre assistante partage votre lien aux clients qui demandent un créneau</p>
            </div>
            <span className={`text-[11px] font-semibold px-2.5 py-1 rounded-full ${profile?.onboarding_calendar ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'}`}>
              {profile?.onboarding_calendar ? 'Connecté' : 'À configurer'}
            </span>
          </div>

          {!profile?.onboarding_calendar && (
            <div className="mb-4 p-3 bg-gray-50 rounded-lg border border-gray-200 text-xs text-gray-600 space-y-1.5">
              <p className="font-semibold text-gray-700">3 étapes pour activer la prise de RDV :</p>
              <p><span className="inline-flex items-center justify-center w-4 h-4 rounded-full text-white text-[10px] font-bold mr-1.5" style={{ background: accent }}>1</span>Créez un compte gratuit sur{' '}
                <a href="https://cal.com" target="_blank" rel="noreferrer" className="underline font-medium" style={{ color: accent }}>cal.com</a>
              </p>
              <p><span className="inline-flex items-center justify-center w-4 h-4 rounded-full text-white text-[10px] font-bold mr-1.5" style={{ background: accent }}>2</span>Dans Cal.com, allez dans <strong>Partager</strong> et copiez votre lien (ex: https://cal.com/jean-dupont)</p>
              <p><span className="inline-flex items-center justify-center w-4 h-4 rounded-full text-white text-[10px] font-bold mr-1.5" style={{ background: accent }}>3</span>Collez-le ci-dessous et enregistrez</p>
            </div>
          )}

          <Field label="Votre lien de réservation Cal.com">
            <input value={calUrl} onChange={e => setCalUrl(e.target.value)}
              placeholder="https://cal.com/votre-nom"
              className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm outline-none focus:border-gray-400" />
          </Field>
          <div className="flex items-center justify-between mt-3">
            <p className="text-xs text-gray-400">
              {profile?.onboarding_calendar
                ? `Lien actif · votre assistante l'utilise déjà`
                : 'Optionnel — laissez vide si vous ne souhaitez pas de prise de RDV'}
            </p>
            <div className="flex items-center gap-2">
              {calSaved && <span className="text-xs text-emerald-600 font-medium">✓ Enregistré</span>}
              <button onClick={saveCalUrl}
                disabled={calUrl === (profile?.onboarding_calendar || '')}
                className="text-xs px-3 py-1.5 rounded-md text-white font-medium disabled:opacity-40 transition-opacity"
                style={{ background: accent }}>
                Enregistrer
              </button>
            </div>
          </div>
        </Card>
      </div>
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
    <div>
      <PageHeader title="Fuseau horaire" sub="Configurez le fuseau horaire utilisé pour vos horaires et notifications" />
      <div className="flex flex-col gap-4">
        <Card>
          <p className="text-sm font-semibold mb-4">Fuseau horaire de l'entreprise</p>
          <Field label="Sélectionner un fuseau horaire">
            <select value={timezone} onChange={e => setTimezone(e.target.value)}
              className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm outline-none focus:border-gray-400">
              {timezones.map(tz => (
                <option key={tz.value} value={tz.value}>{tz.label}</option>
              ))}
            </select>
          </Field>
          <div className="mt-4 px-4 py-3 bg-gray-50 rounded-lg">
            <p className="text-xs text-gray-400 mb-1">Heure actuelle dans ce fuseau</p>
            <p className="text-xl font-semibold">{localTime}</p>
            <p className="text-xs text-gray-500 mt-0.5 capitalize">{localDate}</p>
          </div>
        </Card>

        <Card>
          <p className="text-sm font-semibold mb-1">Impact sur votre configuration</p>
          <p className="text-xs text-gray-400 mb-4">Ce fuseau horaire affecte les éléments suivants</p>
          <div className="flex flex-col gap-2.5">
            {[
              { icon: '🕐', label: 'Horaires d\'ouverture', desc: 'Vos plages horaires sont interprétées dans ce fuseau' },
              { icon: '📱', label: 'Notifications SMS et email', desc: 'Les résumés d\'appels affichent l\'heure locale' },
              { icon: '📞', label: 'Logs d\'appels', desc: 'Les horodatages des appels utilisent ce fuseau' },
            ].map((item, i) => (
              <div key={i} className="flex items-start gap-3 px-3 py-2.5 bg-gray-50 rounded-lg">
                <span className="text-base">{item.icon}</span>
                <div>
                  <p className="text-sm font-medium">{item.label}</p>
                  <p className="text-xs text-gray-400 mt-0.5">{item.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </Card>

        <div className="flex justify-end">
          {saved && <span className="text-xs text-emerald-600 font-medium mr-3 self-center">✓ Enregistré</span>}
          <button onClick={() => { setSaved(true); setTimeout(() => setSaved(false), 2500) }}
            className="text-sm px-5 py-2.5 rounded-lg text-white font-medium" style={{ background: accent }}>
            Enregistrer
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Subscription Page ─────────────────────────────────────────────────────────
function SubscriptionPage({ accent }: { accent: string }) {
  const [selected, setSelected] = useState(1)
  const plans = [
    { name: 'Solo', price: 79, desc: '150 appels · 1 artisan', features: ['Secrétaire IA 24/7', 'SMS résumé 30 sec', 'Prise de RDV', 'Support email'] },
    { name: 'Pro', price: 149, desc: 'Appels illimités · 1 artisan', features: ['Tout Solo inclus', 'Appels illimités', 'Transfert intelligent', 'Statistiques avancées'], popular: true },
    { name: 'Équipe', price: 249, desc: 'Appels illimités · 5 artisans', features: ["Tout Pro inclus", "Jusqu'à 5 artisans", 'Tableau de bord équipe', 'Support prioritaire'] },
  ]
  return (
    <div>
      <PageHeader title="Mon abonnement" sub="Choisissez la formule qui correspond à votre activité" />
      <div className="grid grid-cols-3 gap-4 mb-5">
        {plans.map((p, i) => (
          <div key={i} onClick={() => setSelected(i)} className="bg-white border rounded-xl p-5 cursor-pointer transition-all"
            style={{ borderColor: selected === i ? accent : '#E5E7EB', borderWidth: selected === i ? 2 : 1, boxShadow: selected === i ? `0 0 0 4px ${accent}18` : 'none' }}>
            {p.popular && <div className="text-xs font-semibold px-2.5 py-0.5 rounded-full inline-block mb-3" style={{ background: accent + '20', color: accent }}>Le plus populaire</div>}
            <p className="font-semibold text-sm mb-1">{p.name}</p>
            <p className="text-3xl font-bold tracking-tight" style={{ color: accent }}>{p.price}<span className="text-sm font-normal text-gray-400"> €/mois</span></p>
            <p className="text-xs text-gray-400 mt-1 mb-4">{p.desc}</p>
            <div className="flex flex-col gap-2">
              {p.features.map((f, j) => (
                <div key={j} className="flex items-center gap-2 text-xs text-gray-500">
                  <span className="w-3.5 h-3.5 rounded-full flex items-center justify-center text-[9px] flex-shrink-0" style={{ background: accent + '20', color: accent }}>✓</span>
                  {f}
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
      <div className="rounded-xl px-5 py-4 flex items-center justify-between" style={{ background: accent + '12', border: `1px solid ${accent}30` }}>
        <div>
          <p className="text-sm font-semibold" style={{ color: accent }}>Garantie satisfait ou remboursé 30 jours</p>
          <p className="text-xs text-gray-500 mt-1">Annulez à tout moment sans frais · support@fixlyy.fr</p>
        </div>
        <button className="text-sm px-5 py-2.5 rounded-lg text-white font-medium" style={{ background: accent }}>Activer mon plan</button>
      </div>
    </div>
  )
}

// ── Shared UI Components ──────────────────────────────────────────────────────
function PageHeader({ title, sub }: { title: string; sub: string }) {
  return <div className="mb-5"><h1 className="text-[22px] font-semibold tracking-tight">{title}</h1><p className="text-sm text-gray-500 mt-1">{sub}</p></div>
}

function Card({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return <div className={`bg-white border border-gray-200 rounded-xl p-5 ${className}`}>{children}</div>
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
      <PageHeader title="Agenda" sub="Historique de vos appels par jour" />

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
    <div>
      <PageHeader title="Statistiques" sub="Vue d'ensemble de votre activité téléphonique" />

      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-5">
        <StatCard label="Total appels" value={String(totalCalls)} trend="depuis le début" />
        <StatCard label="Aujourd'hui" value={String(todayCount)} trend="appels reçus" trendUp={todayCount > 0} />
        <StatCard label="Durée moyenne" value={avgMinStr} trend="par appel" />
        <StatCard label="Contacts" value={String(contacts)} trend="dans votre base" trendUp={contacts > 0} accent={accent} />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
        {/* Graphique 7 jours */}
        <Card>
          <p className="text-sm font-semibold mb-4">Appels — 7 derniers jours</p>
          {totalCalls === 0 ? (
            <div className="flex items-end justify-around h-28 gap-1.5">
              {days7.map((d, i) => (
                <div key={i} className="flex flex-col items-center gap-1 flex-1">
                  <span className="text-[10px] text-gray-400">0</span>
                  <div className="w-full bg-gray-100 rounded-t-sm" style={{ height: '4px' }} />
                  <span className="text-[9px] text-gray-400 text-center leading-tight">{d.label}</span>
                </div>
              ))}
            </div>
          ) : (
            <div className="flex items-end justify-around h-28 gap-1.5">
              {days7.map((d, i) => {
                const pct = d.count / maxDay
                const isToday = d.date === today
                return (
                  <div key={i} className="flex flex-col items-center gap-1 flex-1">
                    {d.count > 0 && <span className="text-[10px] text-gray-500 font-medium">{d.count}</span>}
                    <div className="w-full rounded-t-sm transition-all" style={{
                      height: `${Math.max(pct * 96, d.count > 0 ? 8 : 4)}px`,
                      background: isToday ? accent : accent + '60',
                    }} />
                    <span className="text-[9px] text-gray-400 text-center leading-tight">{d.label}</span>
                  </div>
                )
              })}
            </div>
          )}
        </Card>

        {/* Répartition statuts */}
        <Card>
          <p className="text-sm font-semibold mb-4">Répartition des statuts</p>
          {totalCalls === 0 ? (
            <div className="flex items-center justify-center h-28">
              <p className="text-sm text-gray-400">Aucun appel pour l'instant</p>
            </div>
          ) : (
            <div className="space-y-3">
              {statuses.map(s => {
                const cnt = calls.filter(c => c.status === s.key).length
                const pct = totalCalls > 0 ? Math.round((cnt / totalCalls) * 100) : 0
                return (
                  <div key={s.key}>
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-xs text-gray-600">{s.label}</span>
                      <span className="text-xs font-medium text-gray-700">{cnt} <span className="text-gray-400 font-normal">({pct}%)</span></span>
                    </div>
                    <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
                      <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, background: s.color }} />
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </Card>
      </div>

      {/* Taux de traitement */}
      <Card>
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-semibold">Taux de traitement</p>
            <p className="text-xs text-gray-400 mt-0.5">Appels marqués comme "Traité"</p>
          </div>
          <div className="text-right">
            <p className="text-[28px] font-semibold tracking-tight" style={{ color: accent }}>
              {totalCalls > 0 ? `${Math.round((doneCount / totalCalls) * 100)}%` : '—'}
            </p>
            <p className="text-xs text-gray-400">{doneCount} sur {totalCalls} appels</p>
          </div>
        </div>
        {totalCalls > 0 && (
          <div className="mt-3 h-2 bg-gray-100 rounded-full overflow-hidden">
            <div className="h-full rounded-full transition-all" style={{ width: `${Math.round((doneCount / totalCalls) * 100)}%`, background: accent }} />
          </div>
        )}
      </Card>
    </div>
  )
}

// ── SVG Icons ──────────────────────────────────────────────────────────────────
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
