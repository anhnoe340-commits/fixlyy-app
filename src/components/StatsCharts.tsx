import {
  AreaChart, Area, BarChart, Bar, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from 'recharts'

export interface DayPoint { label: string; count: number; urgent: number }
export interface ReasonPoint { name: string; count: number }
export interface HourPoint { hour: string; count: number }

const REASON_COLORS = ['#2563EB', '#10B981', '#F59E0B', '#EF4444', '#8B5CF6', '#EC4899', '#06B6D4', '#84CC16']

const tooltipStyle = {
  contentStyle: { fontSize: 12, borderRadius: 8, border: 'none', boxShadow: '0 2px 8px rgba(0,0,0,0.1)', padding: '6px 10px' },
  labelStyle: { fontWeight: 600, color: '#374151', marginBottom: 2 },
}

export function CallsEvolutionChart({ data, accent }: { data: DayPoint[]; accent: string }) {
  if (data.every(d => d.count === 0 && d.urgent === 0)) {
    return <div className="flex items-center justify-center h-36 text-sm text-gray-300">Pas encore de données</div>
  }
  return (
    <ResponsiveContainer width="100%" height={140}>
      <AreaChart data={data} margin={{ top: 4, right: 4, bottom: 0, left: -28 }}>
        <defs>
          <linearGradient id="sgCallsGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor={accent} stopOpacity={0.18} />
            <stop offset="95%" stopColor={accent} stopOpacity={0} />
          </linearGradient>
          <linearGradient id="sgUrgentGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor="#EF4444" stopOpacity={0.12} />
            <stop offset="95%" stopColor="#EF4444" stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="3 3" stroke="#F3F4F6" vertical={false} />
        <XAxis dataKey="label" tick={{ fontSize: 9, fill: '#9CA3AF' }} tickLine={false} axisLine={false} interval="preserveStartEnd" />
        <YAxis tick={{ fontSize: 9, fill: '#9CA3AF' }} tickLine={false} axisLine={false} allowDecimals={false} />
        <Tooltip
          {...tooltipStyle}
          formatter={(v, name) => [(v ?? 0) as number, name === 'count' ? 'Appels' : 'Urgents']}
        />
        <Area type="monotone" dataKey="count" stroke={accent} strokeWidth={2} fill="url(#sgCallsGrad)" dot={false} activeDot={{ r: 3, fill: accent }} />
        <Area type="monotone" dataKey="urgent" stroke="#EF4444" strokeWidth={1.5} fill="url(#sgUrgentGrad)" dot={false} activeDot={{ r: 3, fill: '#EF4444' }} />
      </AreaChart>
    </ResponsiveContainer>
  )
}

export function HourlyChart({ data, accent }: { data: HourPoint[]; accent: string }) {
  if (data.every(d => d.count === 0)) {
    return <div className="flex items-center justify-center h-36 text-sm text-gray-300">Pas encore de données</div>
  }
  return (
    <ResponsiveContainer width="100%" height={140}>
      <BarChart data={data} margin={{ top: 4, right: 4, bottom: 0, left: -28 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#F3F4F6" vertical={false} />
        <XAxis dataKey="hour" tick={{ fontSize: 9, fill: '#9CA3AF' }} tickLine={false} axisLine={false} interval={3} />
        <YAxis tick={{ fontSize: 9, fill: '#9CA3AF' }} tickLine={false} axisLine={false} allowDecimals={false} />
        <Tooltip {...tooltipStyle} formatter={(v) => [(v ?? 0) as number, 'Appels']} />
        <Bar dataKey="count" fill={accent} radius={[3, 3, 0, 0]} maxBarSize={18} opacity={0.85} />
      </BarChart>
    </ResponsiveContainer>
  )
}

export function ReasonsChart({ data }: { data: ReasonPoint[] }) {
  if (data.length === 0) {
    return <div className="flex items-center justify-center h-36 text-sm text-gray-300">Aucun motif identifié</div>
  }
  const total = data.reduce((s, d) => s + d.count, 0)
  return (
    <div className="flex gap-3 items-center">
      <div className="flex-shrink-0" style={{ width: 120, height: 120 }}>
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie data={data} cx="50%" cy="50%" innerRadius={32} outerRadius={52} paddingAngle={3} dataKey="count" strokeWidth={0}>
              {data.map((_, i) => (
                <Cell key={i} fill={REASON_COLORS[i % REASON_COLORS.length]} />
              ))}
            </Pie>
            <Tooltip
              {...tooltipStyle}
              formatter={(v, _name, props) => [(v ?? 0) as number, (props as { payload?: { name: string } }).payload?.name ?? '']}
            />
          </PieChart>
        </ResponsiveContainer>
      </div>
      <div className="flex-1 space-y-1.5 min-w-0">
        {data.slice(0, 6).map((r, i) => {
          const pct = Math.round((r.count / total) * 100)
          return (
            <div key={i} className="flex items-center gap-2 min-w-0">
              <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: REASON_COLORS[i % REASON_COLORS.length] }} />
              <span className="text-[11px] text-gray-600 truncate flex-1 leading-none">{r.name}</span>
              <span className="text-[11px] font-semibold text-gray-500 flex-shrink-0">{pct}%</span>
            </div>
          )
        })}
      </div>
    </div>
  )
}
