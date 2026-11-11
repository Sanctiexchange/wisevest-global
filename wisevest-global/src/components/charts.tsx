import { money } from '../lib/format'

export function LineChart({ values, labels }: { values: number[]; labels: string[] }) {
  const W = 600, H = 220, pad = 34
  const min = Math.min(...values) * 0.9
  const max = Math.max(...values) * 1.05
  const pts = values.map((v, i) => [pad + (i * (W - pad * 2)) / (values.length - 1), H - 30 - ((v - min) / (max - min)) * (H - 60)])
  const line = pts.map((p) => p.join(',')).join(' ')
  const area = `M${pts[0][0]},${H - 30} L${line.replace(/ /g, ' L')} L${pts[pts.length - 1][0]},${H - 30}Z`
  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" role="img" aria-label={`Portfolio value from ${money(values[0])} to ${money(values[values.length - 1])}`}>
      <defs>
        <linearGradient id="lg" x1="0" x2="1"><stop offset="0" stopColor="#0F3D33" /><stop offset="1" stopColor="#BBEC04" /></linearGradient>
        <linearGradient id="ag" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#0F3D33" stopOpacity=".2" /><stop offset="1" stopColor="#0F3D33" stopOpacity="0" /></linearGradient>
      </defs>
      <path d={area} fill="url(#ag)" />
      <polyline points={line} fill="none" stroke="url(#lg)" strokeWidth="3" strokeLinejoin="round" strokeLinecap="round" />
      {pts.map((p, i) => (
        <g key={i}>
          <circle cx={p[0]} cy={p[1]} r="4" fill="#FFFFFF" stroke="#0F3D33" strokeWidth="2" />
          <text x={p[0]} y={H - 8} textAnchor="middle" fill="#6B7280" fontSize="11">{labels[i]}</text>
        </g>
      ))}
    </svg>
  )
}

export function Donut({ items }: { items: { label: string; value: number; color: string }[] }) {
  const total = items.reduce((a, b) => a + b.value, 0) || 1
  const C = 2 * Math.PI * 42
  let off = 0
  return (
    <div>
      <svg viewBox="0 0 120 120" width="150" className="mx-auto mb-4 block" role="img" aria-label="Allocation by category">
        <circle cx="60" cy="60" r="42" fill="none" stroke="#F2F4F2" strokeWidth="16" />
        {items.map((it) => {
          const f = (it.value / total) * C
          const el = <circle key={it.label} cx="60" cy="60" r="42" fill="none" stroke={it.color} strokeWidth="16" strokeDasharray={`${f} ${C - f}`} strokeDashoffset={-off} transform="rotate(-90 60 60)" />
          off += f
          return el
        })}
      </svg>
      <ul className="space-y-2 text-sm">
        {items.map((it) => (
          <li key={it.label} className="flex items-center gap-2.5">
            <i className="h-2.5 w-2.5 rounded-[3px]" style={{ background: it.color }} />
            {it.label}
            <b className="ml-auto font-medium">{Math.round((it.value / total) * 100)}%</b>
          </li>
        ))}
      </ul>
    </div>
  )
}
