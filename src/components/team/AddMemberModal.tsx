import { useState } from 'react'
import { supabase } from '@/lib/supabase'

const BRAND = '#2850c8'

const SKILLS_BY_TRADE: Record<string, string[]> = {
  'Plomberie / Chauffage / Climatisation': ['Sanitaire', 'Chauffage', 'Climatisation', 'Dépannage', 'Urgences'],
  'Électricité / Solaire': ['Installation', 'Dépannage', 'Mise aux normes', 'Domotique', 'Urgences', 'Solaire'],
  'Serrurerie': ['Dépannage urgence', 'Installation', 'Blindage', 'Contrôle d\'accès', 'Urgences'],
  'Menuiserie / Charpenterie': ['Portes', 'Fenêtres', 'Volets', 'Terrasses', 'Charpente', 'Urgences'],
  'Peinture / Décoration': ['Intérieur', 'Extérieur', 'Ravalement', 'Isolation', 'Décoration'],
  'Jardinage / Paysagisme': ['Taille', 'Tonte', 'Arrosage', 'Aménagement', 'Élagage'],
  'Services à domicile': ['Ménage', 'Garde', 'Repassage', 'Courses', 'Aide à domicile'],
}
const DEFAULT_SKILLS = ['Installation', 'Dépannage', 'Maintenance', 'Urgences', 'Devis']

function getSkills(companyType: string): string[] {
  for (const [key, skills] of Object.entries(SKILLS_BY_TRADE)) {
    if (companyType.includes(key.split(' / ')[0].split(' ')[0])) return skills
  }
  return SKILLS_BY_TRADE[companyType] ?? DEFAULT_SKILLS
}

function normalizePhone(p: string): string {
  const digits = p.replace(/[\s\-\.\(\)]/g, '')
  if (digits.startsWith('+')) return digits
  if (digits.startsWith('00')) return '+' + digits.slice(2)
  if (digits.startsWith('0')) return '+33' + digits.slice(1)
  return digits
}

function isValidPhone(p: string): boolean {
  const normalized = normalizePhone(p)
  return /^\+\d{10,15}$/.test(normalized)
}

type Props = {
  companyType: string
  onClose: () => void
  onSuccess: (firstName: string, phone: string) => void
}

export default function AddMemberModal({ companyType, onClose, onSuccess }: Props) {
  const [firstName, setFirstName] = useState('')
  const [phone, setPhone] = useState('')
  const [skills, setSkills] = useState<string[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const suggestedSkills = getSkills(companyType)
  const canSubmit = firstName.trim() && isValidPhone(phone) && !loading
  const btnLabel = firstName.trim() ? `Inviter ${firstName.trim()}` : 'Inviter'

  const toggleSkill = (s: string) =>
    setSkills(prev => prev.includes(s) ? prev.filter(x => x !== s) : [...prev, s])

  const handleSubmit = async () => {
    setError('')
    setLoading(true)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session?.access_token) throw new Error('Non authentifié')

      const res = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/invite-team-member`,
        {
          method: 'POST',
          headers: { Authorization: `Bearer ${session.access_token}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ first_name: firstName.trim(), phone: normalizePhone(phone), suggested_skills: skills }),
        }
      )
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Erreur inattendue')

      onSuccess(firstName.trim(), phone)
    } catch (e: any) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div
        className="bg-white rounded-2xl shadow-2xl w-full max-w-[480px] overflow-hidden"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-6 pt-6 pb-4 border-b border-gray-100">
          <div className="flex items-start justify-between">
            <div>
              <h2 className="text-lg font-bold text-gray-900">Inviter un nouvel artisan</h2>
              <p className="text-sm text-gray-400 mt-0.5">Il recevra un SMS pour finaliser son profil en 90 secondes.</p>
            </div>
            <button onClick={onClose} className="text-gray-300 hover:text-gray-500 text-xl leading-none ml-4 mt-0.5">×</button>
          </div>
        </div>

        {/* Body */}
        <div className="px-6 py-5 flex flex-col gap-5">
          {/* Prénom */}
          <div>
            <label className="block text-xs font-semibold text-gray-500 mb-1.5">Prénom *</label>
            <input
              autoFocus
              value={firstName}
              onChange={e => setFirstName(e.target.value)}
              placeholder="Jean"
              className="w-full border border-gray-200 rounded-xl px-3.5 py-2.5 text-sm outline-none focus:border-[#2850c8] transition-colors bg-gray-50/60"
            />
          </div>

          {/* Téléphone */}
          <div>
            <label className="block text-xs font-semibold text-gray-500 mb-1.5">Mobile *</label>
            <div className="flex gap-2">
              <div className="flex items-center gap-1.5 border border-gray-200 rounded-xl px-3 bg-gray-50/60 text-sm text-gray-500 font-medium select-none">
                🇫🇷 +33
              </div>
              <input
                value={phone}
                onChange={e => setPhone(e.target.value)}
                placeholder="06 12 34 56 78"
                type="tel"
                className="flex-1 border border-gray-200 rounded-xl px-3.5 py-2.5 text-sm outline-none focus:border-[#2850c8] transition-colors bg-gray-50/60"
              />
            </div>
            {phone && !isValidPhone(phone) && (
              <p className="text-xs text-red-400 mt-1">Numéro invalide (ex : 06 12 34 56 78)</p>
            )}
          </div>

          {/* Compétences */}
          <div>
            <label className="block text-xs font-semibold text-gray-500 mb-1.5">Compétences principales</label>
            <div className="flex flex-wrap gap-2">
              {suggestedSkills.map(s => (
                <button
                  key={s}
                  type="button"
                  onClick={() => toggleSkill(s)}
                  className={`text-xs px-3 py-1.5 rounded-full font-medium transition-all border ${
                    skills.includes(s)
                      ? 'text-white border-transparent'
                      : 'text-gray-500 border-gray-200 hover:border-gray-300'
                  }`}
                  style={skills.includes(s) ? { background: BRAND, borderColor: BRAND } : {}}
                >
                  {s}
                </button>
              ))}
            </div>
            <p className="text-xs text-gray-300 mt-2">Vous pourrez en ajouter plus tard</p>
          </div>

          {error && <p className="text-sm text-red-500 bg-red-50 rounded-xl px-3 py-2">{error}</p>}
        </div>

        {/* Footer */}
        <div className="px-6 pb-6 flex gap-3">
          <button onClick={onClose} className="flex-1 py-3 rounded-xl text-sm font-medium border border-gray-200 text-gray-500 hover:bg-gray-50 transition-colors">
            Annuler
          </button>
          <button
            onClick={handleSubmit}
            disabled={!canSubmit}
            className="flex-1 py-3 rounded-xl text-sm font-bold text-white transition-all disabled:opacity-40"
            style={{ background: BRAND }}
          >
            {loading ? (
              <span className="flex items-center justify-center gap-2">
                <span className="w-3.5 h-3.5 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                Envoi…
              </span>
            ) : btnLabel}
          </button>
        </div>
      </div>
    </div>
  )
}
