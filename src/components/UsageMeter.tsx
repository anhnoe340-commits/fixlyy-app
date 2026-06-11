import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import { type PlanKey } from '@/config/plans'

interface UsageData {
  minutes_used: number
  minutes_quota: number
  minutes_remaining: number
  overage_minutes: number
  overage_amount_eur: number
  overage_rate: number
  period_start: string
  period_end: string
  calls_count: number
  plan: string
}

interface UsageMeterProps {
  accent: string
  userPlan: PlanKey
  onUpgrade?: () => void
  compact?: boolean
}

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long' })
}

export default function UsageMeter({ accent, userPlan, onUpgrade, compact = false }: UsageMeterProps) {
  const [data, setData] = useState<UsageData | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function load() {
      try {
        const { data: { session } } = await supabase.auth.getSession()
        if (!session?.access_token) return
        const res = await fetch(
          `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/get-usage`,
          { headers: { Authorization: `Bearer ${session.access_token}` } },
        )
        if (res.ok) setData(await res.json())
      } catch { /* silencieux */ }
      finally { setLoading(false) }
    }
    load()
  }, [])

  if (loading) {
    return (
      <div className="bg-white border border-gray-100 rounded-2xl p-4 shadow-sm animate-pulse">
        <div className="h-3 bg-gray-100 rounded-full w-32 mb-3" />
        <div className="h-2 bg-gray-100 rounded-full w-full mb-2" />
        <div className="h-3 bg-gray-100 rounded-full w-48" />
      </div>
    )
  }

  if (!data) return null

  const pct         = Math.min(100, Math.round((data.minutes_used / data.minutes_quota) * 100))
  const isOver      = data.overage_minutes > 0
  const isWarning   = !isOver && pct >= 80
  const barColor    = isOver ? '#EF4444' : pct >= 90 ? '#EF4444' : pct >= 70 ? '#F59E0B' : '#10B981'
  const isMaxPlan   = userPlan === 'max'

  return (
    <div className="bg-white border border-gray-100 rounded-2xl shadow-sm overflow-hidden">
      {/* Alerte > 80% */}
      {(isWarning || isOver) && (
        <div className={`flex items-center justify-between gap-2 px-4 py-2.5 ${isOver ? 'bg-red-50 border-b border-red-100' : 'bg-amber-50 border-b border-amber-100'}`}>
          <div className="flex items-center gap-2 min-w-0">
            <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${isOver ? 'bg-red-500 animate-pulse' : 'bg-amber-500'}`} />
            <p className={`text-[12px] font-semibold truncate ${isOver ? 'text-red-700' : 'text-amber-700'}`}>
              {isOver
                ? `Quota dépassé — ${data.overage_minutes} min en dépassement (${data.overage_amount_eur.toFixed(2)} €)`
                : `Vous approchez de votre limite — ${pct}% utilisé`}
            </p>
          </div>
          {!isMaxPlan && onUpgrade && (
            <button
              onClick={onUpgrade}
              className="text-[11px] font-semibold px-2.5 py-1 rounded-lg flex-shrink-0 text-white"
              style={{ background: accent }}>
              Upgrader
            </button>
          )}
        </div>
      )}

      <div className={compact ? 'px-4 py-3' : 'px-4 pt-3.5 pb-4'}>
        {/* Header */}
        <div className="flex items-center justify-between mb-2.5">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-gray-400">Utilisation ce mois</p>
          <p className="text-[11px] text-gray-400">
            Renouvellement le <span className="font-medium text-gray-600">{fmtDate(data.period_end)}</span>
          </p>
        </div>

        {/* Barre de progression */}
        <div className="w-full bg-gray-100 rounded-full h-2 mb-2.5">
          <div
            className="h-2 rounded-full transition-all duration-700"
            style={{ width: `${pct}%`, background: barColor }}
          />
        </div>

        {/* Texte */}
        <div className="flex items-end justify-between gap-2">
          <div>
            <p className="text-[13px] font-semibold text-gray-800 leading-snug">
              <span style={{ color: barColor }}>{data.minutes_used} min</span>
              {' '}utilisées sur{' '}
              <span className="text-gray-700">{data.minutes_quota} min</span>
            </p>
            <p className="text-[11px] text-gray-400 mt-0.5">
              {isOver
                ? <span className="text-red-600 font-medium">Dépassement facturé à {data.overage_rate} €/min</span>
                : `${data.minutes_remaining} min restantes`}
            </p>
          </div>
          {!compact && (
            <div className="text-right flex-shrink-0">
              <p className="text-[20px] font-bold leading-none" style={{ color: barColor }}>{pct}%</p>
              <p className="text-[10px] text-gray-400 mt-0.5">{data.calls_count} appel{data.calls_count !== 1 ? 's' : ''}</p>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
