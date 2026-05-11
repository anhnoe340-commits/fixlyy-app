import { useProfile } from '@/contexts/ProfileContext'

const BRAND = '#2850c8'

export default function TrialBanner() {
  const { profile } = useProfile()
  if (!profile) return null

  const trialStatus = (profile as any).trial_status
  const trialEndsAt = (profile as any).trial_ends_at
  const paymentAdded = (profile as any).payment_method_added

  if (paymentAdded || !trialStatus) return null

  const daysLeft = trialEndsAt
    ? Math.max(0, Math.ceil((new Date(trialEndsAt).getTime() - Date.now()) / 86400000))
    : null

  async function handleAddPayment() {
    // TODO: ouvrir Stripe Checkout en mode setup_intent
    window.location.href = 'https://app.fixlyy.fr/subscription'
  }

  if (trialStatus === 'expired') {
    return (
      <div className="w-full px-4 py-2.5 flex items-center justify-between gap-3 text-white text-xs" style={{ background: '#EF4444' }}>
        <span className="font-medium">Votre essai est terminé. Ajoutez votre paiement pour réactiver Mia.</span>
        <button onClick={handleAddPayment}
          className="flex-shrink-0 px-3 py-1.5 rounded-lg bg-white text-red-600 font-semibold text-xs hover:bg-red-50 transition-colors">
          Ajouter ma carte
        </button>
      </div>
    )
  }

  if (trialStatus === 'active') {
    return (
      <div className="w-full px-4 py-2.5 flex items-center justify-between gap-3 text-white text-xs" style={{ background: '#111827' }}>
        <span>
          Essai gratuit —{' '}
          {daysLeft !== null
            ? <span className="font-semibold">Plus que {daysLeft} jour{daysLeft !== 1 ? 's' : ''}.</span>
            : 'Essai en cours.'
          }
          {' '}Ajoutez votre paiement pour ne pas perdre votre numéro.
        </span>
        <button onClick={handleAddPayment}
          className="flex-shrink-0 px-3 py-1.5 rounded-lg font-semibold text-xs transition-colors"
          style={{ background: BRAND + '30', color: '#93C5FD' }}>
          Ajouter ma carte
        </button>
      </div>
    )
  }

  return null
}
