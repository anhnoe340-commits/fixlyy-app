import { useState, useRef } from 'react'
import { useAuth } from '@/contexts/AuthContext'
import { useProfile } from '@/contexts/ProfileContext'
import { generateQuotePDF, type QuoteLine, type QuoteData } from '@/lib/generatePDF'

type Page = 'calls' | 'contacts' | 'quotes' | 'assistant' | 'hours' | 'settings' | 'subscription'

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
      <div className="w-6 h-6 border-2 border-[#FF6B35] border-t-transparent rounded-full animate-spin" />
    </div>
  )

  const accent = profile.quote_color || '#FF6B35'

  return (
    <div className="flex min-h-screen bg-[#F5F5F4] text-[#1A1A1A]" style={{ fontFamily: "'system-ui', sans-serif" }}>
      {/* Sidebar */}
      <aside className={`${sidebarOpen ? 'w-56' : 'w-14'} bg-white border-r border-gray-200 flex flex-col flex-shrink-0 transition-all duration-200 fixed top-0 left-0 h-screen z-20`}>
        <div className="p-4 border-b border-gray-100 flex items-center gap-2">
          <div className="w-7 h-7 rounded-lg flex items-center justify-center text-white font-bold text-sm flex-shrink-0" style={{ background: accent }}>F</div>
          {sidebarOpen && <span className="font-semibold text-[15px] tracking-tight">Fixlyy</span>}
        </div>
        {sidebarOpen && (
          <div className="px-3 py-2 border-b border-gray-100">
            <div className="bg-gray-50 rounded-lg px-2.5 py-2">
              <p className="text-xs font-medium text-gray-700 truncate">{profile.assistant_name} — Assistante IA</p>
              <p className="text-[11px] text-gray-400 mt-0.5">{profile.twilio_number || 'N° non configuré'}</p>
            </div>
          </div>
        )}
        <nav className="flex-1 py-2 overflow-y-auto">
          <NavSection label="Activité" visible={sidebarOpen} />
          <NavItem icon={<PhoneIcon />} label="Appels" active={page === 'calls'} onClick={() => setPage('calls')} open={sidebarOpen} accent={accent} />
          <NavItem icon={<UserIcon />} label="Contacts" active={page === 'contacts'} onClick={() => setPage('contacts')} open={sidebarOpen} accent={accent} />
          <NavItem icon={<DocIcon />} label="Devis sur mesure" active={page === 'quotes'} onClick={() => setPage('quotes')} open={sidebarOpen} accent={accent} />
          <NavSection label="Configuration" visible={sidebarOpen} />
          <NavItem icon={<BotIcon />} label="Assistante" active={page === 'assistant'} onClick={() => setPage('assistant')} open={sidebarOpen} accent={accent} />
          <NavItem icon={<ClockIcon />} label="Horaires" active={page === 'hours'} onClick={() => setPage('hours')} open={sidebarOpen} accent={accent} />
          <NavItem icon={<GearIcon />} label="Paramètres" active={page === 'settings'} onClick={() => setPage('settings')} open={sidebarOpen} accent={accent} />
          <NavItem icon={<CardIcon />} label="Abonnement" active={page === 'subscription'} onClick={() => setPage('subscription')} open={sidebarOpen} accent={accent} />
        </nav>
        <button onClick={signOut} className="m-3 text-xs text-gray-400 hover:text-red-500 transition-colors text-left px-2 py-1.5">
          {sidebarOpen ? 'Se déconnecter' : '→'}
        </button>
      </aside>

      {/* Main */}
      <div className={`flex-1 flex flex-col ${sidebarOpen ? 'ml-56' : 'ml-14'} transition-all duration-200`}>
        {/* Topbar */}
        <header className="sticky top-0 z-10 bg-white border-b border-gray-200 h-13 flex items-center justify-between px-6 h-[52px]">
          <div className="flex items-center gap-3">
            <button onClick={() => setSidebarOpen(!sidebarOpen)} className="text-gray-400 hover:text-gray-600 transition-colors">
              <MenuIcon />
            </button>
            <span className="text-sm text-gray-500">{PAGE_LABELS[page]}</span>
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
          {page === 'quotes' && <QuotesPage accent={accent} />}
          {page === 'assistant' && <AssistantPage accent={accent} />}
          {page === 'hours' && <HoursPage accent={accent} />}
          {page === 'settings' && <SettingsPage accent={accent} uploadLogo={uploadLogo} />}
          {page === 'subscription' && <SubscriptionPage accent={accent} />}
        </main>
      </div>
    </div>
  )
}

// ── Page Labels ───────────────────────────────────────────────────────────────
const PAGE_LABELS: Record<Page, string> = {
  calls: 'Appels', contacts: 'Contacts', quotes: 'Devis sur mesure',
  assistant: 'Assistante IA', hours: 'Horaires', settings: 'Paramètres', subscription: 'Abonnement',
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
function CallsPage({ accent }: { accent: string }) {
  const calls = [
    { init: 'JD', name: 'Jean Dupont', detail: 'Fuite sous évier — intervention urgent ce soir', time: '14:32', badge: 'urgent' },
    { init: 'SM', name: 'Sophie Martin', detail: 'Devis pose robinetterie salle de bain', time: '13:15', badge: 'pending' },
    { init: 'PL', name: 'Pierre Laurent', detail: 'Panne électrique tableau — rappel 17h', time: '11:08', badge: 'new' },
    { init: 'AB', name: 'Alice Bernard', detail: 'Installation chauffe-eau — devis envoyé', time: '09:44', badge: 'done' },
    { init: 'MG', name: 'Marc Girard', detail: 'Entartrage chauffe-eau — intervention demain', time: '08:20', badge: 'done' },
  ]
  return (
    <div>
      <PageHeader title="Appels" sub="Gérez et consultez vos appels reçus" />
      <div className="grid grid-cols-4 gap-3 mb-5">
        <StatCard label="Appels aujourd'hui" value="7" trend="+3 vs hier" trendUp />
        <StatCard label="Récupérés par Mia" value="5" trend="71 % taux" trendUp />
        <StatCard label="Devis générés" value="3" trend="ce mois" />
        <StatCard label="CA récupéré est." value="2 400 €" trend="appels manqués évités" trendUp accent={accent} />
      </div>
      <Card>
        <div className="flex items-center justify-between mb-4">
          <div><p className="text-sm font-semibold">Appels récents</p><p className="text-xs text-gray-400 mt-0.5">Derniers appels et leur statut</p></div>
          <button className="text-xs border border-gray-200 px-3 py-1.5 rounded-md hover:bg-gray-50 transition-colors">Filtrer</button>
        </div>
        <div className="divide-y divide-gray-100">
          {calls.map((c, i) => (
            <div key={i} className="flex items-center gap-3 py-2.5">
              <div className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-semibold flex-shrink-0" style={{ background: accent + '20', color: accent }}>{c.init}</div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium">{c.name}</p>
                <p className="text-xs text-gray-400 truncate mt-0.5">{c.detail}</p>
              </div>
              <div className="text-right flex-shrink-0">
                <p className="text-xs text-gray-400">{c.time}</p>
                <Badge type={c.badge as any} />
              </div>
            </div>
          ))}
        </div>
      </Card>
    </div>
  )
}

// ── Contacts Page ─────────────────────────────────────────────────────────────
function ContactsPage({ accent }: { accent: string }) {
  const contacts = [
    { init: 'JD', name: 'Jean Dupont', info: '+33 6 12 34 56 78 · jean.dupont@gmail.com', badge: 'urgent' },
    { init: 'SM', name: 'Sophie Martin', info: '+33 6 87 65 43 21 · sophie.m@orange.fr', badge: 'pending' },
    { init: 'PL', name: 'Pierre Laurent', info: '+33 7 11 22 33 44 · p.laurent@sfr.fr', badge: 'new' },
    { init: 'AB', name: 'Alice Bernard', info: '+33 6 55 44 33 22 · alice.b@free.fr', badge: 'done' },
  ]
  return (
    <div>
      <PageHeader title="Contacts" sub="Gérez votre base de données clients" />
      <Card>
        <div className="flex items-center justify-between mb-4">
          <p className="text-sm font-semibold">Liste des contacts</p>
          <div className="flex gap-2">
            <input placeholder="Rechercher..." className="border border-gray-200 rounded-md px-3 py-1.5 text-xs outline-none focus:border-gray-400 w-44" />
            <button className="text-xs px-3 py-1.5 rounded-md text-white font-medium" style={{ background: accent }}>+ Ajouter</button>
          </div>
        </div>
        <div className="flex flex-col gap-2">
          {contacts.map((c, i) => (
            <div key={i} className="flex items-center gap-3 px-3 py-2.5 bg-gray-50 rounded-lg hover:bg-orange-50 transition-colors cursor-pointer" style={{ ['--hover-bg' as any]: accent + '10' }}>
              <div className="w-9 h-9 rounded-full border flex items-center justify-center text-sm font-semibold flex-shrink-0" style={{ background: accent + '15', color: accent, borderColor: accent + '30' }}>{c.init}</div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium">{c.name}</p>
                <p className="text-xs text-gray-400 mt-0.5">{c.info}</p>
              </div>
              <Badge type={c.badge as any} />
            </div>
          ))}
        </div>
      </Card>
    </div>
  )
}

// ── Quotes Page ───────────────────────────────────────────────────────────────
function QuotesPage({ accent }: { accent: string }) {
  const { profile, updateProfile } = useProfile()
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
  const [notes, setNotes] = useState('Paiement à réception de facture. Garantie main d\'œuvre 3 mois.')
  const [generating, setGenerating] = useState(false)
  const [customColor, setCustomColor] = useState(profile?.quote_color || '#FF6B35')
  const fileRef = useRef<HTMLInputElement>(null)
  const { uploadLogo } = useProfile()

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

  async function handleGeneratePDF() {
    if (!profile) return
    setGenerating(true)
    const quoteData: QuoteData = {
      number: `D${today.getFullYear()}-001`,
      date: fmt(today),
      validity: fmt(validUntil),
      object: quoteObject || 'Prestation de services',
      clientName, clientAddress, clientEmail, clientPhone, notes, lines,
    }
    await generateQuotePDF(profile, quoteData)
    setGenerating(false)
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
      <div className="rounded-xl border px-4 py-3 mb-5" style={{ background: accent + '12', borderColor: accent + '30' }}>
        <p className="text-sm font-semibold mb-3" style={{ color: accent }}>Tarifs de base (pré-remplit les lignes automatiquement)</p>
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
          <div className="flex gap-2">
            <button onClick={handleGeneratePDF} disabled={generating}
              className="text-sm px-4 py-2 rounded-lg text-white font-medium transition-opacity disabled:opacity-50 flex items-center gap-2"
              style={{ background: accent }}>
              {generating && <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />}
              {generating ? 'Génération...' : 'Télécharger PDF'}
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
                <tr style={{ background: accent }}>
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
              <div className="flex justify-between items-center text-base font-semibold px-4 py-3 rounded-xl" style={{ background: accent + '15' }}>
                <span>Total TTC</span>
                <span style={{ color: accent }}>{totalTTC.toLocaleString('fr-FR', { minimumFractionDigits: 2 })} €</span>
              </div>
            </div>
          </div>

          {/* Notes */}
          <div className="mt-5 pt-4 border-t border-gray-100">
            <label className="text-xs text-gray-500 block mb-1.5">Notes / Conditions</label>
            <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={2}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-gray-400 resize-none" />
          </div>
        </div>
      </div>
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
function HoursPage({ accent }: { accent: string }) {
  const days = [
    { day: 'Lundi', open: '08:00', close: '18:00', on: true },
    { day: 'Mardi', open: '08:00', close: '18:00', on: true },
    { day: 'Mercredi', open: '08:00', close: '18:00', on: true },
    { day: 'Jeudi', open: '08:00', close: '18:00', on: true },
    { day: 'Vendredi', open: '08:00', close: '17:00', on: true },
    { day: 'Samedi', open: '09:00', close: '12:00', on: false },
    { day: 'Dimanche', open: '', close: '', on: false },
  ]
  return (
    <div>
      <PageHeader title="Horaires d'ouverture" sub="Configurez les heures de disponibilité de votre assistante" />
      <Card className="mb-4">
        <div className="flex items-center justify-between mb-4">
          <p className="text-sm font-semibold">Plages horaires</p>
          <button className="text-xs px-3 py-1.5 rounded-md text-white" style={{ background: accent }}>Enregistrer</button>
        </div>
        <div className="flex flex-col gap-3">
          {days.map((d, i) => (
            <div key={i} className="flex items-center gap-4">
              <span className="text-sm font-medium w-24">{d.day}</span>
              {d.on
                ? <div className="flex items-center gap-2 text-sm text-gray-500">
                    <input defaultValue={d.open} className="w-18 border border-gray-200 rounded-md px-2 py-1 text-xs text-center outline-none focus:border-gray-400" />
                    <span>à</span>
                    <input defaultValue={d.close} className="w-18 border border-gray-200 rounded-md px-2 py-1 text-xs text-center outline-none focus:border-gray-400" />
                  </div>
                : <span className="text-sm text-gray-300 italic">Fermé</span>}
              <Toggle defaultOn={d.on} accent={accent} className="ml-auto" />
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

// ── SVG Icons ──────────────────────────────────────────────────────────────────
const PhoneIcon = () => <svg viewBox="0 0 16 16" fill="none"><path d="M3 2.5A1.5 1.5 0 014.5 1h.879a1 1 0 01.949.684l.674 2.022A1 1 0 016.657 5l-.74.74a7.05 7.05 0 003.344 3.344l.74-.74a1 1 0 011.293-.345l2.022.674A1 1 0 0114 9.621V10.5A1.5 1.5 0 0112.5 12H12A9.5 9.5 0 012.5 2.5V2" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/></svg>
const UserIcon = () => <svg viewBox="0 0 16 16" fill="none"><circle cx="8" cy="5" r="3" stroke="currentColor" strokeWidth="1.2"/><path d="M2 13c0-3.314 2.686-6 6-6s6 2.686 6 6" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/></svg>
const DocIcon = () => <svg viewBox="0 0 16 16" fill="none"><rect x="2" y="1" width="12" height="14" rx="2" stroke="currentColor" strokeWidth="1.2"/><path d="M5 5h6M5 8h6M5 11h4" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/></svg>
const BotIcon = () => <svg viewBox="0 0 16 16" fill="none"><circle cx="8" cy="8" r="5.5" stroke="currentColor" strokeWidth="1.2"/><circle cx="6" cy="7.5" r="1" fill="currentColor"/><circle cx="10" cy="7.5" r="1" fill="currentColor"/><path d="M6 10.5c.5.5 3.5.5 4 0" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round"/><path d="M8 2.5v1" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/></svg>
const ClockIcon = () => <svg viewBox="0 0 16 16" fill="none"><circle cx="8" cy="8" r="6" stroke="currentColor" strokeWidth="1.2"/><path d="M8 5v3l2 1" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/></svg>
const GearIcon = () => <svg viewBox="0 0 16 16" fill="none"><circle cx="8" cy="8" r="2.5" stroke="currentColor" strokeWidth="1.2"/><path d="M8 1v2M8 13v2M1 8h2M13 8h2M3.05 3.05l1.41 1.41M11.54 11.54l1.41 1.41M3.05 12.95l1.41-1.41M11.54 4.46l1.41-1.41" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/></svg>
const CardIcon = () => <svg viewBox="0 0 16 16" fill="none"><rect x="1" y="4" width="14" height="10" rx="1.5" stroke="currentColor" strokeWidth="1.2"/><path d="M4 8h2M4 10.5h4" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/><path d="M1 7h14" stroke="currentColor" strokeWidth="1.2"/></svg>
const MenuIcon = () => <svg width="18" height="18" viewBox="0 0 18 18" fill="none"><path d="M2 4h14M2 9h14M2 14h14" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/></svg>
