// Companies House attention items (accounts overdue, confirmation statement, default address, strike-off)
// come from the API as company.attention = [{ code, title, detail, due }].

export const attentionIssues = (company) => {
  const list = company?.attention ?? company?.raw?.attention
  return Array.isArray(list) ? list.filter((item) => item && item.code) : []
}

export const needsAttention = (company) => attentionIssues(company).length > 0

export const formatUkDate = (value) => {
  const m = String(value || '').match(/^(\d{4})-(\d{2})-(\d{2})/)
  return m ? `${m[3]}/${m[2]}/${m[1]}` : String(value || '')
}

export const attentionSummary = (company) =>
  attentionIssues(company).map((item) => item.title || item.code).join(' · ')
