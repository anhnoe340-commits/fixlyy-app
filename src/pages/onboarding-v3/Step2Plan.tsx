import { useState } from 'react'
import { supabase } from '@/lib/supabase'
import { PLANS, STRIPE_PRICE_IDS, STRIPE_PRICE_IDS_ANNUAL, ANNUAL_MONTHLY_PRICE, type PlanKey } from '@/config/plans'
import { Check } from 'lucide-react'

const BRAND    = '#3B5BF5'
export const PLAN_SESSION_KEY = 'fixlyy_onboarding_plan'

const PLAN_HIGHLIGHTS: Record<PlanKey, string[]> = {
  solo: ['1 numéro dédié', 'SMS récap 30 secondes', 'Qualification urgences', '1 utilisateur'],
  pro:  ['Tout Solo', 'CRM clients', 'Rapports hebdomadaires', "Jusqu'à 3 utilisateurs"],
  max:  ['Tout Pro', 'Multilingue (FR EN AR ES)', 'Multi-numéros', "Jusqu'à 10 utilisateurs"],
}

const LAUNCH: Record<PlanKey, { badge: string; reducedPrice: number } | null> = {
  solo: null,
  pro:  { badge: 'OFFRE LANCEMENT -50%', reducedPrice: 98.50 },
  max:  { badge: 'OFFRE LANCEMENT -30%', reducedPrice: 242.90 },
}

interface Props {
  companyName: string
  trade: string
  onBack: () => void
}

export default function Step2Plan({ companyName, trade, onBack }: Props) {
  const billingInterval = (new URLSearchParams(window.location.search).get('billing') === 'annual') ? 'annual' : 'monthly'
  const isAnnual = billingInterval === 'annual'

  const [selected, setSelected] = useState<PlanKey>('pro')
  const [loading, setLoading]   = useState(false)
  const [error, setError]       = useState('')

  async function handleCheckout() {
    setLoading(true); setError('')
    try {
      sessionStorage.setItem(PLAN_SESSION_KEY, selected)

      const { data: { session } } = await supabase.auth.getSession()
      if (!session) throw new Error('Session expirée. Reconnectez-vous.')

      const priceId = isAnnual ? STRIPE_PRICE_IDS_ANNUAL[selected] : STRIPE_PRICE_IDS[selected]

      const resp = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/create-checkout-session`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${session.access_token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            priceId,
            planId: selected,
            company: companyName,
            trade,
            billingInterval,
          }),
        }
      )
      const data = await resp.json()
      if (!resp.ok || data.error) throw new Error(data.error || 'Erreur lors de la création du checkout.')
      window.location.href = data.url
    } catch (e: any) {
      setError(e.message || 'Erreur. Réessayez.')
      setLoading(false)
    }
  }

  const plan = PLANS[selected]

  return (
    <div className="flex flex-col gap-5">
      <div>
        <h2 className="text-2xl font-bold text-white mb-1">Choisissez votre forfait</h2>
        <p className="text-sm" style={{ color: 'rgba(148,163,184,0.85)' }}>
          {isAnnual ? 'Essai 7 jours · Engagement 12 mois · Facturé annuellement' : 'Essai 7 jours · Résiliable à tout moment'}
        </p>
      </div>

      <div className="flex flex-col gap-3">
        {(Object.keys(PLANS) as PlanKey[]).map(key => {
          const p          = PLANS[key]
          const isSelected = selected === key
          const isPopular  = key === 'pro'

          const launch = LAUNCH[key]

          return (
            <button
              key={key}
              type="button"
              onClick={() => setSelected(key)}
              className="relative w-full text-left rounded-2xl p-5 transition-all"
              style={{
                background: isSelected ? 'rgba(59,91,245,0.15)' : 'rgba(255,255,255,0.04)',
                border: isSelected ? '2px solid rgba(59,91,245,0.7)' : '1px solid rgba(255,255,255,0.10)',
                boxShadow: isSelected ? '0 0 24px rgba(59,91,245,0.20)' : 'none',
              }}
            >
              {!isAnnual && launch ? (
                <div
                  className="absolute -top-2.5 left-1/2 -translate-x-1/2 px-3 py-0.5 rounded-full text-white text-[10px] font-bold uppercase tracking-widest whitespace-nowrap"
                  style={{ background: '#059669' }}
                >
                  {launch.badge}
                </div>
              ) : isPopular ? (
                <div
                  className="absolute -top-2.5 left-1/2 -translate-x-1/2 px-3 py-0.5 rounded-full text-white text-[10px] font-bold uppercase tracking-widest"
                  style={{ background: isAnnual ? '#059669' : BRAND }}
                >
                  {isAnnual ? '-20% ANNUEL' : 'Recommandé'}
                </div>
              ) : null}

              <div className="flex items-start justify-between gap-3 mb-3">
                <div className="flex items-center gap-2.5">
                  <div
                    className="w-5 h-5 rounded-full flex-shrink-0 flex items-center justify-center transition-all"
                    style={{
                      background: isSelected ? BRAND : 'transparent',
                      border: isSelected ? 'none' : '2px solid rgba(255,255,255,0.25)',
                    }}
                  >
                    {isSelected && <Check className="w-3 h-3 text-white" />}
                  </div>
                  <div>
                    <p className="text-base font-bold text-white">{p.name}</p>
                    <p className="text-xs mt-0.5" style={{ color: 'rgba(148,163,184,0.7)' }}>
                      {p.included_minutes} min / mois
                    </p>
                  </div>
                </div>
                <div className="text-right flex-shrink-0">
                  {isAnnual ? (
                    <>
                      <p className="text-[11px] line-through" style={{ color: 'rgba(148,163,184,0.5)' }}>{p.price} €</p>
                      <p className="text-xl font-black text-emerald-400">{ANNUAL_MONTHLY_PRICE[key].toFixed(2).replace('.', ',')} €</p>
                      <p className="text-[10px]" style={{ color: 'rgba(148,163,184,0.6)' }}>/mois · facturé/an</p>
                    </>
                  ) : launch ? (
                    <>
                      <p className="text-[11px] line-through" style={{ color: 'rgba(148,163,184,0.5)' }}>{p.price} €</p>
                      <p className="text-xl font-black text-emerald-400">{launch.reducedPrice.toFixed(2).replace('.', ',')} €</p>
                      <p className="text-[10px]" style={{ color: 'rgba(148,163,184,0.6)' }}>1er mois HT</p>
                    </>
                  ) : (
                    <>
                      <p className="text-xl font-black text-white">{p.price} €</p>
                      <p className="text-[10px]" style={{ color: 'rgba(148,163,184,0.6)' }}>/mois HT</p>
                    </>
                  )}
                </div>
              </div>

              <div className="flex flex-col gap-1.5">
                {PLAN_HIGHLIGHTS[key].map(f => (
                  <div key={f} className="flex items-center gap-2">
                    <Check
                      className="w-3.5 h-3.5 flex-shrink-0"
                      style={{ color: isSelected ? '#3B5BF5' : 'rgba(148,163,184,0.5)' }}
                    />
                    <span className="text-xs" style={{ color: isSelected ? 'rgba(203,213,225,0.9)' : 'rgba(148,163,184,0.6)' }}>
                      {f}
                    </span>
                  </div>
                ))}
                <p className="text-[10px] mt-1" style={{ color: 'rgba(148,163,184,0.45)' }}>
                  {p.overage_rate === 0.20 ? '0,20 €/min' : '0,25 €/min'} au-delà
                </p>
              </div>

            </button>
          )
        })}
      </div>

      {error && (
        <p className="text-sm text-red-400 bg-red-500/10 border border-red-500/20 rounded-xl px-4 py-3">{error}</p>
      )}

      <button
        onClick={handleCheckout}
        disabled={loading}
        className="w-full py-4 rounded-xl text-white text-sm font-bold disabled:opacity-40 flex items-center justify-center gap-2"
        style={{ background: BRAND }}
      >
        {loading && <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />}
        {loading ? 'Redirection vers le paiement…' : "Démarrer l'essai gratuit →"}
      </button>

      <p className="text-xs text-center" style={{ color: 'rgba(148,163,184,0.45)' }}>
        {isAnnual
          ? `Essai 7 jours, puis ${ANNUAL_MONTHLY_PRICE[selected].toFixed(2).replace('.', ',')} €/mois · Engagement 12 mois · Facturé annuellement`
          : LAUNCH[selected]
            ? `Essai 7 jours, puis ${LAUNCH[selected]!.reducedPrice.toFixed(2).replace('.', ',')} € 1er mois, puis ${plan.price} €/mois HT`
            : `Essai 7 jours, puis ${plan.price} €/mois HT · Résiliable à tout moment`
        }
      </p>

      <button
        onClick={onBack}
        className="text-xs text-center"
        style={{ color: 'rgba(148,163,184,0.4)' }}
      >
        ← Modifier mes informations
      </button>
    </div>
  )
}
