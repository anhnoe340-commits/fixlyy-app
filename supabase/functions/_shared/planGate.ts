// Offre unique Fixlyy 497€ — toutes les features incluses pour tous les abonnés actifs.
// Plus de gate par plan solo/pro/max — une seule offre, tout déverrouillé.

type BooleanFeature =
  | 'sms_confirmation' | 'appointment_booking' | 'crm'
  | 'weekly_report' | 'google_calendar' | 'detailed_stats'
  | 'multilingual' | 'monthly_reports' | 'multi_numbers'

export function getIncludedMinutes(_plan?: string | null): number {
  return 1500
}

export function normalizePlan(_raw?: string | null): string {
  return 'max'
}

export function featureAllowed(
  _subscriptionPlan: string | null | undefined,
  _feature: BooleanFeature,
): boolean {
  return true
}

const CORS = {
  'Access-Control-Allow-Origin': 'https://app.fixlyy.fr',
  'Access-Control-Allow-Headers': 'authorization, content-type',
}

export function planGate403(_feature: BooleanFeature, _subscriptionPlan?: string | null): Response {
  // Plus de gate — ne devrait jamais être appelé, mais retourne 403 par sécurité
  return new Response(
    JSON.stringify({ error: 'plan_feature_unavailable' }),
    { status: 403, headers: { ...CORS, 'Content-Type': 'application/json' } },
  )
}
