// Periods for the Smart Operations revenue strip
export const REVENUE_PERIODS = [
  ['month', 'This Month'],
  ['year', 'This Year'],
  ['all', 'All Time'],
]

/** 'month' → '2026-11', 'year' → '2026', 'all' → '' (the API's period) */
export function periodParam(period) {
  const now = new Date()
  if (period === 'month') return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
  if (period === 'year') return String(now.getFullYear())
  return ''
}
