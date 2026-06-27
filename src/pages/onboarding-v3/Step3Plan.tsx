import { useState } from 'react'
import { supabase } from '@/lib/supabase'
import { Check } from 'lucide-react'
import SocialProofToast, { useSocialProof } from '@/components/SocialProofToast'
import ScarcityBadge from '@/components/ScarcityBadge'

const BRAND = '#3B5BF5'

type PlanId = 'solo' | 'pro' | 'max'

const PLANS = [
  {
    id: 'solo' as PlanId,
    name: 'Solo',
    price: 97,
    launchPrice: null as number | null,
    launchBadge: null as string | null,
    minutes: '300 min / mois',
    overage: '0,25 €/min au-delà',
    features: ['1 numéro dédié', 'SMS récap 30 secondes', 'Qualification urgences', '1 utilisateur'],
    popular: false,
  },
  {
    id: 'pro' as PlanId,
    name: 'Pro',
    price: 197,
    launchPrice: 98.50 as number | null,
    launchBadge: 'OFFRE LANCEMENT -50%' as string | null,
    minutes: '500 min / mois',
    overage: '0,25 €/min au-delà',
    features: ['Tout Solo', 'CRM clients', 'Rapports hebdomadaires', 'Jusqu\'à 3 utilisateurs'],
    popular: true,
  },
  {
    id: 'max' as PlanId,
    name: 'Max',
    price: 347,
    launchPrice: 242.90 as number | null,
    launchBadge: 'OFFRE LANCEMENT -30%' as string | null,
    minutes: '1 000 min / mois',
    overage: '0,20 €/min au-delà',
    features: ['Tout Pro', 'Multilingue (FR EN AR ES)', 'Multi-numéros', 'Jusqu\'à 10 utilisateurs'],
    popular: false,
  },
]

interface Props {
  userId: string
  onDone: (plan: PlanId) => void
}

export default function Step3Plan({ userId, onDone }: Props) {
  const { remaining, loading: slotsLoading, decrement } = useSocialProof()
  const [selected, setSelected] = useState<PlanId>('pro')
  const [loading, setLoading]   = useState(false)

  async function handleContinue() {
    setLoading(true)
    const planLabel = selected === 'max' ? 'Max' : selected === 'pro' ? 'Pro' : 'Solo'
    await supabase.from('profiles').update({
      selected_plan: selected,
      subscription_plan: planLabel,   // lève les feature gates dès le trial (Stripe écrase au paiement)
      onboarding_step: 4,
    }).eq('id', userId)
    onDone(selected)
    setLoading(false)
  }

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h2 className="text-2xl font-bold text-white mb-1">Choisissez votre forfait</h2>
        <p className="text-sm" style={{ color: 'rgba(148,163,184,0.85)' }}>
          Gratuit 7 jours · Sans carte bancaire · Modifiable à tout moment
        </p>
      </div>

      <div className="flex flex-col gap-3">
        {PLANS.map(plan => {
          const isSelected = selected === plan.id
          return (
            <button
              key={plan.id}
              type="button"
              onClick={() => setSelected(plan.id)}
              className="relative w-full text-left rounded-2xl p-5 transition-all"
              style={{
                background: isSelected
                  ? 'rgba(59,91,245,0.15)'
                  : 'rgba(255,255,255,0.04)',
                border: isSelected
                  ? '2px solid rgba(59,91,245,0.7)'
                  : '1px solid rgba(255,255,255,0.10)',
                boxShadow: isSelected ? '0 0 24px rgba(59,91,245,0.20)' : 'none',
              }}
            >
              {plan.launchBadge ? (
                <div className="absolute -top-2.5 left-1/2 -translate-x-1/2 px-3 py-0.5 rounded-full text-white text-[10px] font-bold uppercase tracking-widest whitespace-nowrap" style={{ background: '#059669' }}>
                  {plan.launchBadge}
                </div>
              ) : plan.popular && (
                <div className="absolute -top-2.5 left-1/2 -translate-x-1/2 px-3 py-0.5 rounded-full text-white text-[10px] font-bold uppercase tracking-widest" style={{ background: BRAND }}>
                  Populaire
                </div>
              )}

              <div className="flex items-start justify-between gap-3 mb-3">
                <div>
                  <p className="text-base font-bold text-white">{plan.name}</p>
                  <p className="text-xs mt-0.5" style={{ color: 'rgba(148,163,184,0.7)' }}>{plan.minutes}</p>
                </div>
                <div className="text-right flex-shrink-0">
                  {plan.launchPrice ? (
                    <>
                      <p className="text-[11px] line-through" style={{ color: 'rgba(148,163,184,0.5)' }}>{plan.price} €</p>
                      <p className="text-xl font-black text-emerald-400">{plan.launchPrice.toFixed(2).replace('.', ',')} €</p>
                      <p className="text-[10px]" style={{ color: 'rgba(148,163,184,0.6)' }}>1er mois HT</p>
                    </>
                  ) : (
                    <>
                      <p className="text-xl font-black text-white">{plan.price} €</p>
                      <p className="text-[10px]" style={{ color: 'rgba(148,163,184,0.6)' }}>/mois HT</p>
                    </>
                  )}
                </div>
              </div>

              <div className="flex flex-col gap-1.5">
                {plan.features.map(f => (
                  <div key={f} className="flex items-center gap-2">
                    <Check className="w-3.5 h-3.5 flex-shrink-0" style={{ color: isSelected ? '#3B5BF5' : 'rgba(148,163,184,0.5)' }} />
                    <span className="text-xs" style={{ color: isSelected ? 'rgba(203,213,225,0.9)' : 'rgba(148,163,184,0.6)' }}>{f}</span>
                  </div>
                ))}
                <p className="text-[10px] mt-1" style={{ color: 'rgba(148,163,184,0.45)' }}>{plan.overage}</p>
              </div>

              {isSelected && (
                <div className="absolute top-4 right-4 w-5 h-5 rounded-full flex items-center justify-center" style={{ background: BRAND }}>
                  <Check className="w-3 h-3 text-white" />
                </div>
              )}
            </button>
          )
        })}
      </div>

      <button
        onClick={handleContinue}
        disabled={loading}
        className="w-full py-4 rounded-xl text-white text-sm font-bold transition-all disabled:opacity-40 flex items-center justify-center gap-2"
        style={{ background: BRAND }}
      >
        {loading && <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />}
        Démarrer l'essai gratuit →
      </button>

      <div className="flex flex-col items-center gap-2">
        <p className="text-xs text-center font-semibold" style={{ color: 'rgba(203,213,225,0.8)' }}>
          🔒 Prix fondateurs <strong style={{ color: '#fff' }}>197€</strong> le 1er mois — puis 497€/mois
        </p>
        <ScarcityBadge remaining={remaining} loading={slotsLoading} />
      </div>

      <p className="text-xs text-center" style={{ color: 'rgba(148,163,184,0.45)' }}>
        Aucun prélèvement pendant 7 jours · CB demandée uniquement à l'activation
      </p>

      <SocialProofToast onDecrement={decrement} />
    </div>
  )
}
