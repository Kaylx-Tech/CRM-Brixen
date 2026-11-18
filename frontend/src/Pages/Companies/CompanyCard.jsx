import { useState } from 'react'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { IconAlertTriangle, IconArrowRight, IconBuildingSkyscraper, IconCalendarDue, IconDotsVertical, IconFileText, IconShieldCheck } from '@tabler/icons-react'
import { cn } from 'cn'
import ViewCompany from './ViewCompany'
import { needsAttention, attentionSummary } from './attention'

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
        late ? 'border-destructive/30 bg-destructive/10 text-destructive'
          : soon ? 'border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-400'
            : 'border-border bg-muted/40 text-muted-foreground'
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

const CompanyCard = ({ company, isSelected, onToggleSelect, onDelete, onRefresh }) => {
  const [isViewModalOpen, setIsViewModalOpen] = useState(false)

  const name = company?.name || 'Unnamed Company'
  const number = company?.number || '#00000000'
  const director = company?.director || 'Director'
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
          isSelected ? 'ring-2 ring-primary bg-accent/20' : hasAttention ? 'ring-destructive/35 hover:ring-destructive/60' : 'ring-primary/20 hover:ring-primary/45'
        )}
      >
        {/* A thin band in the theme colour along the top (red when the company needs attention) */}
        <span aria-hidden className={cn('absolute inset-x-0 top-0 h-1', hasAttention ? 'bg-destructive' : 'bg-primary')} />

        <div className="flex items-start gap-3 px-4">
          <button
            type="button"
            onClick={() => setIsViewModalOpen(true)}
            aria-label={`Open ${name}`}
            className={cn(
              'flex size-11 shrink-0 items-center justify-center rounded-xl ring-1 ring-inset transition-colors',
              hasAttention ? 'bg-destructive/10 text-destructive ring-destructive/20' : 'bg-primary/10 text-primary ring-primary/15 group-hover/company:bg-primary/15'
            )}
          >
            <IconBuildingSkyscraper className="size-5" />
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
            <span className="font-medium">{director}</span>
          </p>
          <p className="truncate text-muted-foreground" title={address}>{address}</p>
        </div>

        <div className="flex flex-wrap items-center gap-1.5 px-4">
          <DueChip icon={IconCalendarDue} label="CS Due" date={raw.confirmation_next_due} overdue={Boolean(raw.confirmation_overdue)} />
          <DueChip icon={IconFileText} label="Accounts" date={raw.accounts_next_due} overdue={Boolean(raw.accounts_overdue)} />
        </div>

        {hasAttention && (
          <p className="mx-4 flex items-start gap-1.5 rounded-lg bg-destructive/10 px-2.5 py-1.5 text-[11px] font-medium text-destructive">
            <IconAlertTriangle className="mt-px size-3.5 shrink-0" />
            <span className="line-clamp-2">{attentionSummary(company)}</span>
          </p>
        )}

        <div className="mt-auto border-t px-4 pt-2.5">
          <button
            type="button"
            onClick={() => setIsViewModalOpen(true)}
            className="flex w-full items-center justify-between text-xs font-semibold text-primary"
          >
            View Details
            <IconArrowRight className="size-4 transition-transform group-hover/company:translate-x-0.5" />
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
