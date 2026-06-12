export const PLANS = {
  solo: {
    name: 'Solo',
    price: 97,
    included_minutes: 300,
    overage_rate: 0.25,
    member_limit: 1,
    call_reasons_limit: 0,
    sms_confirmation: false,
    appointment_booking: false,
    crm: false,
    weekly_report: false,
    google_calendar: false,
    detailed_stats: false,
    multilingual: false,
    monthly_reports: false,
    multi_numbers: false,
    pricing: false,
    team: false,
  },
  pro: {
    name: 'Pro',
    price: 197,
    included_minutes: 500,
    overage_rate: 0.25,
    member_limit: 3,
    call_reasons_limit: 10,
    sms_confirmation: true,
    appointment_booking: true,
    crm: true,
    weekly_report: true,
    google_calendar: true,
    detailed_stats: true,
    multilingual: false,
    monthly_reports: false,
    multi_numbers: false,
    pricing: true,
    team: true,
  },
  max: {
    name: 'Max',
    price: 347,
    included_minutes: 1000,
    overage_rate: 0.20,
    member_limit: 10,
    call_reasons_limit: 20,
    sms_confirmation: true,
    appointment_booking: true,
    crm: true,
    weekly_report: true,
    google_calendar: true,
    detailed_stats: true,
    multilingual: true,
    monthly_reports: true,
    multi_numbers: true,
    pricing: true,
    team: true,
  },
} as const

export type PlanKey = keyof typeof PLANS

type BooleanFeatureKey = {
  [K in keyof typeof PLANS.solo]: typeof PLANS.solo[K] extends boolean ? K : never
}[keyof typeof PLANS.solo]

export function canUseFeature(
  plan: PlanKey,
  feature: BooleanFeatureKey
): boolean {
  return PLANS[plan][feature]
}

export function getPlanLimit(
  plan: PlanKey,
  key: 'member_limit' | 'call_reasons_limit' | 'included_minutes' | 'overage_rate'
): number {
  return PLANS[plan][key] as number
}

// Stripe price IDs produits (créés le 2026-06-09)
export const STRIPE_PRICE_IDS: Record<PlanKey, string> = {
  solo: 'price_1TgNhNBKWw2SqpykxEkXTAma',
  pro:  'price_1TgNhOBKWw2SqpykzY7j1ood',
  max:  'price_1TgNhOBKWw2Sqpyku7Rk2ioO',
}
