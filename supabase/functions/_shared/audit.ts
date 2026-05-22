import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2'

type Severity = 'info' | 'warning' | 'critical'

interface LogEventParams {
  supabase: SupabaseClient
  eventType: string
  userId?: string | null
  resourceType?: string | null
  resourceId?: string | null
  metadata?: Record<string, unknown> | null
  severity?: Severity
}

export async function logEvent({
  supabase,
  eventType,
  userId = null,
  resourceType = null,
  resourceId = null,
  metadata = null,
  severity = 'info',
}: LogEventParams): Promise<void> {
  const { error } = await supabase.from('audit_log').insert({
    event_type:    eventType,
    user_id:       userId,
    resource_type: resourceType,
    resource_id:   resourceId,
    metadata,
    severity,
  })
  if (error) {
    console.error('[audit] logEvent failed:', error.message, { eventType, userId, severity })
  }
}
