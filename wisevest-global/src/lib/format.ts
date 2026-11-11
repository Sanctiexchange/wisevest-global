export const money = (n: number, digits = 0) =>
  '$' + n.toLocaleString('en-US', { minimumFractionDigits: digits, maximumFractionDigits: 2 })

export const signed = (n: number) => (n >= 0 ? '+' : '−') + money(Math.abs(n))

export const today = () => new Date().toISOString().slice(0, 10)

export const uid = (p: string) => `${p}-${Math.random().toString(36).slice(2, 7).toUpperCase()}`

export const parseAmount = (v: string) => {
  const n = parseFloat(v.replace(/,/g, ''))
  return Number.isFinite(n) ? n : NaN
}
