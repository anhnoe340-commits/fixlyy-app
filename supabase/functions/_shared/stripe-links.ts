// Référence des objets Stripe Fixlyy — NE JAMAIS SUPPRIMER CES IDs
// Mis à jour le 2026-06-13

// ── Price IDs (LIVE) ─────────────────────────────────────────────────────────
export const STRIPE_PRICES = {
  solo_monthly:  'price_1TgNhNBKWw2SqpykxEkXTAma',  // 79€/mois
  pro_monthly:   'price_1TgNhOBKWw2SqpykzY7j1ood',  // 149€/mois
  max_monthly:   'price_1TgNhOBKWw2Sqpyku7Rk2ioO',  // 197€/mois
} as const

// ── Payment Links ─────────────────────────────────────────────────────────────
export const STRIPE_PAYMENT_LINKS = {
  /**
   * Canal prospection téléphonique (créé 2026-06-13)
   * - Plan Pro, trial 7j, CB collectée upfront
   * - allow_promotion_codes: true → entrer le coupon INTRO-[PRENOM] au checkout
   * - phone_number_collection: true → nécessaire pour matching côté /setup
   * - Redirect après paiement : https://app.fixlyy.fr/setup?source=prospection
   */
  pro_prospection: {
    id:  'plink_1ThtJ6BKWw2SqpykhQt9X0Ji',
    url: 'https://buy.stripe.com/00w4gy0MWabLfmogjx0gw01',
  },
} as const

// ── Coupons ──────────────────────────────────────────────────────────────────
export const STRIPE_COUPONS = {
  /**
   * INTRO — Base coupon pour la prospection téléphonique (créé 2026-06-13)
   * - percent_off: 25%, duration: once (1er prélèvement J+7 seulement)
   * - USAGE : dupliquer dans le Dashboard Stripe en INTRO-PRENOM pour chaque prospect
   *   (ex: INTRO-MARIE, INTRO-JEAN) pour tracker l'utilisation individuelle
   * - Le prospect entre son code au checkout du Payment Link pro_prospection
   */
  INTRO: {
    id:          'INTRO',
    percent_off: 25,
    duration:    'once',
    note:        'Dupliquer en INTRO-[PRENOM] pour chaque prospect via Stripe Dashboard',
  },
} as const
