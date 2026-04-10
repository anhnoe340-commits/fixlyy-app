import { useState, useRef, useEffect } from 'react'
import { useAuth } from '@/contexts/AuthContext'
import { useProfile } from '@/contexts/ProfileContext'
import { generateQuotePDF, type QuoteLine, type QuoteData } from '@/lib/generatePDF'
import { supabase } from '@/lib/supabase'

type Page = 'calls' | 'contacts' | 'appointments' | 'quotes' | 'invoices' | 'assistant' | 'hours' | 'settings' | 'subscription' | 'integrations'

const BRAND = '#2850c8'

const ACCENT_COLORS = [
  { label: 'Orange Fixlyy', value: '#FF6B35' },
  { label: 'Bleu acier', value: '#185FA5' },
  { label: 'Vert ardoise', value: '#0F6E56' },
  { label: 'Bordeaux', value: '#993556' },
  { label: 'Anthracite', value: '#3C3489' },
  { label: 'Personnalisé', value: 'custom' },
]

export default function Dashboard() {
  const { user, signOut } = useAuth()
  const { profile, uploadLogo } = useProfile()
  const [page, setPage] = useState<Page>('calls')
  const [sidebarOpen, setSidebarOpen] = useState(true)

  if (!profile) return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="w-6 h-6 border-2 border-[#2850c8] border-t-transparent rounded-full animate-spin" />
    </div>
  )

  const accent = BRAND

  return (
    <div className="flex min-h-screen bg-[#F5F5F4] text-[#1A1A1A]" style={{ fontFamily: "'system-ui', sans-serif" }}>
      {/* Sidebar */}
      <aside className={`${sidebarOpen ? 'w-60' : 'w-14'} bg-white border-r border-gray-200 flex flex-col flex-shrink-0 transition-all duration-200 fixed top-0 left-0 h-screen z-20`}>

        {/* Logo + entreprise */}
        <div className="p-4 border-b border-gray-100 flex items-center gap-2.5 min-w-0">
          <div className="w-8 h-8 rounded-lg flex items-center justify-center text-white font-bold text-sm flex-shrink-0" style={{ background: BRAND }}>
            {(profile.company_name || 'A')[0].toUpperCase()}
          </div>
          {sidebarOpen && (
            <div className="min-w-0">
              <p className="font-semibold text-[13px] tracking-tight truncate leading-tight">{profile.company_name || 'Mon entreprise'}</p>
              <p className="text-[11px] text-gray-400 truncate">{profile.twilio_number || 'N° non configuré'}</p>
            </div>
          )}
        </div>

        {/* Alerte période d'essai */}
        {sidebarOpen && (
          <div className="mx-3 mt-3 px-3 py-2.5 rounded-lg border border-amber-200 bg-amber-50">
            <p className="text-[11px] font-semibold text-amber-700">La période d'essai se termine le</p>
            <p className="text-[11px] text-amber-600 mt-0.5">
              {new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' })}
            </p>
          </div>
        )}

        {/* Navigation */}
        <nav className="flex-1 py-3 overflow-y-auto">
          <NavSection label="Activité" visible={sidebarOpen} />
          <NavItem icon={<PhoneIcon />} label="Appels" active={page === 'calls'} onClick={() => setPage('calls')} open={sidebarOpen} accent={accent} />
          <NavItem icon={<UserIcon />} label="Contacts" active={page === 'contacts'} onClick={() => setPage('contacts')} open={sidebarOpen} accent={accent} />
          <NavItem icon={<CalendarIcon />} label="Rendez-vous" active={page === 'appointments'} onClick={() => setPage('appointments')} open={sidebarOpen} accent={accent} />

          <NavSection label="Commercial" visible={sidebarOpen} />
          <NavItem icon={<DocIcon />} label="Devis" active={page === 'quotes'} onClick={() => setPage('quotes')} open={sidebarOpen} accent={accent} />
          <NavItem icon={<InvoiceIcon />} label="Factures" active={page === 'invoices'} onClick={() => setPage('invoices')} open={sidebarOpen} accent={accent} />

          <NavSection label="Configuration" visible={sidebarOpen} />
          <NavItem icon={<BotIcon />} label="Assistante" active={page === 'assistant'} onClick={() => setPage('assistant')} open={sidebarOpen} accent={accent} />
          <NavItem icon={<ClockIcon />} label="Horaires" active={page === 'hours'} onClick={() => setPage('hours')} open={sidebarOpen} accent={accent} />
          <NavItem icon={<GearIcon />} label="Paramètres" active={page === 'settings'} onClick={() => setPage('settings')} open={sidebarOpen} accent={accent} />
          <NavItem icon={<CardIcon />} label="Abonnement" active={page === 'subscription'} onClick={() => setPage('subscription')} open={sidebarOpen} accent={accent} />
          <NavItem icon={<PuzzleIcon />} label="Intégrations" active={page === 'integrations'} onClick={() => setPage('integrations')} open={sidebarOpen} accent={accent} />
        </nav>

        {sidebarOpen && <p className="px-4 pb-1 text-[10px] text-gray-300">Propulsé par Fixlyy</p>}
        <button onClick={signOut} className="m-3 mt-0 text-xs text-gray-400 hover:text-red-500 transition-colors text-left px-2 py-1.5">
          {sidebarOpen ? 'Se déconnecter' : '→'}
        </button>
      </aside>

      {/* Main */}
      <div className={`flex-1 flex flex-col ${sidebarOpen ? 'ml-60' : 'ml-14'} transition-all duration-200`}>
        {/* Topbar */}
        <header className="sticky top-0 z-10 bg-white border-b border-gray-200 flex items-center justify-between px-6 h-[52px]">
          <div className="flex items-center gap-3">
            <button onClick={() => setSidebarOpen(!sidebarOpen)} className="text-gray-400 hover:text-gray-600 transition-colors">
              <MenuIcon />
            </button>
            <div className="flex items-center gap-1.5 text-sm text-gray-400">
              <span>Plateforme</span>
              <span>/</span>
              <span className="text-gray-700 font-medium">{PAGE_LABELS[page]}</span>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-xs px-3 py-1.5 rounded-md font-medium" style={{ background: accent + '20', color: accent }}>
              Essai — 7 jours
            </span>
            <div className="w-7 h-7 rounded-full bg-gray-100 flex items-center justify-center text-xs font-medium text-gray-600">
              {user?.email?.[0]?.toUpperCase()}
            </div>
          </div>
        </header>

        <main className="flex-1 p-6 overflow-y-auto">
          {page === 'calls' && <CallsPage accent={accent} />}
          {page === 'contacts' && <ContactsPage accent={accent} />}
          {page === 'appointments' && <AppointmentsPage accent={accent} />}
          {page === 'quotes' && <QuotesPage accent={accent} />}
          {page === 'invoices' && <InvoicesPage accent={accent} />}
          {page === 'assistant' && <AssistantPage accent={accent} />}
          {page === 'hours' && <HoursPage accent={accent} />}
          {page === 'settings' && <SettingsPage accent={accent} uploadLogo={uploadLogo} />}
          {page === 'subscription' && <SubscriptionPage accent={accent} />}
          {page === 'integrations' && <IntegrationsPage accent={accent} />}
        </main>
      </div>
    </div>
  )
}

// ── Page Labels ───────────────────────────────────────────────────────────────
const PAGE_LABELS: Record<Page, string> = {
  calls: 'Appels', contacts: 'Contacts', appointments: 'Rendez-vous',
  quotes: 'Devis', invoices: 'Factures',
  assistant: 'Assistante IA', hours: 'Horaires', settings: 'Paramètres',
  subscription: 'Abonnement', integrations: 'Intégrations',
}

// ── Nav Components ────────────────────────────────────────────────────────────
function NavSection({ label, visible }: { label: string; visible: boolean }) {
  if (!visible) return <div className="my-1 mx-3 border-t border-gray-100" />
  return <p className="px-3 pt-3 pb-1 text-[10px] font-semibold text-gray-400 uppercase tracking-wider">{label}</p>
}

function NavItem({ icon, label, active, onClick, open, accent }: { icon: React.ReactNode; label: string; active: boolean; onClick: () => void; open: boolean; accent: string }) {
  return (
    <button onClick={onClick} title={!open ? label : undefined}
      className={`w-full flex items-center gap-2 px-3 py-2 text-sm transition-colors rounded-none ${active ? 'font-medium' : 'text-gray-500 hover:bg-gray-50 hover:text-gray-800'}`}
      style={active ? { backgroundColor: accent + '15', color: accent } : {}}>
      <span className="w-4 h-4 flex-shrink-0 opacity-70">{icon}</span>
      {open && <span className="truncate">{label}</span>}
    </button>
  )
}

// ── Calls Page ────────────────────────────────────────────────────────────────
type CallRow = { id: string; caller_name: string | null; caller_phone: string | null; summary: string | null; status: string; created_at: string }

function CallsPage({ accent }: { accent: string }) {
  const { user } = useAuth()
  const { profile } = useProfile()
  const [calls, setCalls] = useState<CallRow[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState<string>('all')

  useEffect(() => {
    if (!user) return
    setLoading(true)
    supabase.from('calls').select('*').eq('artisan_id', user.id).order('created_at', { ascending: false }).limit(50)
      .then(({ data }) => { setCalls(data || []); setLoading(false) })

    // Temps réel — nouveaux appels insérés par Vapi
    const sub = supabase.channel('calls-realtime')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'calls', filter: `artisan_id=eq.${user.id}` },
        payload => setCalls(prev => [payload.new as CallRow, ...prev])
      )
      .subscribe()

    return () => { supabase.removeChannel(sub) }
  }, [user])

  const updateStatus = async (id: string, status: string) => {
    setCalls(prev => prev.map(c => c.id === id ? { ...c, status } : c))
    await supabase.from('calls').update({ status }).eq('id', id)
  }

  const filtered = filter === 'all' ? calls : calls.filter(c => c.status === filter)
  const todayCalls = calls.filter(c => new Date(c.created_at).toDateString() === new Date().toDateString())
  const urgentCount = calls.filter(c => c.status === 'urgent').length
  return (
    <div>
      <PageHeader title="Appels" sub="Gérez et consultez vos appels reçus" />
      <div className="grid grid-cols-4 gap-3 mb-5">
        <StatCard label="Appels aujourd'hui" value={String(todayCalls.length)} trend="via votre assistante" trendUp={todayCalls.length > 0} />
        <StatCard label="Appels urgents" value={String(urgentCount)} trend={urgentCount > 0 ? 'à traiter' : 'aucun en attente'} trendUp={false} />
        <StatCard label="Total appels" value={String(calls.length)} trend="depuis le début" />
        <StatCard label="Assistante" value={profile?.assistant_name || 'Mia'} trend="active 24/7" trendUp accent={accent} />
      </div>
      <Card>
        <div className="flex items-center justify-between mb-4">
          <div><p className="text-sm font-semibold">Appels récents</p><p className="text-xs text-gray-400 mt-0.5">Cliquez sur un statut pour le modifier</p></div>
          <div className="flex gap-1.5">
            {['all', 'new', 'pending', 'urgent', 'done'].map(f => (
              <button key={f} onClick={() => setFilter(f)}
                className={`text-xs px-2.5 py-1 rounded-md transition-colors ${filter === f ? 'text-white font-medium' : 'border border-gray-200 hover:bg-gray-50'}`}
                style={filter === f ? { background: accent } : {}}>
                {f === 'all' ? 'Tous' : f === 'new' ? 'Nouveau' : f === 'pending' ? 'En attente' : f === 'urgent' ? 'Urgent' : 'Traité'}
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
          <div className="divide-y divide-gray-100">
            {filtered.map(c => (
              <CallRow key={c.id} call={c} accent={accent} onStatusChange={updateStatus} />
            ))}
          </div>
        )}
      </Card>
    </div>
  )
}

// ── Contacts Page ─────────────────────────────────────────────────────────────
type ContactRow = { id: string; name: string; phone: string | null; email: string | null; address: string | null; created_at: string }

function ContactsPage({ accent }: { accent: string }) {
  const { user } = useAuth()
  const [contacts, setContacts] = useState<ContactRow[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [adding, setAdding] = useState(false)
  const [form, setForm] = useState({ name: '', phone: '', email: '', address: '' })
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!user) return
    supabase.from('contacts').select('*').eq('artisan_id', user.id).order('name')
      .then(({ data }) => { setContacts(data || []); setLoading(false) })
  }, [user])

  const filtered = contacts.filter(c =>
    c.name.toLowerCase().includes(search.toLowerCase()) ||
    (c.phone || '').includes(search) ||
    (c.email || '').toLowerCase().includes(search.toLowerCase())
  )

  const handleAdd = async () => {
    if (!user || !form.name.trim()) return
    setSaving(true)
    const { data } = await supabase.from('contacts').insert({ artisan_id: user.id, ...form }).select().single()
    if (data) setContacts(prev => [...prev, data as ContactRow].sort((a, b) => a.name.localeCompare(b.name)))
    setForm({ name: '', phone: '', email: '', address: '' })
    setAdding(false)
    setSaving(false)
  }

  const handleDelete = async (id: string) => {
    setContacts(prev => prev.filter(c => c.id !== id))
    await supabase.from('contacts').delete().eq('id', id)
  }

  const initials = (name: string) => name.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2)

  return (
    <div>
      <PageHeader title="Contacts" sub="Gérez votre base de données clients" />
      <Card>
        <div className="flex items-center justify-between mb-4">
          <p className="text-sm font-semibold">Contacts ({contacts.length})</p>
          <div className="flex gap-2">
            <input placeholder="Rechercher..." value={search} onChange={e => setSearch(e.target.value)}
              className="border border-gray-200 rounded-md px-3 py-1.5 text-xs outline-none focus:border-gray-400 w-44" />
            <button onClick={() => setAdding(!adding)} className="text-xs px-3 py-1.5 rounded-md text-white font-medium" style={{ background: accent }}>
              {adding ? '✕ Annuler' : '+ Ajouter'}
            </button>
          </div>
        </div>

        {adding && (
          <div className="mb-4 p-4 bg-gray-50 rounded-xl border border-gray-200">
            <p className="text-xs font-semibold text-gray-600 mb-3">Nouveau contact</p>
            <div className="grid grid-cols-2 gap-3 mb-3">
              <input placeholder="Nom *" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                className="border border-gray-200 rounded-md px-2.5 py-1.5 text-sm outline-none focus:border-gray-400" />
              <input placeholder="Téléphone" value={form.phone} onChange={e => setForm(f => ({ ...f, phone: e.target.value }))}
                className="border border-gray-200 rounded-md px-2.5 py-1.5 text-sm outline-none focus:border-gray-400" />
              <input placeholder="Email" value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))}
                className="border border-gray-200 rounded-md px-2.5 py-1.5 text-sm outline-none focus:border-gray-400" />
              <input placeholder="Adresse" value={form.address} onChange={e => setForm(f => ({ ...f, address: e.target.value }))}
                className="border border-gray-200 rounded-md px-2.5 py-1.5 text-sm outline-none focus:border-gray-400" />
            </div>
            <div className="flex justify-end">
              <button onClick={handleAdd} disabled={saving || !form.name.trim()}
                className="text-xs px-4 py-1.5 rounded-md text-white font-medium disabled:opacity-50 flex items-center gap-2"
                style={{ background: accent }}>
                {saving && <div className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin" />}
                Enregistrer
              </button>
            </div>
          </div>
        )}

        {loading ? (
          <div className="flex items-center justify-center py-10">
            <div className="w-5 h-5 border-2 border-gray-300 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-10">
            <p className="text-sm text-gray-400">{search ? 'Aucun résultat' : 'Aucun contact encore'}</p>
            {!search && <p className="text-xs text-gray-300 mt-1">Ajoutez vos clients pour les retrouver rapidement</p>}
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            {filtered.map(c => (
              <div key={c.id} className="group flex items-center gap-3 px-3 py-2.5 bg-gray-50 rounded-lg hover:bg-blue-50 transition-colors">
                <div className="w-9 h-9 rounded-full border flex items-center justify-center text-sm font-semibold flex-shrink-0"
                  style={{ background: accent + '15', color: accent, borderColor: accent + '30' }}>
                  {initials(c.name)}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium">{c.name}</p>
                  <p className="text-xs text-gray-400 mt-0.5">{[c.phone, c.email].filter(Boolean).join(' · ')}</p>
                </div>
                <button onClick={() => handleDelete(c.id)}
                  className="opacity-0 group-hover:opacity-100 w-6 h-6 flex items-center justify-center rounded text-gray-300 hover:text-red-500 hover:bg-red-50 transition-all text-sm">
                  ×
                </button>
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  )
}

// ── Quotes Page ───────────────────────────────────────────────────────────────
function QuotesPage({ accent: _accent }: { accent: string }) {
  const { profile, updateProfile } = useProfile()
  const quoteColor = profile?.quote_color || BRAND
  const [lines, setLines] = useState<QuoteLine[]>([
    { id: 1, desig: "Main d'œuvre", qty: 2, unit: 'h', pu: profile?.hourly_rate || 65, vat: profile?.vat_rate || 20 },
    { id: 2, desig: 'Déplacement', qty: 1, unit: 'forfait', pu: profile?.travel_rate || 25, vat: profile?.vat_rate || 20 },
  ])
  const [nextId, setNextId] = useState(3)
  const [clientName, setClientName] = useState('')
  const [clientAddress, setClientAddress] = useState('')
  const [clientEmail, setClientEmail] = useState('')
  const [clientPhone, setClientPhone] = useState('')
  const [quoteObject, setQuoteObject] = useState('')
  const [notes, setNotes] = useState('Devis valable 30 jours. Paiement à réception de facture, sans escompte. En cas de retard, pénalités de 3× le taux légal + indemnité forfaitaire de recouvrement de 40€. Garantie main d\'œuvre 3 mois. TVA non applicable, art. 293B du CGI (si micro-entreprise).')
  const [generating, setGenerating] = useState(false)
  const [sending, setSending] = useState(false)
  const [sendSuccess, setSendSuccess] = useState(false)
  const [_signature, setSignature] = useState<string | null>(null)
  const [emailModal, setEmailModal] = useState<{ quoteData: ReturnType<typeof buildQuoteData>; subject: string; body: string } | null>(null)
  const [customColor, setCustomColor] = useState(profile?.quote_color || '#FF6B35')
  const fileRef = useRef<HTMLInputElement>(null)
  const { uploadLogo } = useProfile()
  const { user } = useAuth()
  const [savedQuotes, setSavedQuotes] = useState<any[]>([])
  const [historyLoading, setHistoryLoading] = useState(true)

  useEffect(() => {
    if (!user) return
    supabase.from('quotes').select('*').eq('artisan_id', user.id).order('created_at', { ascending: false }).limit(30)
      .then(({ data }) => { setSavedQuotes(data || []); setHistoryLoading(false) })
  }, [user])

  const totalHT = lines.reduce((s, l) => s + l.qty * l.pu, 0)
  const totalVAT = lines.reduce((s, l) => s + l.qty * l.pu * l.vat / 100, 0)
  const totalTTC = totalHT + totalVAT

  const addLine = (type: string) => {
    const defaults: Record<string, Partial<QuoteLine>> = {
      work: { desig: "Main d'œuvre", unit: 'h', pu: profile?.hourly_rate || 65 },
      material: { desig: 'Fourniture', unit: 'u', pu: 0 },
      travel: { desig: 'Déplacement', unit: 'forfait', pu: profile?.travel_rate || 25 },
      custom: { desig: '', unit: 'u', pu: 0 },
    }
    setLines(prev => [...prev, { id: nextId, qty: 1, vat: profile?.vat_rate || 20, desig: '', unit: 'u', pu: 0, ...defaults[type] } as QuoteLine])
    setNextId(n => n + 1)
  }

  const updateLine = (id: number, field: keyof QuoteLine, value: any) => {
    setLines(prev => prev.map(l => l.id === id ? { ...l, [field]: value } : l))
  }

  const today = new Date()
  const fmt = (d: Date) => d.toLocaleDateString('fr-FR')
  const validUntil = new Date(today); validUntil.setDate(validUntil.getDate() + 30)

  function buildQuoteData(): QuoteData {
    return {
      number: `D${today.getFullYear()}-${String(Math.floor(Math.random() * 900) + 100)}`,
      date: fmt(today),
      validity: fmt(validUntil),
      object: quoteObject || 'Prestation de services',
      clientName, clientAddress, clientEmail, clientPhone, notes, lines,
    }
  }

  async function handleGeneratePDF() {
    if (!profile) return
    setGenerating(true)
    const qd = buildQuoteData()
    await generateQuotePDF(profile, qd)
    if (user) {
      const { data } = await supabase.from('quotes').insert({
        artisan_id: user.id, number: qd.number, client_name: qd.clientName,
        client_email: qd.clientEmail, object: qd.object, total_ht: totalHT, total_ttc: totalTTC, status: 'draft',
      }).select().single()
      if (data) setSavedQuotes(prev => [data, ...prev])
    }
    setGenerating(false)
  }

  function handleOpenEmailModal() {
    if (!profile || !clientEmail) return
    const quoteData = buildQuoteData()
    const fmtEur = (v: number) => v.toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' €'
    const mainLines = lines.filter(l => l.desig).map(l => `  • ${l.desig} — ${fmtEur(l.qty * l.pu)} HT`).join('\n')
    const subject = `Votre devis ${quoteData.number} — ${profile.company_name}`
    const body = `Bonjour ${clientName || ''},

Suite à notre échange, veuillez trouver ci-joint votre devis n° ${quoteData.number} concernant : ${quoteData.object}.

Détail de la prestation :
${mainLines}

Montant total TTC : ${fmtEur(totalTTC)}

Ce devis est valable jusqu'au ${quoteData.validity}. Pour l'accepter, il vous suffit de le signer et de me le renvoyer par email, ou de me le remettre lors de l'intervention.

N'hésitez pas à me contacter si vous avez des questions.

Cordialement,
${profile.company_name}${profile.phone ? '\n' + profile.phone : ''}${profile.email ? '\n' + profile.email : ''}`

    setEmailModal({ quoteData, subject, body })
  }

  async function handleConfirmSend() {
    if (!profile || !emailModal) return
    setSending(true); setSendSuccess(false)
    try {
      const base64 = await generateQuotePDF(profile, emailModal.quoteData, true)
      const { data: { session } } = await supabase.auth.getSession()
      await fetch('https://hxkpmmekaotwmzgqxafp.supabase.co/functions/v1/send-quote-email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${session?.access_token}` },
        body: JSON.stringify({
          pdfBase64: base64,
          clientEmail,
          clientName,
          companyName: profile.company_name,
          quoteNumber: emailModal.quoteData.number,
          subject: emailModal.subject,
          body: emailModal.body,
          artisanEmail: profile.email || undefined,
        }),
      })
      setSendSuccess(true)
      if (user) {
        const { data } = await supabase.from('quotes').insert({
          artisan_id: user.id, number: emailModal.quoteData.number, client_name: emailModal.quoteData.clientName,
          client_email: emailModal.quoteData.clientEmail, object: emailModal.quoteData.object,
          total_ht: totalHT, total_ttc: totalTTC, status: 'sent',
        }).select().single()
        if (data) setSavedQuotes(prev => [data, ...prev])
      }
      setEmailModal(null)
      setTimeout(() => setSendSuccess(false), 4000)
    } finally {
      setSending(false)
    }
  }

  async function handleLogoUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    await uploadLogo(file)
  }

  const handleColorSelect = (val: string) => {
    if (val !== 'custom') updateProfile({ quote_color: val })
    else updateProfile({ quote_color: customColor })
  }

  return (
    <div>
      <PageHeader title="Devis sur mesure" sub="Créez vos devis avec votre identité visuelle" />

      {/* Branding config */}
      <div className="grid grid-cols-2 gap-4 mb-5">
        {/* Logo upload */}
        <Card>
          <p className="text-sm font-semibold mb-3">Logo de l'entreprise</p>
          <div className="flex items-center gap-4">
            <div className="w-20 h-16 border-2 border-dashed border-gray-200 rounded-lg flex items-center justify-center overflow-hidden cursor-pointer hover:border-gray-400 transition-colors flex-shrink-0" onClick={() => fileRef.current?.click()}>
              {profile?.logo_url
                ? <img src={profile.logo_url} alt="logo" className="w-full h-full object-contain p-1" />
                : <span className="text-xs text-gray-400 text-center leading-tight px-1">Importer votre logo</span>}
            </div>
            <div>
              <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={handleLogoUpload} />
              <button onClick={() => fileRef.current?.click()} className="text-xs border border-gray-200 px-3 py-1.5 rounded-md hover:bg-gray-50 transition-colors block mb-2">
                {profile?.logo_url ? 'Changer le logo' : 'Importer (PNG, JPG)'}
              </button>
              <p className="text-[11px] text-gray-400">Affiché sur tous vos devis PDF. Max 2 Mo.</p>
            </div>
          </div>
        </Card>

        {/* Color picker */}
        <Card>
          <p className="text-sm font-semibold mb-3">Couleur des devis</p>
          <div className="flex flex-wrap gap-2 mb-3">
            {ACCENT_COLORS.map(c => (
              <button key={c.value} onClick={() => handleColorSelect(c.value)}
                title={c.label}
                className="w-7 h-7 rounded-full border-2 transition-all flex-shrink-0"
                style={{
                  background: c.value === 'custom' ? customColor : c.value,
                  borderColor: profile?.quote_color === (c.value === 'custom' ? customColor : c.value) ? '#1A1A1A' : 'transparent',
                  outline: c.value === 'custom' ? `2px dashed #D1D5DB` : undefined,
                }}
              />
            ))}
          </div>
          <div className="flex items-center gap-2">
            <label className="text-xs text-gray-500">Couleur personnalisée :</label>
            <input type="color" value={profile?.quote_color || '#FF6B35'}
              onChange={e => { setCustomColor(e.target.value); updateProfile({ quote_color: e.target.value }) }}
              className="w-8 h-7 rounded cursor-pointer border border-gray-200 p-0.5" />
            <span className="text-xs text-gray-400 font-mono">{profile?.quote_color || '#FF6B35'}</span>
          </div>
        </Card>
      </div>

      {/* Tarifs de base */}
      <div className="rounded-xl border px-4 py-3 mb-5" style={{ background: quoteColor + '12', borderColor: quoteColor + '30' }}>
        <p className="text-sm font-semibold mb-3" style={{ color: quoteColor }}>Tarifs de base (pré-remplit les lignes automatiquement)</p>
        <div className="grid grid-cols-3 gap-3">
          <Field label="Taux horaire main d'œuvre">
            <div className="flex items-center gap-2">
              <input type="number" value={profile?.hourly_rate} onChange={e => updateProfile({ hourly_rate: +e.target.value })}
                className="w-20 border border-gray-200 rounded-md px-2.5 py-1.5 text-sm outline-none focus:border-gray-400" />
              <span className="text-xs text-gray-500">€/h HT</span>
            </div>
          </Field>
          <Field label="Frais de déplacement">
            <div className="flex items-center gap-2">
              <input type="number" value={profile?.travel_rate} onChange={e => updateProfile({ travel_rate: +e.target.value })}
                className="w-20 border border-gray-200 rounded-md px-2.5 py-1.5 text-sm outline-none focus:border-gray-400" />
              <span className="text-xs text-gray-500">€ fixe</span>
            </div>
          </Field>
          <Field label="TVA par défaut">
            <select value={profile?.vat_rate} onChange={e => updateProfile({ vat_rate: +e.target.value })}
              className="border border-gray-200 rounded-md px-2.5 py-1.5 text-sm outline-none focus:border-gray-400">
              <option value={20}>20 %</option><option value={10}>10 %</option>
              <option value={5.5}>5,5 %</option><option value={0}>0 %</option>
            </select>
          </Field>
        </div>
      </div>

      {/* Quote form */}
      <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <div>
            <p className="text-[15px] font-semibold">Nouveau devis</p>
            <p className="text-xs text-gray-400 mt-0.5">Devis n° D{today.getFullYear()}-001</p>
          </div>
          <div className="flex gap-2 items-center">
            {sendSuccess && <span className="text-xs text-emerald-600 font-medium">✓ Devis envoyé</span>}
            <button onClick={handleGeneratePDF} disabled={generating}
              className="text-sm px-4 py-2 rounded-lg font-medium border border-gray-200 hover:bg-gray-50 transition-colors disabled:opacity-50 flex items-center gap-2">
              {generating && <div className="w-3.5 h-3.5 border-2 border-gray-400 border-t-transparent rounded-full animate-spin" />}
              {generating ? 'Génération...' : '↓ Télécharger'}
            </button>
            <button onClick={handleOpenEmailModal} disabled={sending || !clientEmail}
              className="text-sm px-4 py-2 rounded-lg text-white font-medium transition-opacity disabled:opacity-50 flex items-center gap-2"
              style={{ background: quoteColor }}>
              {sending && <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />}
              {sending ? 'Envoi...' : '✉ Envoyer par email'}
            </button>
          </div>
        </div>

        <div className="p-5">
          {/* Client + Meta */}
          <div className="grid grid-cols-4 gap-3 mb-5">
            <Field label="Client" className="col-span-1">
              <input value={clientName} onChange={e => setClientName(e.target.value)} placeholder="Nom du client" className="w-full border border-gray-200 rounded-md px-2.5 py-1.5 text-sm outline-none focus:border-gray-400" />
            </Field>
            <Field label="Adresse client">
              <input value={clientAddress} onChange={e => setClientAddress(e.target.value)} placeholder="Adresse" className="w-full border border-gray-200 rounded-md px-2.5 py-1.5 text-sm outline-none focus:border-gray-400" />
            </Field>
            <Field label="Email client">
              <input value={clientEmail} onChange={e => setClientEmail(e.target.value)} placeholder="email@client.fr" className="w-full border border-gray-200 rounded-md px-2.5 py-1.5 text-sm outline-none focus:border-gray-400" />
            </Field>
            <Field label="Téléphone">
              <input value={clientPhone} onChange={e => setClientPhone(e.target.value)} placeholder="+33 6..." className="w-full border border-gray-200 rounded-md px-2.5 py-1.5 text-sm outline-none focus:border-gray-400" />
            </Field>
          </div>
          <div className="grid grid-cols-3 gap-3 mb-5">
            <Field label="Objet du devis" className="col-span-2">
              <input value={quoteObject} onChange={e => setQuoteObject(e.target.value)} placeholder="Ex: Réparation fuite robinetterie..." className="w-full border border-gray-200 rounded-md px-2.5 py-1.5 text-sm outline-none focus:border-gray-400" />
            </Field>
            <Field label="Date">
              <input type="date" defaultValue={today.toISOString().split('T')[0]} className="w-full border border-gray-200 rounded-md px-2.5 py-1.5 text-sm outline-none focus:border-gray-400" />
            </Field>
          </div>

          {/* Lines table */}
          <div className="border border-gray-200 rounded-lg overflow-hidden mb-4">
            <table className="w-full text-sm">
              <thead>
                <tr style={{ background: quoteColor }}>
                  {['Désignation', 'Qté', 'Unité', 'P.U. HT', 'TVA', 'Total HT', ''].map((h, i) => (
                    <th key={i} className="text-left text-white text-xs font-semibold px-3 py-2.5" style={{ textAlign: i > 0 && i < 6 ? 'right' : 'left' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {lines.map((line, i) => (
                  <tr key={line.id} className={i % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
                    <td className="px-3 py-2" style={{ width: '38%' }}>
                      <input value={line.desig} onChange={e => updateLine(line.id, 'desig', e.target.value)} className="w-full bg-transparent text-sm outline-none border-b border-transparent focus:border-gray-300" placeholder="Description..." />
                    </td>
                    <td className="px-2 py-2 text-right" style={{ width: '8%' }}>
                      <input type="number" value={line.qty} step="0.5" onChange={e => updateLine(line.id, 'qty', +e.target.value || 0)} className="w-14 text-right bg-transparent border border-transparent focus:border-gray-300 rounded px-1 py-0.5 text-sm outline-none" />
                    </td>
                    <td className="px-2 py-2 text-right" style={{ width: '8%' }}>
                      <input value={line.unit} onChange={e => updateLine(line.id, 'unit', e.target.value)} className="w-14 text-right bg-transparent text-sm outline-none border-b border-transparent focus:border-gray-300" />
                    </td>
                    <td className="px-2 py-2 text-right" style={{ width: '12%' }}>
                      <input type="number" value={line.pu} step="0.01" onChange={e => updateLine(line.id, 'pu', +e.target.value || 0)} className="w-20 text-right bg-transparent border border-transparent focus:border-gray-300 rounded px-1 py-0.5 text-sm outline-none" />
                    </td>
                    <td className="px-2 py-2 text-right" style={{ width: '9%' }}>
                      <select value={line.vat} onChange={e => updateLine(line.id, 'vat', +e.target.value)} className="text-xs bg-transparent outline-none cursor-pointer">
                        <option value={20}>20 %</option><option value={10}>10 %</option>
                        <option value={5.5}>5,5 %</option><option value={0}>0 %</option>
                      </select>
                    </td>
                    <td className="px-3 py-2 text-right text-sm font-medium" style={{ width: '13%' }}>
                      {(line.qty * line.pu).toLocaleString('fr-FR', { minimumFractionDigits: 2 })} €
                    </td>
                    <td className="px-2 py-2" style={{ width: '4%' }}>
                      <button onClick={() => setLines(prev => prev.filter(l => l.id !== line.id))} className="w-5 h-5 flex items-center justify-center text-gray-300 hover:text-red-500 hover:bg-red-50 rounded transition-colors text-base">×</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="flex gap-2 mb-6 flex-wrap">
            {[['work', "Main d'œuvre"], ['material', 'Fourniture'], ['travel', 'Déplacement'], ['custom', 'Ligne libre']].map(([type, label]) => (
              <button key={type} onClick={() => addLine(type)} className="text-xs border border-gray-200 px-3 py-1.5 rounded-md hover:bg-gray-50 transition-colors">+ {label}</button>
            ))}
          </div>

          {/* Totals */}
          <div className="flex justify-end">
            <div className="w-72">
              <div className="flex justify-between text-sm text-gray-500 mb-2"><span>Total HT</span><span>{totalHT.toLocaleString('fr-FR', { minimumFractionDigits: 2 })} €</span></div>
              <div className="flex justify-between text-sm text-gray-500 mb-3"><span>TVA {lines[0]?.vat ?? 20} %</span><span>{totalVAT.toLocaleString('fr-FR', { minimumFractionDigits: 2 })} €</span></div>
              <div className="flex justify-between items-center text-base font-semibold px-4 py-3 rounded-xl" style={{ background: quoteColor + '15' }}>
                <span>Total TTC</span>
                <span style={{ color: quoteColor }}>{totalTTC.toLocaleString('fr-FR', { minimumFractionDigits: 2 })} €</span>
              </div>
            </div>
          </div>

          {/* Signature */}
          <div className="mt-5 pt-4 border-t border-gray-100">
            <div className="grid grid-cols-2 gap-4 mb-4">
              <div>
                <label className="text-xs text-gray-500 block mb-1.5">Signature de l'artisan</label>
                <SignaturePad onChange={setSignature} />
              </div>
              <div>
                <label className="text-xs text-gray-400 block mb-1.5">Signature du client (sur document imprimé)</label>
                <div className="h-[80px] border border-dashed border-gray-200 rounded-lg flex items-center justify-center">
                  <span className="text-xs text-gray-300">Bon pour accord</span>
                </div>
              </div>
            </div>
          </div>

          {/* Notes */}
          <div className="pt-4 border-t border-gray-100">
            <label className="text-xs text-gray-500 block mb-1.5">Notes / Conditions</label>
            <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={3}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-gray-400 resize-none" />
          </div>
        </div>
      </div>

      {/* Historique des devis */}
      <div className="mt-5">
        <Card>
          <div className="flex items-center justify-between mb-4">
            <div>
              <p className="text-sm font-semibold">Historique des devis</p>
              <p className="text-xs text-gray-400 mt-0.5">{savedQuotes.length} devis enregistrés</p>
            </div>
          </div>
          {historyLoading ? (
            <div className="flex items-center justify-center py-8">
              <div className="w-5 h-5 border-2 border-gray-300 border-t-transparent rounded-full animate-spin" />
            </div>
          ) : savedQuotes.length === 0 ? (
            <div className="text-center py-8">
              <p className="text-sm text-gray-400">Aucun devis enregistré</p>
              <p className="text-xs text-gray-300 mt-1">Ils apparaîtront ici après génération ou envoi</p>
            </div>
          ) : (
            <div className="divide-y divide-gray-100">
              {savedQuotes.map(q => (
                <div key={q.id} className="group flex items-center gap-3 py-2.5">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-medium font-mono">{q.number}</p>
                      <QuoteBadge status={q.status} />
                    </div>
                    <p className="text-xs text-gray-400 mt-0.5">{q.client_name || 'Client non renseigné'}{q.object ? ` · ${q.object}` : ''}</p>
                  </div>
                  <div className="text-right flex-shrink-0">
                    <p className="text-sm font-semibold" style={{ color: quoteColor }}>
                      {q.total_ttc?.toLocaleString('fr-FR', { minimumFractionDigits: 2 })} €
                    </p>
                    <p className="text-xs text-gray-400">{new Date(q.created_at).toLocaleDateString('fr-FR')}</p>
                  </div>
                  <select value={q.status}
                    onChange={async e => {
                      const s = e.target.value
                      setSavedQuotes(prev => prev.map(sq => sq.id === q.id ? { ...sq, status: s } : sq))
                      await supabase.from('quotes').update({ status: s }).eq('id', q.id)
                    }}
                    className="text-xs border border-gray-200 rounded-md px-2 py-1 outline-none ml-2 cursor-pointer">
                    <option value="draft">Brouillon</option>
                    <option value="sent">Envoyé</option>
                    <option value="accepted">Accepté</option>
                    <option value="refused">Refusé</option>
                  </select>
                  <button
                    onClick={async () => {
                      setSavedQuotes(prev => prev.filter(sq => sq.id !== q.id))
                      await supabase.from('quotes').delete().eq('id', q.id)
                    }}
                    className="opacity-0 group-hover:opacity-100 w-6 h-6 flex items-center justify-center rounded text-gray-300 hover:text-red-500 hover:bg-red-50 transition-all text-sm ml-1">
                    ×
                  </button>
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>

      {/* Email preview modal */}
      {emailModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={() => setEmailModal(null)}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-xl max-h-[90vh] flex flex-col" onClick={e => e.stopPropagation()}>
            {/* Header */}
            <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between flex-shrink-0">
              <div>
                <p className="font-semibold text-[15px]">Aperçu du mail</p>
                <p className="text-xs text-gray-400 mt-0.5">Relisez et modifiez avant d'envoyer</p>
              </div>
              <button onClick={() => setEmailModal(null)} className="w-7 h-7 flex items-center justify-center rounded-full hover:bg-gray-100 text-gray-400 hover:text-gray-600 transition-colors text-lg">×</button>
            </div>

            {/* Body */}
            <div className="px-6 py-4 flex-1 overflow-y-auto flex flex-col gap-3">
              <div>
                <label className="text-xs font-medium text-gray-500 block mb-1">À</label>
                <div className="border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-700 bg-gray-50">{clientEmail}</div>
              </div>
              <div>
                <label className="text-xs font-medium text-gray-500 block mb-1">Objet</label>
                <input value={emailModal.subject} onChange={e => setEmailModal(m => m ? { ...m, subject: e.target.value } : m)}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-gray-400" />
              </div>
              <div className="flex-1">
                <label className="text-xs font-medium text-gray-500 block mb-1">Corps du message</label>
                <textarea value={emailModal.body} onChange={e => setEmailModal(m => m ? { ...m, body: e.target.value } : m)}
                  rows={12} className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-gray-400 resize-none font-mono leading-relaxed" />
              </div>
              <p className="text-xs text-gray-400 flex items-center gap-1.5">
                <span>📎</span> Le devis PDF sera automatiquement joint à ce mail.
              </p>
            </div>

            {/* Footer */}
            <div className="px-6 py-4 border-t border-gray-100 flex justify-end gap-3 flex-shrink-0">
              <button onClick={() => setEmailModal(null)} className="text-sm px-4 py-2 rounded-lg border border-gray-200 hover:bg-gray-50 transition-colors">Annuler</button>
              <button onClick={handleConfirmSend} disabled={sending}
                className="text-sm px-5 py-2 rounded-lg text-white font-medium transition-opacity disabled:opacity-50 flex items-center gap-2"
                style={{ background: quoteColor }}>
                {sending && <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />}
                {sending ? 'Envoi en cours...' : 'Envoyer le devis'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ── Appointments Page ─────────────────────────────────────────────────────────
function AppointmentsPage({ accent }: { accent: string }) {
  return (
    <div>
      <PageHeader title="Rendez-vous" sub="Gérez la prise de rendez-vous de vos clients" />
      <Card>
        <div className="flex items-center justify-between mb-6">
          <p className="text-sm font-semibold">Agenda</p>
          <button className="text-xs px-3 py-1.5 rounded-md text-white font-medium" style={{ background: accent }}>
            + Nouveau rendez-vous
          </button>
        </div>
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <div className="w-14 h-14 rounded-2xl flex items-center justify-center mb-4" style={{ background: accent + '15' }}>
            <span className="w-7 h-7" style={{ color: accent }}><CalendarIcon /></span>
          </div>
          <p className="text-sm font-medium text-gray-700 mb-1">Aucun rendez-vous configuré</p>
          <p className="text-xs text-gray-400 max-w-xs">Connectez Cal.com pour permettre à votre assistante IA de créer des rendez-vous pendant les appels.</p>
          <button className="mt-4 text-xs px-4 py-2 rounded-lg border border-gray-200 hover:bg-gray-50 transition-colors font-medium">
            Connecter Cal.com
          </button>
        </div>
      </Card>
    </div>
  )
}

// ── Invoices Page ─────────────────────────────────────────────────────────────
function InvoicesPage({ accent }: { accent: string }) {
  const { user } = useAuth()
  const [invoices, setInvoices] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!user) return
    supabase.from('invoices').select('*').eq('artisan_id', user.id).order('created_at', { ascending: false }).limit(30)
      .then(({ data }) => { setInvoices(data || []); setLoading(false) })
  }, [user])

  const statusCfg: Record<string, { bg: string; text: string; label: string }> = {
    draft:   { bg: 'bg-gray-100',    text: 'text-gray-600',    label: 'Brouillon' },
    sent:    { bg: 'bg-blue-100',    text: 'text-blue-700',    label: 'Envoyée' },
    paid:    { bg: 'bg-emerald-100', text: 'text-emerald-700', label: 'Payée' },
    overdue: { bg: 'bg-red-100',     text: 'text-red-700',     label: 'En retard' },
  }

  return (
    <div>
      <PageHeader title="Factures" sub="Toutes vos factures générées depuis les devis acceptés" />
      <Card>
        <div className="flex items-center justify-between mb-4">
          <p className="text-sm font-semibold">Factures ({invoices.length})</p>
          <button className="text-xs px-3 py-1.5 rounded-md text-white font-medium" style={{ background: accent }}>
            + Nouvelle facture
          </button>
        </div>
        {loading ? (
          <div className="flex items-center justify-center py-10">
            <div className="w-5 h-5 border-2 border-gray-300 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : invoices.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <div className="w-14 h-14 rounded-2xl flex items-center justify-center mb-4" style={{ background: accent + '15' }}>
              <span className="w-7 h-7" style={{ color: accent }}><InvoiceIcon /></span>
            </div>
            <p className="text-sm font-medium text-gray-700 mb-1">Aucune facture pour l'instant</p>
            <p className="text-xs text-gray-400 max-w-xs">Les factures seront générées automatiquement lorsqu'un client acceptera un devis.</p>
          </div>
        ) : (
          <div className="divide-y divide-gray-100">
            {invoices.map((inv: any) => {
              const s = statusCfg[inv.status] || statusCfg.draft
              return (
                <div key={inv.id} className="flex items-center gap-3 py-2.5">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-medium font-mono">{inv.number}</p>
                      <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${s.bg} ${s.text}`}>{s.label}</span>
                    </div>
                    <p className="text-xs text-gray-400 mt-0.5">{inv.client_name || 'Client non renseigné'}</p>
                  </div>
                  <div className="text-right flex-shrink-0">
                    <p className="text-sm font-semibold" style={{ color: accent }}>
                      {inv.total_ttc?.toLocaleString('fr-FR', { minimumFractionDigits: 2 })} €
                    </p>
                    <p className="text-xs text-gray-400">{new Date(inv.created_at).toLocaleDateString('fr-FR')}</p>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </Card>
    </div>
  )
}

// ── Integrations Page ─────────────────────────────────────────────────────────
function IntegrationsPage({ accent: _accent }: { accent: string }) {
  const integrations = [
    { name: 'Cal.com', desc: 'Prise de rendez-vous en ligne', status: 'disconnected', icon: '📅' },
    { name: 'Google Calendar', desc: 'Synchronisation de votre agenda', status: 'disconnected', icon: '🗓️' },
    { name: 'Stripe', desc: 'Paiement en ligne et abonnements', status: 'connected', icon: '💳' },
    { name: 'Vapi', desc: 'Assistante vocale IA 24/7', status: 'connected', icon: '🤖' },
    { name: 'Twilio', desc: 'Numéro de téléphone professionnel', status: 'pending', icon: '📞' },
  ]
  const statusCfg = {
    connected:    { label: 'Connecté',      cls: 'bg-emerald-100 text-emerald-700' },
    disconnected: { label: 'Non connecté',  cls: 'bg-gray-100 text-gray-500' },
    pending:      { label: 'En attente',    cls: 'bg-amber-100 text-amber-700' },
  }
  return (
    <div>
      <PageHeader title="Intégrations" sub="Gérez les connexions avec vos services externes" />
      <Card>
        <div className="flex flex-col divide-y divide-gray-100">
          {integrations.map(intg => {
            const s = statusCfg[intg.status as keyof typeof statusCfg]
            return (
              <div key={intg.name} className="flex items-center gap-4 py-4">
                <div className="w-10 h-10 rounded-xl border border-gray-200 flex items-center justify-center text-xl flex-shrink-0 bg-gray-50">
                  {intg.icon}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium">{intg.name}</p>
                  <p className="text-xs text-gray-400 mt-0.5">{intg.desc}</p>
                </div>
                <span className={`text-[11px] font-semibold px-2.5 py-1 rounded-full flex-shrink-0 ${s.cls}`}>{s.label}</span>
                {intg.status === 'disconnected' && (
                  <button className="text-xs px-3 py-1.5 rounded-md font-medium border border-gray-200 hover:bg-gray-50 transition-colors flex-shrink-0">
                    Connecter
                  </button>
                )}
              </div>
            )
          })}
        </div>
      </Card>
    </div>
  )
}

// ── Assistant Page ────────────────────────────────────────────────────────────
function AssistantPage({ accent }: { accent: string }) {
  const { profile, updateProfile } = useProfile()
  if (!profile) return null
  return (
    <div>
      <PageHeader title="Assistante IA" sub="Configurez les paramètres de votre assistante" />
      <div className="grid grid-cols-2 gap-4 mb-4">
        <Card>
          <p className="text-sm font-semibold mb-4">Identité</p>
          <Field label="Prénom de l'assistante"><input value={profile.assistant_name} onChange={e => updateProfile({ assistant_name: e.target.value })} className="w-full border border-gray-200 rounded-md px-2.5 py-1.5 text-sm outline-none focus:border-gray-400" /></Field>
          <div className="h-3" />
          <Field label="Type de voix">
            <select value={profile.assistant_voice} onChange={e => updateProfile({ assistant_voice: e.target.value })} className="w-full border border-gray-200 rounded-md px-2.5 py-1.5 text-sm outline-none">
              {['Féminine conviviale','Féminine professionnelle','Féminine énergique','Masculine conviviale'].map(v => <option key={v}>{v}</option>)}
            </select>
          </Field>
        </Card>
        <Card>
          <p className="text-sm font-semibold mb-4">Messages</p>
          <Field label="Pendant les horaires d'ouverture"><textarea value={profile.greeting_open} onChange={e => updateProfile({ greeting_open: e.target.value })} rows={3} className="w-full border border-gray-200 rounded-lg px-2.5 py-2 text-sm outline-none resize-none focus:border-gray-400" /></Field>
          <div className="h-3" />
          <Field label="Hors horaires"><textarea value={profile.greeting_closed} onChange={e => updateProfile({ greeting_closed: e.target.value })} rows={3} className="w-full border border-gray-200 rounded-lg px-2.5 py-2 text-sm outline-none resize-none focus:border-gray-400" /></Field>
        </Card>
      </div>
      <Card>
        <div className="flex items-center justify-between mb-4"><p className="text-sm font-semibold">Raisons d'appel</p><button className="text-xs px-3 py-1.5 rounded-md text-white" style={{ background: accent }}>+ Ajouter</button></div>
        {[
          { label: "Demande de devis plomberie", desc: "Collecte motif, nom, tél et heure de rappel", on: true },
          { label: "Urgence fuite / dégât des eaux", desc: "Transfert immédiat + SMS artisan", on: true },
          { label: "Demande de devis électricité", desc: "Collecte motif, nom, tél et heure de rappel", on: true },
          { label: "Prise de rendez-vous", desc: "Synchronise avec Cal.com", on: false },
        ].map((r, i) => <ToggleRow key={i} label={r.label} desc={r.desc} defaultOn={r.on} accent={accent} />)}
      </Card>
    </div>
  )
}

// ── Hours Page ────────────────────────────────────────────────────────────────
type DaySlot = { day: string; open: string; close: string; on: boolean }

const DEFAULT_HOURS: DaySlot[] = [
  { day: 'Lundi', open: '08:00', close: '18:00', on: true },
  { day: 'Mardi', open: '08:00', close: '18:00', on: true },
  { day: 'Mercredi', open: '08:00', close: '18:00', on: true },
  { day: 'Jeudi', open: '08:00', close: '18:00', on: true },
  { day: 'Vendredi', open: '08:00', close: '17:00', on: true },
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

  const updateDay = (i: number, field: keyof DaySlot, value: any) => {
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
      <Card className="mb-4">
        <div className="flex items-center justify-between mb-4">
          <p className="text-sm font-semibold">Plages horaires</p>
          <div className="flex items-center gap-3">
            {saved && <span className="text-xs text-emerald-600 font-medium">✓ Enregistré</span>}
            <button onClick={handleSave} className="text-xs px-3 py-1.5 rounded-md text-white" style={{ background: accent }}>Enregistrer</button>
          </div>
        </div>
        <div className="flex flex-col gap-3">
          {days.map((d, i) => (
            <div key={d.day} className="flex items-center gap-4">
              <span className="text-sm font-medium w-24">{d.day}</span>
              {d.on
                ? <div className="flex items-center gap-2 text-sm text-gray-500">
                    <input type="time" value={d.open} onChange={e => updateDay(i, 'open', e.target.value)}
                      className="border border-gray-200 rounded-md px-2 py-1 text-xs text-center outline-none focus:border-gray-400" />
                    <span>à</span>
                    <input type="time" value={d.close} onChange={e => updateDay(i, 'close', e.target.value)}
                      className="border border-gray-200 rounded-md px-2 py-1 text-xs text-center outline-none focus:border-gray-400" />
                  </div>
                : <span className="text-sm text-gray-300 italic">Fermé</span>}
              <button onClick={() => updateDay(i, 'on', !d.on)}
                className={`relative w-9 h-5 rounded-full transition-colors flex-shrink-0 ml-auto`}
                style={{ background: d.on ? accent : '#D1D5DB' }}>
                <span className={`absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform ${d.on ? 'translate-x-[18px]' : 'translate-x-0.5'}`} />
              </button>
            </div>
          ))}
        </div>
      </Card>
      <Card>
        <p className="text-sm font-semibold mb-4">Notifications et transfert</p>
        <ToggleRow label="Transfert d'appel externe actif" desc="Numéro de destination configuré dans vos paramètres" defaultOn={true} accent={accent} />
        <ToggleRow label="SMS résumé après appel" desc="Résumé envoyé en moins de 30 secondes" defaultOn={true} accent={accent} />
        <ToggleRow label="Email de synthèse quotidien" desc="Rapport envoyé chaque soir" defaultOn={true} accent={accent} />
      </Card>
    </div>
  )
}

// ── Settings Page ─────────────────────────────────────────────────────────────
function SettingsPage({ accent: _accent, uploadLogo: _uploadLogo }: { accent: string; uploadLogo: (f: File) => Promise<string | null> }) {
  const { profile, updateProfile } = useProfile()
  if (!profile) return null
  return (
    <div>
      <PageHeader title="Paramètres" sub="Informations de votre entreprise" />
      <div className="grid grid-cols-2 gap-4">
        <Card>
          <p className="text-sm font-semibold mb-4">Informations entreprise</p>
          <Field label="Nom de l'entreprise"><input value={profile.company_name} onChange={e => updateProfile({ company_name: e.target.value })} className="w-full border border-gray-200 rounded-md px-2.5 py-1.5 text-sm outline-none focus:border-gray-400" /></Field>
          <div className="h-3" />
          <Field label="Type d'activité">
            <select value={profile.company_type} onChange={e => updateProfile({ company_type: e.target.value })} className="w-full border border-gray-200 rounded-md px-2.5 py-1.5 text-sm outline-none">
              {['Plomberie / Chauffage / Climatisation','Électricité / Solaire','Services à domicile','Menuiserie / Charpenterie','Peinture','Autre'].map(t => <option key={t}>{t}</option>)}
            </select>
          </Field>
          <div className="h-3" />
          <Field label="Email"><input value={profile.email} onChange={e => updateProfile({ email: e.target.value })} className="w-full border border-gray-200 rounded-md px-2.5 py-1.5 text-sm outline-none focus:border-gray-400" /></Field>
          <div className="h-3" />
          <Field label="Téléphone"><input value={profile.phone} onChange={e => updateProfile({ phone: e.target.value })} className="w-full border border-gray-200 rounded-md px-2.5 py-1.5 text-sm outline-none focus:border-gray-400" /></Field>
          <div className="h-3" />
          <Field label="SIRET"><input value={profile.siret} onChange={e => updateProfile({ siret: e.target.value })} className="w-full border border-gray-200 rounded-md px-2.5 py-1.5 text-sm outline-none focus:border-gray-400" /></Field>
          <div className="h-3" />
          <Field label="N° RC Pro (assurance)"><input value={(profile as any).rc_pro || ''} onChange={e => updateProfile({ rc_pro: e.target.value } as any)} placeholder="Ex: MRB-2024-XXXXXXX" className="w-full border border-gray-200 rounded-md px-2.5 py-1.5 text-sm outline-none focus:border-gray-400" /></Field>
        </Card>
        <Card>
          <p className="text-sm font-semibold mb-4">Zone d'intervention</p>
          <Field label="Adresse"><input value={profile.address} onChange={e => updateProfile({ address: e.target.value })} className="w-full border border-gray-200 rounded-md px-2.5 py-1.5 text-sm outline-none focus:border-gray-400" /></Field>
          <div className="h-3" />
          <Field label="Numéro Twilio (assistant)"><input value={profile.twilio_number || ''} onChange={e => updateProfile({ twilio_number: e.target.value })} placeholder="+33 1 XX XX XX XX" className="w-full border border-gray-200 rounded-md px-2.5 py-1.5 text-sm outline-none focus:border-gray-400" /></Field>
          <div className="h-3" />
          <div>
            <label className="text-xs text-gray-500 block mb-1.5">Statuts des appels</label>
            <div className="flex gap-2 flex-wrap">
              <Badge type="new" /><Badge type="pending" /><Badge type="done" />
              <span className="text-xs px-2 py-0.5 rounded-full border border-dashed border-gray-300 text-gray-400 cursor-pointer hover:border-gray-400">+ Ajouter</span>
            </div>
          </div>
        </Card>
      </div>
    </div>
  )
}

// ── Subscription Page ─────────────────────────────────────────────────────────
function SubscriptionPage({ accent }: { accent: string }) {
  const [selected, setSelected] = useState(1)
  const plans = [
    { name: 'Solo', price: 79, desc: '150 appels · 1 artisan', features: ['Secrétaire IA 24/7','SMS résumé 30 sec','Devis sur mesure','Support email'] },
    { name: 'Pro', price: 149, desc: 'Appels illimités · 1 artisan', features: ['Tout Solo inclus','Appels illimités','Transfert intelligent','Statistiques avancées'], popular: true },
    { name: 'Équipe', price: 249, desc: 'Appels illimités · 5 artisans', features: ['Tout Pro inclus','Jusqu\'à 5 artisans','Tableau de bord équipe','Support prioritaire'] },
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

function Field({ label, children, className = '' }: { label: string; children: React.ReactNode; className?: string }) {
  return <div className={className}><label className="text-xs text-gray-500 block mb-1">{label}</label>{children}</div>
}

function CallRow({ call: c, accent, onStatusChange }: { call: CallRow; accent: string; onStatusChange: (id: string, status: string) => void }) {
  const [expanded, setExpanded] = useState(false)
  const fmtTime = (iso: string) => new Date(iso).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })
  const initials = (name: string | null) => name ? name.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2) : '?'
  const statusColors = {
    urgent: { bg: '#FEE2E2', text: '#B91C1C' },
    pending: { bg: '#FEF3C7', text: '#92400E' },
    new: { bg: '#DBEAFE', text: '#1D4ED8' },
    done: { bg: '#D1FAE5', text: '#065F46' },
  }
  const sc = statusColors[c.status as keyof typeof statusColors] || statusColors.new

  return (
    <div className="py-2.5">
      <div className="flex items-start gap-3 cursor-pointer" onClick={() => c.summary && setExpanded(!expanded)}>
        <div className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-semibold flex-shrink-0 mt-0.5" style={{ background: accent + '20', color: accent }}>
          {initials(c.caller_name)}
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium">{c.caller_name || c.caller_phone || 'Inconnu'}</p>
          <p className={`text-xs text-gray-400 mt-0.5 ${expanded ? '' : 'truncate'}`}>
            {c.summary || 'Résumé non disponible'}
          </p>
          {c.summary && (
            <button className="text-[10px] text-gray-300 hover:text-gray-500 mt-0.5 transition-colors">
              {expanded ? '▲ Réduire' : '▼ Voir le résumé complet'}
            </button>
          )}
        </div>
        <div className="text-right flex-shrink-0 flex flex-col items-end gap-1">
          <p className="text-xs text-gray-400">{fmtTime(c.created_at)}</p>
          <select value={c.status}
            onChange={e => { e.stopPropagation(); onStatusChange(c.id, e.target.value) }}
            onClick={e => e.stopPropagation()}
            className="text-[10px] font-semibold px-2 py-0.5 rounded-full border-0 cursor-pointer outline-none"
            style={{ background: sc.bg, color: sc.text }}>
            <option value="new">Nouveau</option>
            <option value="pending">En attente</option>
            <option value="urgent">Urgent</option>
            <option value="done">Traité</option>
          </select>
        </div>
      </div>
    </div>
  )
}

function QuoteBadge({ status }: { status: string }) {
  const cfg: Record<string, { bg: string; text: string; label: string }> = {
    draft: { bg: 'bg-gray-100', text: 'text-gray-600', label: 'Brouillon' },
    sent: { bg: 'bg-blue-100', text: 'text-blue-700', label: 'Envoyé' },
    accepted: { bg: 'bg-emerald-100', text: 'text-emerald-700', label: 'Accepté' },
    refused: { bg: 'bg-red-100', text: 'text-red-700', label: 'Refusé' },
  }
  const s = cfg[status] || cfg.draft
  return <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${s.bg} ${s.text}`}>{s.label}</span>
}

function Badge({ type }: { type: 'urgent' | 'pending' | 'new' | 'done' }) {
  const styles: Record<string, string> = {
    urgent: 'bg-red-100 text-red-700',
    pending: 'bg-amber-100 text-amber-800',
    new: 'bg-blue-100 text-blue-700',
    done: 'bg-emerald-100 text-emerald-700',
  }
  const labels: Record<string, string> = { urgent: 'Urgent', pending: 'En attente', new: 'Nouveau', done: 'Traité' }
  return <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${styles[type]}`}>{labels[type]}</span>
}

function Toggle({ defaultOn, accent, className = '' }: { defaultOn: boolean; accent: string; className?: string }) {
  const [on, setOn] = useState(defaultOn)
  return (
    <button onClick={() => setOn(!on)} className={`relative w-9 h-5 rounded-full transition-colors flex-shrink-0 ${className}`} style={{ background: on ? accent : '#D1D5DB' }}>
      <span className={`absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform ${on ? 'translate-x-[18px]' : 'translate-x-0.5'}`} />
    </button>
  )
}

function ToggleRow({ label, desc, defaultOn, accent }: { label: string; desc: string; defaultOn: boolean; accent: string }) {
  return (
    <div className="flex items-center justify-between py-3 border-b border-gray-100 last:border-0">
      <div><p className="text-sm font-medium">{label}</p><p className="text-xs text-gray-400 mt-0.5">{desc}</p></div>
      <Toggle defaultOn={defaultOn} accent={accent} className="ml-4" />
    </div>
  )
}

// ── Signature Pad ─────────────────────────────────────────────────────────────
function SignaturePad({ onChange }: { onChange: (v: string | null) => void }) {
  const ref = useRef<HTMLCanvasElement>(null)
  const drawing = useRef(false)
  const getXY = (e: React.MouseEvent | React.TouchEvent) => {
    const r = ref.current!.getBoundingClientRect()
    const src = 'touches' in e.nativeEvent ? e.nativeEvent.touches[0] : e.nativeEvent as MouseEvent
    return [src.clientX - r.left, src.clientY - r.top]
  }
  const start = (e: React.MouseEvent | React.TouchEvent) => {
    e.preventDefault(); drawing.current = true
    const ctx = ref.current!.getContext('2d')!
    const [x, y] = getXY(e); ctx.beginPath(); ctx.moveTo(x, y)
  }
  const draw = (e: React.MouseEvent | React.TouchEvent) => {
    if (!drawing.current) return; e.preventDefault()
    const ctx = ref.current!.getContext('2d')!
    const [x, y] = getXY(e)
    ctx.lineTo(x, y); ctx.strokeStyle = '#1A1A1A'; ctx.lineWidth = 1.5; ctx.lineCap = 'round'; ctx.stroke()
  }
  const stop = () => { drawing.current = false; onChange(ref.current!.toDataURL()) }
  const clear = () => {
    const c = ref.current!; c.getContext('2d')!.clearRect(0, 0, c.width, c.height); onChange(null)
  }
  useEffect(() => {
    const c = ref.current!
    c.width = c.offsetWidth; c.height = 80
  }, [])
  return (
    <div>
      <canvas ref={ref} className="border border-gray-200 rounded-lg cursor-crosshair w-full touch-none" style={{ height: 80 }}
        onMouseDown={start} onMouseMove={draw} onMouseUp={stop} onMouseLeave={stop}
        onTouchStart={start} onTouchMove={draw} onTouchEnd={stop} />
      <button type="button" onClick={clear} className="text-[10px] text-gray-400 hover:text-gray-600 mt-1">Effacer</button>
    </div>
  )
}

// ── SVG Icons ──────────────────────────────────────────────────────────────────
const PhoneIcon = () => <svg viewBox="0 0 16 16" fill="none"><path d="M3 2.5A1.5 1.5 0 014.5 1h.879a1 1 0 01.949.684l.674 2.022A1 1 0 016.657 5l-.74.74a7.05 7.05 0 003.344 3.344l.74-.74a1 1 0 011.293-.345l2.022.674A1 1 0 0114 9.621V10.5A1.5 1.5 0 0112.5 12H12A9.5 9.5 0 012.5 2.5V2" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/></svg>
const UserIcon = () => <svg viewBox="0 0 16 16" fill="none"><circle cx="8" cy="5" r="3" stroke="currentColor" strokeWidth="1.2"/><path d="M2 13c0-3.314 2.686-6 6-6s6 2.686 6 6" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/></svg>
const DocIcon = () => <svg viewBox="0 0 16 16" fill="none"><rect x="2" y="1" width="12" height="14" rx="2" stroke="currentColor" strokeWidth="1.2"/><path d="M5 5h6M5 8h6M5 11h4" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/></svg>
const BotIcon = () => <svg viewBox="0 0 16 16" fill="none"><circle cx="8" cy="8" r="5.5" stroke="currentColor" strokeWidth="1.2"/><circle cx="6" cy="7.5" r="1" fill="currentColor"/><circle cx="10" cy="7.5" r="1" fill="currentColor"/><path d="M6 10.5c.5.5 3.5.5 4 0" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round"/><path d="M8 2.5v1" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/></svg>
const ClockIcon = () => <svg viewBox="0 0 16 16" fill="none"><circle cx="8" cy="8" r="6" stroke="currentColor" strokeWidth="1.2"/><path d="M8 5v3l2 1" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/></svg>
const GearIcon = () => <svg viewBox="0 0 16 16" fill="none"><circle cx="8" cy="8" r="2.5" stroke="currentColor" strokeWidth="1.2"/><path d="M8 1v2M8 13v2M1 8h2M13 8h2M3.05 3.05l1.41 1.41M11.54 11.54l1.41 1.41M3.05 12.95l1.41-1.41M11.54 4.46l1.41-1.41" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/></svg>
const CardIcon = () => <svg viewBox="0 0 16 16" fill="none"><rect x="1" y="4" width="14" height="10" rx="1.5" stroke="currentColor" strokeWidth="1.2"/><path d="M4 8h2M4 10.5h4" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/><path d="M1 7h14" stroke="currentColor" strokeWidth="1.2"/></svg>
const MenuIcon = () => <svg width="18" height="18" viewBox="0 0 18 18" fill="none"><path d="M2 4h14M2 9h14M2 14h14" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/></svg>
const CalendarIcon = () => <svg viewBox="0 0 16 16" fill="none"><rect x="1.5" y="3" width="13" height="11.5" rx="1.5" stroke="currentColor" strokeWidth="1.2"/><path d="M5 1.5v3M11 1.5v3M1.5 7h13" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/><rect x="4" y="9.5" width="2" height="2" rx="0.5" fill="currentColor"/><rect x="7" y="9.5" width="2" height="2" rx="0.5" fill="currentColor"/></svg>
const InvoiceIcon = () => <svg viewBox="0 0 16 16" fill="none"><rect x="2" y="1" width="12" height="14" rx="1.5" stroke="currentColor" strokeWidth="1.2"/><path d="M5 5h6M5 8h6M5 11h3" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/><path d="M10.5 10.5l1.5 1.5-1.5 1.5" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round" strokeLinejoin="round"/></svg>
const PuzzleIcon = () => <svg viewBox="0 0 16 16" fill="none"><path d="M6 2.5h4v1.5a1 1 0 002 0V2.5h1.5A.5.5 0 0114 3v2.5h-1.5a1 1 0 000 2H14V10h-1.5a1 1 0 000 2H14v1.5a.5.5 0 01-.5.5H10v-1.5a1 1 0 00-2 0V14H5.5A.5.5 0 015 13.5V12H3.5a1 1 0 010-2H5V7.5H3.5a1 1 0 010-2H5V3a.5.5 0 01.5-.5H6" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/></svg>
