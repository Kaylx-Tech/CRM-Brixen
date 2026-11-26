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

/** "Email offer sent 18 Nov · Confirmation Statement" for an Offer to Fix (OfferDialog.jsx). */
export function offerStatusLine(offer) {
  if (!offer) return ''
  const when = (v) => (v ? new Date(String(v).replace(' ', 'T') + 'Z').toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }) : '')
  if (offer.accepted_at) return `Accepted ${when(offer.accepted_at)} · order created`
  // The client left a WhatsApp number on the offer page: message them
  if (offer.contact_number) return `Wants WhatsApp ${when(offer.contact_requested_at)}: ${offer.contact_number}`
  // Reminders go by themselves after 3 and 7 days (backend services/attention_offers.py run_followups)
  const reminders = Number(offer.followups) > 0 ? ` · ${offer.followups} reminder${offer.followups > 1 ? 's' : ''} sent` : ''
  if (offer.opened_at) return `Opened ${when(offer.opened_at)} · ${offer.service_name}${reminders}`
  return `${offer.channel === 'whatsapp' ? 'WhatsApp' : 'Email'} offer sent ${when(offer.sent_at)} · ${offer.service_name}${reminders}`
}
