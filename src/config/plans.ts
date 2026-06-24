// Offre unique Fixlyy — depuis 2026-06-24
// Les plans Solo / Pro / Max sont supprimés.

export const PLAN = {
  name:             'Fixlyy',
  price:            497,
  included_minutes: 1500,
  overage_rate:     0.20,
  commitment_months: 3,
  trial_days:       7,
} as const

// Price ID Stripe — 497€/mois récurrent, trial 7 jours
// Créé le 2026-06-24 via Stripe CLI
export const STRIPE_PRICE_ID = 'price_1TkkZXBKWw2SqpykPLACEHOLDER'
