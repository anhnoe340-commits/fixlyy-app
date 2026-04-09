import { useState } from 'react'
import { supabase } from '@/lib/supabase'
import { LogOut } from 'lucide-react'

async function handleSignOut() {
  await supabase.auth.signOut()
  window.location.reload()
}

const trades = ['Plombier', 'Électricien', 'Chauffagiste', 'Climaticien', 'Serrurier', 'Multi-services']

const plans = [
  { id: 'starter', name: 'Starter', price: '79€', priceId: 'price_1TJv9uB5dBerNSsDbvCQFO2P', desc: "Jusqu'à 100 appels/mois" },
  { id: 'pro',     name: 'Pro',     price: '149€', priceId: 'price_1TJv9uB5dBerNSsDpOIyE2UP', desc: 'Appels illimités + devis auto', popular: true },
  { id: 'expert',  name: 'Expert',  price: '249€', priceId: 'price_1TJv9vB5dBerNSsDlnsXltWh', desc: 'Multi-numéros + intégrations' },
]

interface Props { userEmail: string }

export default function OnboardingPage({ userEmail }: Props) {
  const [step, setStep] = useState<1 | 2>(1)
  const [trade, setTrade] = useState('')
  const [company, setCompany] = useState('')
  const [selectedPlan, setSelectedPlan] = useState('pro')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  async function handleCheckout() {
    setLoading(true); setError('')
    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session?.access_token) throw new Error('Session expirée, veuillez vous reconnecter.')
      const plan = plans.find(p => p.id === selectedPlan)!
      const res = await fetch('https://hxkpmmekaotwmzgqxafp.supabase.co/functions/v1/create-checkout-session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${session.access_token}` },
        body: JSON.stringify({ priceId: plan.priceId, trade, company, email: userEmail }),
      })
      const data = await res.json()
      if (!res.ok || data.error) throw new Error(data.error || data.message || `Erreur ${res.status}`)
      if (!data.url) throw new Error('URL de paiement manquante')
      window.location.href = data.url
    } catch (e: any) { setError(e.message); setLoading(false) }
  }

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-6 relative">
      <div className="w-full max-w-lg">
        <button onClick={handleSignOut} className="absolute top-4 right-4 flex items-center gap-1.5 text-xs text-gray-400 hover:text-gray-600 transition-colors">
          <LogOut size={14}/> Se déconnecter
        </button>
        <div className="flex items-center gap-2 mb-8">
          {[1,2].map(s => <div key={s} className={`h-1.5 flex-1 rounded-full transition-colors ${step >= s ? 'bg-[#3B5BF5]' : 'bg-gray-200'}`}/>)}
        </div>

        {step === 1 ? (
          <div>
            <h2 className="text-2xl font-bold mb-1">Parlez-nous de vous</h2>
            <p className="text-gray-500 text-sm mb-8">Emily s'adaptera à votre métier et votre entreprise.</p>
            <div className="mb-6">
              <label className="text-xs font-medium text-gray-600 block mb-2">Votre métier</label>
              <div className="grid grid-cols-2 gap-2">
                {trades.map(t => (
                  <button key={t} onClick={() => setTrade(t)}
                    className={`px-4 py-3 rounded-xl text-sm font-medium border transition-colors text-left ${trade === t ? 'border-[#3B5BF5] bg-[#3B5BF5]/5 text-[#3B5BF5]' : 'border-gray-200 bg-white hover:border-gray-300'}`}>
                    {t}
                  </button>
                ))}
              </div>
            </div>
            <div className="mb-8">
              <label className="text-xs font-medium text-gray-600 block mb-1">Nom de votre entreprise</label>
              <input value={company} onChange={e => setCompany(e.target.value)} placeholder="Dupont Plomberie"
                className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm outline-none focus:border-[#3B5BF5]"/>
            </div>
            <button onClick={() => setStep(2)} disabled={!trade || !company}
              className="w-full bg-[#3B5BF5] hover:bg-[#2D4AE0] text-white rounded-lg py-2.5 text-sm font-medium transition-colors disabled:opacity-40">
              Continuer →
            </button>
          </div>
        ) : (
          <div>
            <h2 className="text-2xl font-bold mb-1">Choisissez votre plan</h2>
            <p className="text-gray-500 text-sm mb-8">7 jours gratuits · Aucun débit maintenant · Annulation à tout moment</p>
            <div className="flex flex-col gap-3 mb-8">
              {plans.map(p => (
                <button key={p.id} onClick={() => setSelectedPlan(p.id)}
                  className={`relative p-4 rounded-xl border-2 text-left transition-colors ${selectedPlan === p.id ? 'border-[#3B5BF5] bg-[#3B5BF5]/5' : 'border-gray-200 bg-white hover:border-gray-300'}`}>
                  {p.popular && <span className="absolute top-3 right-3 text-xs bg-[#3B5BF5] text-white px-2 py-0.5 rounded-full font-medium">Populaire</span>}
                  <div className="flex items-baseline gap-1.5 mb-1">
                    <span className="font-bold text-lg">{p.price}</span>
                    <span className="text-gray-400 text-sm">/mois</span>
                    <span className="font-semibold text-base ml-1">{p.name}</span>
                  </div>
                  <p className="text-sm text-gray-500">{p.desc}</p>
                </button>
              ))}
            </div>
            {error && <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2 mb-4">{error}</p>}
            <button onClick={handleCheckout} disabled={loading}
              className="w-full bg-[#3B5BF5] hover:bg-[#2D4AE0] text-white rounded-lg py-2.5 text-sm font-medium transition-colors disabled:opacity-50">
              {loading ? 'Redirection vers le paiement...' : 'Commencer mon essai gratuit de 7 jours →'}
            </button>
            <p className="text-center text-xs text-gray-400 mt-3">Satisfait ou remboursé 30 jours · Annulation à tout moment</p>
            <button onClick={() => setStep(1)} className="w-full text-center text-xs text-gray-400 mt-4 hover:text-gray-600">← Retour</button>
          </div>
        )}
      </div>
    </div>
  )
}
