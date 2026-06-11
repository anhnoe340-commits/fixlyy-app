import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'

const BRAND = '#3B5BF5'

const TRADES = [
  'Plomberie / Chauffage',
  'Électricité',
  'Menuiserie / Charpenterie',
  'Peinture / Décoration',
  'Serrurerie',
  'Jardinage / Paysagisme',
  'Multi-services',
  'Autre',
]

interface Props {
  userId: string
  phone: string
  onDone: () => void
}

export default function Step2Activity({ userId, phone, onDone }: Props) {
  const [fullName, setFullName]         = useState('')
  const [trade, setTrade]               = useState(TRADES[0])
  const [companyName, setCompanyName]   = useState('')
  const [nameTouched, setNameTouched]   = useState(false)
  const [loading, setLoading]           = useState(false)
  const [error, setError]               = useState('')

  useEffect(() => {
    if (!nameTouched && fullName.trim()) {
      const first = fullName.trim().split(' ')[0]
      setCompanyName(`${trade.split('/')[0].trim()} ${first}`)
    }
  }, [fullName, trade, nameTouched])

  async function handleContinue() {
    if (!fullName.trim() || !companyName.trim()) return
    setLoading(true); setError('')
    try {
      const firstName = fullName.trim().split(' ')[0]
      const resumeToken = crypto.randomUUID()

      const { error: err } = await supabase.from('profiles').upsert({
        id: userId,
        full_name: fullName.trim(),
        company_name: companyName.trim(),
        company_type: trade,
        assistant_name: 'Mia',
        assistant_voice: 'female-warm',
        resume_token: resumeToken,
        onboarding_step: 3,
        greeting_open: `Bonjour, vous êtes bien chez ${firstName}. Je suis Mia, son assistante. Comment puis-je vous aider ?`,
        greeting_closed: `Bonjour, vous êtes bien chez ${firstName}. Nous sommes actuellement fermés. Je suis Mia, je peux prendre votre message et ${firstName} vous rappellera dès que possible.`,
      })
      if (err) throw err

      // Lance l'assignation du numéro en arrière-plan (profile complet → Vapi assistant OK)
      supabase.auth.getSession().then(({ data: { session } }) => {
        if (!session) return
        fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/assign-number-from-pool`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${session.access_token}` },
        }).catch(() => {})
      })

      onDone()
    } catch (e: any) {
      setError(e.message || 'Erreur. Réessayez.')
    } finally {
      setLoading(false)
    }
  }

  const canContinue = fullName.trim().length > 0 && companyName.trim().length > 0

  return (
    <div className="flex flex-col gap-7">
      <div>
        <h2 className="text-2xl font-bold text-white mb-1">Votre activité</h2>
        <p className="text-sm" style={{ color: 'rgba(148,163,184,0.85)' }}>
          Mia se présentera avec ces informations.
        </p>
      </div>

      <div className="flex flex-col gap-4">
        <div className="flex flex-col gap-1.5">
          <label className="text-xs font-semibold uppercase tracking-wider" style={{ color: 'rgba(148,163,184,0.7)' }}>Votre prénom et nom</label>
          <input
            type="text"
            autoFocus
            placeholder="Jean Dupont"
            value={fullName}
            onChange={e => setFullName(e.target.value)}
            className="v3-input w-full rounded-xl px-4 py-3.5 text-sm"
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <label className="text-xs font-semibold uppercase tracking-wider" style={{ color: 'rgba(148,163,184,0.7)' }}>Votre métier</label>
          <select
            value={trade}
            onChange={e => setTrade(e.target.value)}
            className="v3-input w-full rounded-xl px-4 py-3.5 text-sm appearance-none"
          >
            {TRADES.map(t => <option key={t} value={t} style={{ background: '#0D1225' }}>{t}</option>)}
          </select>
        </div>

        <div className="flex flex-col gap-1.5">
          <label className="text-xs font-semibold uppercase tracking-wider" style={{ color: 'rgba(148,163,184,0.7)' }}>Nom de votre activité</label>
          <input
            type="text"
            placeholder="Ex : Plomberie Dupont"
            value={companyName}
            onChange={e => { setCompanyName(e.target.value); setNameTouched(true) }}
            className="v3-input w-full rounded-xl px-4 py-3.5 text-sm"
          />
          <p className="text-xs" style={{ color: 'rgba(148,163,184,0.50)' }}>
            Mia répondra : « {companyName || 'Votre activité'}, bonjour ! »
          </p>
        </div>
      </div>

      {error && <p className="text-sm text-red-400 bg-red-500/10 border border-red-500/20 rounded-xl px-4 py-3">{error}</p>}

      <button
        onClick={handleContinue}
        disabled={!canContinue || loading}
        className="w-full py-4 rounded-xl text-white text-sm font-bold transition-all disabled:opacity-40 flex items-center justify-center gap-2"
        style={{ background: BRAND }}
      >
        {loading && <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />}
        Continuer →
      </button>
    </div>
  )
}
