export const money = (n: number, digits = 0) =>
  '$' + n.toLocaleString('en-US', { minimumFractionDigits: digits, maximumFractionDigits: 2 })

export const signed = (n: number) => (n >= 0 ? '+' : '−') + money(Math.abs(n))

export const today = () => new Date().toISOString().slice(0, 10)

export const uid = (p: string) => `${p}-${Math.random().toString(36).slice(2, 7).toUpperCase()}`

export const parseAmount = (v: string) => {
  const n = parseFloat(v.replace(/,/g, ''))
  return Number.isFinite(n) ? n : NaN
}

export function downloadCsv(fileName: string, headers: string[], rows: (string | number)[][]) {
  const escapeCell = (value: string | number) => {
    const text = typeof value === 'string' && /^[\s]*[=+\-@]/.test(value) ? `'${value}` : String(value)
    return `"${text.replace(/"/g, '""')}"`
  }
  const csv = [headers, ...rows].map((row) => row.map(escapeCell).join(',')).join('\r\n')
  const blob = new Blob([`\uFEFF${csv}`], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = fileName
  link.hidden = true
  document.body.appendChild(link)
  link.click()
  link.remove()
  window.setTimeout(() => URL.revokeObjectURL(url), 0)
}
