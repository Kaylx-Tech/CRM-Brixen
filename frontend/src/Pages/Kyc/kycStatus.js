// How a KYC status reads to the team, shared by the owner portal and the KYC panel
// (Submitted: the client sent the form; older checks may carry Didit's statuses)

export const PILL = "inline-flex whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-semibold"
export const GREEN = "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
export const RED = "bg-destructive/10 text-destructive"
export const AMBER = "bg-amber-500/15 text-amber-800 dark:text-amber-300"
export const SKY = "bg-sky-500/10 text-sky-700 dark:text-sky-300"
export const GREY = "bg-muted text-muted-foreground"

export const REJECTED = ["Declined", "Abandoned", "Expired", "Kyc Expired"]

// Didit's status in the words the team uses: KYC Approved, Under Review, Rejected …
export function kycLabel(status) {
  if (status === "Approved") return ["KYC Approved", GREEN]
  if (status === "Declined") return ["Rejected", RED]
  if (["Abandoned", "Expired", "Kyc Expired"].includes(status)) return [`Rejected (${status.toLowerCase()})`, RED]
  if (status === "Submitted") return ["Sent, to review", SKY]
  if (["In Review", "Resubmitted"].includes(status)) return ["Under Review", AMBER]
  if (status === "In Progress") return ["In progress", SKY]
  return ["Waiting for client", GREY]
}

/** Which filter tab a check falls under: approved, rejected or pending. */
export function kycBucket(status) {
  if (status === "Approved") return "approved"
  if (REJECTED.includes(status)) return "rejected"
  return "pending"
}
