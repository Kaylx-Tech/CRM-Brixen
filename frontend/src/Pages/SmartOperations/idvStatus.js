// Colours and words for Didit identity verification results, shared by Smart Operations > ID Verification,
// the order view and the client portal.

// Didit session statuses
export function checkTone(status) {
  const s = String(status || 'Not Started')
  if (s === 'Approved') return 'badge-green'
  if (['Declined', 'Abandoned', 'Expired', 'Kyc Expired'].includes(s)) return 'bg-destructive/15 text-destructive'
  if (['In Review', 'Resubmitted', 'Awaiting User'].includes(s)) return 'badge-amber'
  if (s === 'In Progress') return 'badge-sky'
  return 'bg-muted text-muted-foreground'
}

export function shortDate(value) {
  if (!value) return '—'
  const d = new Date(String(value).replace(' ', 'T'))
  return Number.isNaN(d.getTime())
    ? '—'
    : d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
}

// AML screening (PEP, sanctions, adverse media) in a few words, and its colour.
// Matches already marked False Positive in Didit do not count.
export const openHits = (aml) => aml.open_hits ?? aml.total_hits ?? 0

export function amlLabel(aml) {
  if (!aml) return ''
  const open = openHits(aml)
  if (open > 0) return `${open} possible match${open === 1 ? '' : 'es'}`
  if (aml.status === 'Approved') return 'Clear'
  if (aml.status === 'Not Finished') return 'Not finished'
  return aml.status || 'Clear'
}

export function amlTone(aml) {
  if (!aml) return 'bg-muted text-muted-foreground'
  if (aml.status === 'Declined') return 'bg-destructive/15 text-destructive'
  if (openHits(aml) > 0 || aml.status === 'In Review') return 'badge-amber'
  if (aml.status === 'Approved') return 'badge-green'
  return 'bg-muted text-muted-foreground'
}
