// Mirror minimal de src/config/plans.ts — synchroniser si les features changent.
// Source de vérité : src/config/plans.ts

type BooleanFeature =
  | 'sms_confirmation' | 'appointment_booking' | 'crm'
  | 'weekly_report' | 'google_calendar' | 'detailed_stats'
  | 'multilingual' | 'monthly_reports' | 'multi_numbers'

const FEATURES: Record<string, Partial<Record<BooleanFeature, boolean>>> = {
  solo: {
    sms_confirmation: false, appointment_booking: false, crm: false,
    weekly_report: false, google_calendar: false, detailed_stats: false,
    multilingual: false, monthly_reports: false, multi_numbers: false,
  },
  pro: {
    sms_confirmation: true, appointment_booking: true, crm: true,
    weekly_report: true, google_calendar: true, detailed_stats: true,
    multilingual: false, monthly_reports: false, multi_numbers: false,
  },
  max: {
    sms_confirmation: true, appointment_booking: true, crm: true,
    weekly_report: true, google_calendar: true, detailed_stats: true,
    multilingual: true, monthly_reports: true, multi_numbers: true,
  },
}

export function normalizePlan(raw: string | null | undefined): string {
  const s = (raw ?? '').toLowerCase()
  if (s === 'pro') return 'pro'
  if (
    s === 'max' ||
    s.includes('équipe') || s.includes('equipe') ||
    s.includes('expert') || s.includes('team')
  ) return 'max'
  return 'solo'
}

export function featureAllowed(
  subscriptionPlan: string | null | undefined,
  feature: BooleanFeature,
): boolean {
  return !!FEATURES[normalizePlan(subscriptionPlan)]?.[feature]
}

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, content-type',
}

export function planGate403(feature: BooleanFeature, subscriptionPlan: string | null | undefined): Response {
  const required = FEATURES.pro[feature] ? 'pro' : 'max'
  return new Response(
    JSON.stringify({ error: 'plan_feature_unavailable', feature, required_plan: required }),
    { status: 403, headers: { ...CORS, 'Content-Type': 'application/json' } },
  )
}
