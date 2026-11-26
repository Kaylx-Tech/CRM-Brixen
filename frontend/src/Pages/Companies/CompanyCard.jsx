import { useState } from 'react'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { IconAlertTriangle, IconArrowRight, IconBuildingSkyscraper, IconBrandWhatsapp, IconCalendarDue, IconCircleCheck, IconDotsVertical, IconFileText, IconSend, IconShieldCheck } from '@tabler/icons-react'
import { cn } from 'cn'
import { toast } from 'sonner'
import { apiRequest } from '@/lib/api'
import ViewCompany from './ViewCompany'
import { needsAttention, attentionSummary, offerStatusLine } from './attention'

// Show the green "Genuine" shield beside the number (data checked against Companies House)
const SHOW_GENUINE = false

// Whole days from today to a "YYYY-MM-DD" date (negative once it has passed), or null
const daysUntil = (value) => {
  const m = String(value || '').match(/^(\d{4})-(\d{2})-(\d{2})/)
  if (!m) return null
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  return Math.round((new Date(+m[1], +m[2] - 1, +m[3]) - today) / 86400000)
}

/** A deadline chip: "CS Due 71d", amber inside 30 days, red once overdue. */
function DueChip({ icon: Icon, label, date, overdue }) {
  const days = daysUntil(date)
  if (days === null && !overdue) return null
  const late = overdue || (days !== null && days < 0)
  const soon = !late && days !== null && days <= 30
  return (
    <span
      title={date ? `${label} due ${date.slice(8, 10)}/${date.slice(5, 7)}/${date.slice(0, 4)}` : label}
      className={cn(
        'inline-flex items-center gap-1 rounded-lg border px-2 py-1 text-[11px] tabular-nums',
        late ? 'border-destructive/25 bg-destructive/[0.07] text-destructive dark:text-red-300'
          : soon ? 'border-yellow-500/35 bg-yellow-500/10 text-yellow-700 dark:border-yellow-400/30 dark:text-yellow-300'
            : 'border-border bg-muted/40 text-muted-foreground dark:border-white/10 dark:bg-white/[0.04]'
      )}
    >
      <Icon className="size-3.5 shrink-0" />
      {label}
      <span className="font-semibold text-foreground/90">
        {late ? (days !== null && days < 0 ? `${-days}d Late` : 'Overdue') : `${days}d`}
      </span>
    </span>
  )
}

const CompanyCard = ({ company, isSelected, onToggleSelect, onDelete, onRefresh, offer, onOffer }) => {
  const [isViewModalOpen, setIsViewModalOpen] = useState(false)

  // Check Now: fresh dates and status from Companies House straight away (backend services/ch_refresh.py)
  const checkNow = async () => {
    const id = toast.loading('Checking Companies House…')
    const res = await apiRequest(`/admin/companies/${company.id}/ch-refresh`, { method: 'POST', label: 'Companies House', silent: true })
    if (res.ok) {
      toast.success(res.data?.message || 'Up to date.', { id })
      onRefresh?.()
    } else toast.error(res.data?.error || res.reason || 'Companies House did not answer.', { id })
  }

  const name = company?.name || 'Unnamed Company'
  const number = company?.number || '#00000000'
  const director = company?.director || ''
  const address = company?.address || 'United Kingdom'
  const countryFlag = company?.countryFlag || '🇬🇧'
  const countryName = company?.countryName || 'UK'
  const raw = company?.raw || {}
  // A company without a real Companies House number is not live yet, whatever its stored status says
  const status = company?.isRegistered === false ? 'Not Registered' : (company?.status || 'Active')
  const hasAttention = company?.isRegistered !== false && needsAttention(company)
  const genuine = SHOW_GENUINE && Boolean(company?.is_genuine || company?.data_locked)
  const statusTone = /^active$/i.test(status) ? 'badge-green'
    : /dissolved/i.test(status) ? 'badge-red'
      : /inactive|not registered/i.test(status) ? 'badge-amber' : 'badge-blue'

  return (
    <>
      <Card
        size="sm"
        className={cn(
          'group/company relative flex h-full w-full flex-col gap-3 pt-5 transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md',
          // Calm by default: a soft edge in the theme colour that comes forward on hover; a company that needs
          // attention looks the same (the red note inside says why), so a page of them never turns red
          isSelected
            ? 'ring-2 ring-primary/70 bg-primary/[0.04]'
            : 'ring-primary/15 hover:ring-primary/40 dark:ring-white/10 dark:hover:ring-primary/45'
        )}
      >
        {/* A thin line in the theme colour along the top, fading out to the right */}
        <span aria-hidden className="absolute inset-x-0 top-0 h-[3px] bg-linear-to-r from-primary/70 via-primary/25 to-transparent" />

        <div className="flex items-start gap-3 px-4">
          <button
            type="button"
            onClick={() => setIsViewModalOpen(true)}
            aria-label={`Open ${name}`}
            className="relative flex size-11 shrink-0 items-center justify-center rounded-xl bg-primary/[0.08] text-primary ring-1 ring-inset ring-primary/10 transition-colors group-hover/company:bg-primary/[0.13] dark:bg-white/[0.05] dark:ring-white/10"
          >
            <IconBuildingSkyscraper className="size-5" />
            {/* A small red dot when Companies House shows something to do */}
            {hasAttention && <span className="absolute -top-0.5 -right-0.5 size-2.5 rounded-full bg-destructive ring-2 ring-card" />}
          </button>
          <div className="min-w-0 flex-1">
            {/* Name, then the country flag and a small status beside it */}
            <div className="flex min-w-0 items-center gap-1.5">
              <h3 className="min-w-0 truncate text-sm font-semibold leading-tight" title={name}>
                <button
                  type="button"
                  onClick={() => setIsViewModalOpen(true)}
                  className="max-w-full truncate text-left hover:text-primary focus-visible:outline-none focus-visible:underline"
                >
                  {name}
                </button>
              </h3>
              <span className="shrink-0 text-sm leading-none" title={countryName} aria-label={countryName}>{countryFlag}</span>
              <Badge className={cn(statusTone, 'h-4 shrink-0 px-1.5 text-[10px]')}>{status}</Badge>
            </div>
            <div className="mt-1 flex items-center gap-1.5 text-xs text-muted-foreground">
              <span className="tabular-nums">{number}</span>
              {genuine && (
                <span title="Genuine: checked against Companies House" className="inline-flex">
                  <IconShieldCheck className="size-3.5 text-emerald-600 dark:text-emerald-400" />
                </span>
              )}
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-1">
            <Checkbox
              checked={isSelected}
              onCheckedChange={() => onToggleSelect && onToggleSelect(company.id)}
              className="data-[state=checked]:bg-primary data-[state=checked]:border-primary"
              aria-label={`Select ${name}`}
            />
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground" aria-label="More">
                  <IconDotsVertical className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={() => setIsViewModalOpen(true)}>View Details</DropdownMenuItem>
                {company?.isRegistered !== false && <DropdownMenuItem onClick={checkNow}>Check Companies House Now</DropdownMenuItem>}
                <DropdownMenuItem onClick={() => onToggleSelect && onToggleSelect(company.id)}>
                  {isSelected ? 'Deselect' : 'Select'}
                </DropdownMenuItem>
                {onDelete && (
                  <DropdownMenuItem
                    onClick={() => onDelete(company.id)}
                    className="text-destructive focus:bg-destructive/10 focus:text-destructive"
                  >
                    Delete
                  </DropdownMenuItem>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>

        <div className="space-y-1 px-4 text-xs">
          <p className="truncate" title={director}>
            <span className="text-muted-foreground">Director · </span>
            {director ? <span className="font-medium">{director}</span> : <span className="text-muted-foreground/70">Not known yet</span>}
          </p>
          <p className="truncate text-muted-foreground" title={address}>{address}</p>
        </div>

        <div className="flex flex-wrap items-center gap-1.5 px-4">
          <DueChip icon={IconCalendarDue} label="CS Due" date={raw.confirmation_next_due} overdue={Boolean(raw.confirmation_overdue)} />
          <DueChip icon={IconFileText} label="Accounts" date={raw.accounts_next_due} overdue={Boolean(raw.accounts_overdue)} />
        </div>

        {hasAttention && (
          <p className="mx-4 flex items-start gap-1.5 rounded-lg bg-destructive/[0.07] px-2.5 py-1.5 text-[11px] font-medium text-destructive dark:bg-destructive/10 dark:text-red-300">
            <IconAlertTriangle className="mt-px size-3.5 shrink-0" />
            <span className="line-clamp-2">{attentionSummary(company)}</span>
          </p>
        )}

        {/* Attention › Offer to Fix: send the client an offer for the service that fixes it */}
        {hasAttention && onOffer && (
          <div className="mx-4 flex items-center justify-between gap-2">
            <span className={cn('min-w-0 truncate text-[11px]', offer?.accepted_at ? 'font-semibold text-emerald-600 dark:text-emerald-400' : 'text-muted-foreground')}>
              {offer?.accepted_at && <IconCircleCheck className="mr-1 inline size-3.5 align-[-2px]" />}
              {offer ? offerStatusLine(offer) : 'No offer sent yet'}
            </span>
            {offer?.contact_number && !offer?.accepted_at ? (
              <a
                href={`https://wa.me/${String(offer.contact_number).replace(/\D/g, '')}`}
                target="_blank"
                rel="noreferrer"
                className="inline-flex h-7 shrink-0 items-center gap-1 rounded-md bg-[#25D366] px-2.5 text-xs font-semibold text-white hover:bg-[#1fb257]"
              >
                <IconBrandWhatsapp className="size-3.5" /> WhatsApp
              </a>
            ) : !offer?.accepted_at && (
              <Button size="sm" variant={offer ? 'outline' : 'default'} className="h-7 shrink-0 px-2.5 text-xs" onClick={() => onOffer(company)}>
                <IconSend className="size-3.5" /> {offer ? 'Send Again' : 'Offer to Fix'}
              </Button>
            )}
          </div>
        )}

        <div className="mt-auto border-t px-4 pt-2.5 dark:border-white/10">
          <button
            type="button"
            onClick={() => setIsViewModalOpen(true)}
            className="flex w-full items-center justify-between text-xs font-semibold text-foreground/75 transition-colors hover:text-primary"
          >
            View Details
            <IconArrowRight className="size-4 text-primary transition-transform group-hover/company:translate-x-0.5" />
          </button>
        </div>
      </Card>

      <ViewCompany
        isOpen={isViewModalOpen}
        onClose={() => setIsViewModalOpen(false)}
        company={company}
        onUpdate={onRefresh}
      />
    </>
  )
}

export default CompanyCard
