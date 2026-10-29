import { useCallback, useEffect, useMemo, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  IconCheck,
  IconCopy,
  IconDownload,
  IconExternalLink,
  IconFileText,
  IconGift,
  IconMapPin,
  IconSparkles,
  IconId,
  IconLink,
  IconLoader2,
  IconPencil,
  IconPlus,
  IconSearch,
  IconTrash,
} from '@tabler/icons-react'
import { toast } from 'sonner'
import { useSearchParams } from 'react-router-dom'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { IS_FINSTAP } from '@/lib/workspace'
import { isManagerOrAbove } from '@/lib/permissions'
import Tasks from '@/Pages/Tasks/Tasks'
import IdVerification from './IdVerification'
import RegisteredOffice from './RegisteredOffice'
import DeleteConfirmation from '@/components/DeleteConfirmation'
import { m, spring } from '@/lib/motion'
import { apiRequest } from '@/lib/api'
import { isPlanLocked } from '@/lib/planLock'
import PlanLocked from '@/components/PlanLocked'
import { useRefreshOnReturn } from "@/lib/useRefreshOnReturn"

// Each company / provider gets its own colour, in a fixed order
const GROUP_TONES = [
  { chip: 'bg-blue-500/15 text-blue-600 dark:text-blue-400', bar: 'from-blue-500/12' },
  { chip: 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400', bar: 'from-emerald-500/12' },
  { chip: 'bg-violet-500/15 text-violet-600 dark:text-violet-400', bar: 'from-violet-500/12' },
  { chip: 'bg-orange-500/15 text-orange-600 dark:text-orange-400', bar: 'from-orange-500/12' },
  { chip: 'bg-teal-500/15 text-teal-600 dark:text-teal-400', bar: 'from-teal-500/12' },
  { chip: 'bg-rose-500/15 text-rose-600 dark:text-rose-400', bar: 'from-rose-500/12' },
  { chip: 'bg-amber-500/15 text-amber-600 dark:text-amber-400', bar: 'from-amber-500/14' },
  { chip: 'bg-sky-500/15 text-sky-600 dark:text-sky-400', bar: 'from-sky-500/12' },
]

const EMPTY_FORM = { category: '', title: '', url: '', note: '' }

function hostOf(url) {
  try {
    return new URL(url).hostname.replace(/^www\./, '')
  } catch {
    return url
  }
}

// Finstap: the partner (affiliate) links are "Partner Perks": signing up through them helps Finstap, and Finstap
// helps the workspace set the service up for free
const PERK_OFFER = 'Free setup help from Finstap'

function PerksBanner() {
  return (
    <m.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={spring}
      className="fs-perks-banner relative overflow-hidden rounded-2xl border border-primary/25 bg-linear-to-r from-primary/15 via-primary/5 to-card p-4"
    >
      <div className="flex items-start gap-3">
        <span className="fs-perks-gift flex size-10 shrink-0 items-center justify-center rounded-xl bg-primary text-primary-foreground shadow-sm">
          <IconGift className="size-5" />
        </span>
        <div className="min-w-0">
          <p className="font-semibold">Perks from our partners, set up free by Finstap</p>
          <p className="mt-0.5 text-sm text-muted-foreground">
            Open a business account, send money abroad or buy a domain through these partner links, and the Finstap
            team helps you and your clients get started at no cost.
          </p>
        </div>
      </div>
    </m.div>
  )
}

function LinkRow({ link, canManage, onEdit, onDelete }) {
  const [copied, setCopied] = useState(false)
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(link.url)
      setCopied(true)
      toast.success('Link copied')
      setTimeout(() => setCopied(false), 1500)
    } catch {
      toast.error('Could not copy the link')
    }
  }
  return (
    <div className="group flex flex-wrap items-start gap-x-3 gap-y-2 rounded-xl border bg-background/60 p-3 transition-colors hover:border-primary/30">
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-semibold" title={link.title}>{link.title}</p>
        <a
          href={link.url}
          target="_blank"
          rel="noopener noreferrer"
          className="block truncate text-xs text-primary hover:underline"
          title={link.url}
        >
          {hostOf(link.url)}
        </a>
        {!IS_FINSTAP && link.note ? (
          <p className="mt-1 text-xs text-muted-foreground whitespace-pre-line line-clamp-3">{link.note}</p>
        ) : null}
      </div>
      <div className="flex shrink-0 items-center gap-1">
        <Button variant="outline" size="xs" className="h-7 gap-1" onClick={copy} title="Copy link">
          {copied ? <IconCheck className="size-3.5 text-emerald-600" /> : <IconCopy className="size-3.5" />}
          Copy
        </Button>
        <Button
          variant="outline"
          size="xs"
          className="h-7"
          title="Open link"
          nativeButton={false}
          render={<a href={link.url} target="_blank" rel="noopener noreferrer" />}
        >
          <IconExternalLink className="size-3.5" />
        </Button>
        {canManage && (
          <>
            <Button variant="ghost" size="xs" className="h-7 w-7 p-0 text-muted-foreground" onClick={() => onEdit(link)} title="Edit">
              <IconPencil className="size-3.5" />
            </Button>
            <Button variant="ghost" size="xs" className="h-7 w-7 p-0 text-muted-foreground hover:text-destructive" onClick={() => onDelete(link)} title="Remove">
              <IconTrash className="size-3.5" />
            </Button>
          </>
        )}
      </div>
      {IS_FINSTAP && (
        // Partner Perks: the note is the offer; without one, the help Finstap gives with every partner
        <p className="flex basis-full items-start gap-1 rounded-md bg-primary/10 px-2 py-1 text-xs font-medium text-primary">
          <IconSparkles className="mt-px size-3.5 shrink-0" />
          <span className="min-w-0 whitespace-pre-line line-clamp-3">{link.note || PERK_OFFER}</span>
        </p>
      )}
    </div>
  )
}

export default function SmartOperations() {
  // ID Verification (KYC orders) is the first, default tab; ?tab=links opens the links and
  // ?tab=gov-forms GOV Forms (Finstap, the team's tasks)
  const [searchParams, setSearchParams] = useSearchParams()
  // Finstap: admins and managers can also ask Finstap for a registered office
  const canOrderServices = IS_FINSTAP && isManagerOrAbove()
  const tabs = IS_FINSTAP ? ['links', 'gov-forms', ...(canOrderServices ? ['registered-office'] : [])] : ['links']
  const tab = tabs.includes(searchParams.get('tab')) ? searchParams.get('tab') : 'id-verification'
  const govForms = tab === 'gov-forms'
  const linksTab = tab === 'links'
  const setTab = (value) => setSearchParams(value === 'id-verification' ? {} : { tab: value }, { replace: true })
  const [links, setLinks] = useState([])
  const [categories, setCategories] = useState([])
  const [canManage, setCanManage] = useState(false)
  const [isLoading, setIsLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [editing, setEditing] = useState(null) // null = closed, {} = new, link = edit
  const [form, setForm] = useState(EMPTY_FORM)
  const [isSaving, setIsSaving] = useState(false)
  const [toDelete, setToDelete] = useState(null)
  const [isDeleting, setIsDeleting] = useState(false)
  const [planLock, setPlanLock] = useState('')

  const load = useCallback(async () => {
    setIsLoading(true)
    try {
      const res = await apiRequest('/admin/smart-links', { label: 'Smart Operations', silent: true })
      // Finstap Starter: Partner Perks and GOV Forms are in Pro (ID Verification and Registered Office are not)
      if (isPlanLocked(res)) {
        setPlanLock(res.reason || 'This is part of the Pro plan.')
        return
      }
      if (!res.ok) {
        toast.error(res.reason || 'Links failed to load')
        return
      }
      setPlanLock('')
      const d = res.data?.data || {}
      setLinks(d.links || [])
      setCategories(d.categories || [])
      setCanManage(!!d.can_manage)
    } finally {
      setIsLoading(false)
    }
  }, [])
  useRefreshOnReturn(load)

  useEffect(() => {
    load()
  }, [load])

  // Links grouped by company / provider, filtered by the search box
  const groups = useMemo(() => {
    const q = search.trim().toLowerCase()
    const shown = q
      ? links.filter((l) => [l.category, l.title, l.url, l.note].some((v) => String(v || '').toLowerCase().includes(q)))
      : links
    const map = new Map()
    for (const l of shown) {
      if (!map.has(l.category)) map.set(l.category, [])
      map.get(l.category).push(l)
    }
    return [...map.entries()]
  }, [links, search])

  const toneFor = (category) => {
    const i = categories.findIndex((c) => c === category)
    return GROUP_TONES[(i < 0 ? 0 : i) % GROUP_TONES.length]
  }

  const openNew = (category = '') => {
    setForm({ ...EMPTY_FORM, category })
    setEditing({})
  }
  const openEdit = (link) => {
    setForm({ category: link.category, title: link.title, url: link.url, note: link.note || '' })
    setEditing(link)
  }

  const save = async () => {
    if (!form.category.trim() || !form.title.trim() || !form.url.trim()) {
      toast.error('Company, name and link are required')
      return
    }
    setIsSaving(true)
    try {
      const isNew = !editing?.id
      const res = await apiRequest(isNew ? '/admin/smart-links' : `/admin/smart-links/${editing.id}`, {
        method: isNew ? 'POST' : 'PUT',
        body: form,
        label: 'Save link',
        silent: true,
      })
      if (!res.ok) {
        toast.error(res.reason || 'Could not save the link')
        return
      }
      toast.success(isNew ? 'Link added' : 'Link updated')
      setEditing(null)
      load()
    } finally {
      setIsSaving(false)
    }
  }

  // The default partner and referral links (new workspaces start with them); skips ones already here
  const [isImporting, setIsImporting] = useState(false)
  const importDefaults = async () => {
    setIsImporting(true)
    try {
      const res = await apiRequest('/admin/smart-links/import-starter', { method: 'POST', label: 'Add default links', silent: true })
      if (!res.ok) {
        toast.error(res.reason || 'Could not add the default links')
        return
      }
      toast.success(res.data?.message || 'Default links added')
      load()
    } finally {
      setIsImporting(false)
    }
  }

  const confirmDelete = async () => {
    if (!toDelete) return
    setIsDeleting(true)
    try {
      const res = await apiRequest(`/admin/smart-links/${toDelete.id}`, { method: 'DELETE', label: 'Remove link', silent: true })
      if (!res.ok) {
        toast.error(res.reason || 'Could not remove the link')
        return
      }
      toast.success('Link removed')
      setToDelete(null)
      load()
    } finally {
      setIsDeleting(false)
    }
  }

  return (
    <div className="flex w-full flex-col gap-4 pb-10">
      <div className="flex flex-col justify-between gap-3 md:flex-row md:items-center">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Smart Operations</h2>
          {linksTab && (
            <p className="mt-0.5 text-sm text-muted-foreground">
              {IS_FINSTAP
                ? 'Trusted partner services for you and your clients, with free setup help from Finstap.'
                : 'Quick links for the team: partner portals, referral links and forms, grouped by company.'}
            </p>
          )}
          {tab === 'id-verification' && (
            <p className="mt-0.5 text-sm text-muted-foreground">
              Every order with a KYC product, for verifying the client's identity.
              {IS_FINSTAP && ' Each ID check runs on Finstap and is billed to your workspace monthly.'}
            </p>
          )}
          {tab === 'registered-office' && (
            <p className="mt-0.5 text-sm text-muted-foreground">
              Finstap's office address for your clients' companies, confirmed by Finstap.
            </p>
          )}
        </div>
        <div className={`flex items-center gap-2 ${linksTab ? '' : 'hidden'}`}>
          {canManage && (
            <>
              <Button variant="outline" onClick={importDefaults} disabled={isImporting}>
                {isImporting ? <IconLoader2 className="h-4 w-4 animate-spin" /> : <IconDownload className="h-4 w-4" />}
                Add default links
              </Button>
              <Button onClick={() => openNew()}>
                <IconPlus className="h-4 w-4" />
                Add link
              </Button>
            </>
          )}
        </div>
      </div>

      {/* KYC orders first, then the links, then (Finstap) the team's tasks as GOV Forms */}
      <Tabs value={tab} onValueChange={setTab}>
        <TabsList>
          <TabsTrigger value="id-verification">
            <IconId className="size-4" />
            ID Verification
          </TabsTrigger>
          <TabsTrigger value="links">
            {IS_FINSTAP ? <IconGift className="size-4" /> : <IconLink className="size-4" />}
            {IS_FINSTAP ? 'Partner Perks' : 'Links'}
          </TabsTrigger>
          {IS_FINSTAP && (
            <TabsTrigger value="gov-forms">
              <IconFileText className="size-4" />
              GOV Forms
            </TabsTrigger>
          )}
          {canOrderServices && (
            <TabsTrigger value="registered-office">
              <IconMapPin className="size-4" />
              Registered Office
            </TabsTrigger>
          )}
        </TabsList>
      </Tabs>

      {tab === 'id-verification' ? (
        <IdVerification />
      ) : tab === 'registered-office' ? (
        <RegisteredOffice />
      ) : planLock ? (
        <PlanLocked message={planLock} />
      ) : govForms ? (
        <Tasks view="gov-forms" />
      ) : (
      <>
      {IS_FINSTAP && <PerksBanner />}
      <div className="relative w-full md:max-w-sm">
        <IconSearch className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input className="pl-9" placeholder="Search company, link or note…" value={search} onChange={(e) => setSearch(e.target.value)} />
      </div>

      {isLoading && links.length === 0 ? (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-48 w-full rounded-xl" />)}
        </div>
      ) : groups.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-xl border border-dashed bg-card/40 px-4 py-16 text-center">
          <div className="mb-3 flex h-14 w-14 items-center justify-center rounded-full bg-primary/10 text-primary">
            <IconLink className="h-6 w-6" />
          </div>
          <h3 className="text-lg font-semibold">{search.trim() ? 'No links found' : 'No links yet'}</h3>
          <p className="mt-1 max-w-sm text-sm text-muted-foreground">
            {search.trim()
              ? 'Try another company name or word.'
              : canManage
                ? 'Add the companies you work with (Tide, TapTap, Wise …) and their portal and referral links.'
                : 'An admin or manager can add the team links here.'}
          </p>
          {canManage && !search.trim() && (
            <div className="mt-4 flex flex-wrap justify-center gap-2">
              <Button variant="outline" onClick={importDefaults} disabled={isImporting}>
                {isImporting ? <IconLoader2 className="h-4 w-4 animate-spin" /> : <IconDownload className="h-4 w-4" />}
                Add default links
              </Button>
              <Button onClick={() => openNew()}>
                <IconPlus className="h-4 w-4" />
                Add the first link
              </Button>
            </div>
          )}
        </div>
      ) : (
        // Masonry: each company card drops into the shortest column, so no gaps open under short cards
        <div className="columns-1 gap-3 md:columns-2 xl:columns-3">
          {groups.map(([category, items], i) => {
            const tone = toneFor(category)
            return (
              <m.div
                key={category}
                className="mb-3 break-inside-avoid"
                initial={i < 9 ? { opacity: 0, y: 14, scale: 0.985 } : false}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                transition={{ ...spring, delay: Math.min(i, 9) * 0.04 }}
              >
                <Card size="sm" className={`bg-linear-to-br ${tone.bar} via-card to-card`}>
                  <CardHeader className="flex flex-row items-center justify-between gap-2">
                    <CardTitle className="flex min-w-0 items-center gap-2">
                      <span className={`flex size-8 shrink-0 items-center justify-center rounded-lg text-sm font-bold ${tone.chip}`}>
                        {category.slice(0, 1).toUpperCase()}
                      </span>
                      <span className="truncate">{category}</span>
                      <span className="text-xs font-normal text-muted-foreground">{items.length}</span>
                    </CardTitle>
                    {canManage && (
                      <Button variant="ghost" size="xs" className="h-7 gap-1 text-muted-foreground" onClick={() => openNew(category)}>
                        <IconPlus className="size-3.5" />
                        Add
                      </Button>
                    )}
                  </CardHeader>
                  <CardContent className="space-y-2">
                    {items.map((link) => (
                      <LinkRow key={link.id} link={link} canManage={canManage} onEdit={openEdit} onDelete={setToDelete} />
                    ))}
                  </CardContent>
                </Card>
              </m.div>
            )
          })}
        </div>
      )}
      </>
      )}

      {/* Add / edit a link */}
      <Dialog open={!!editing} onOpenChange={(open) => !open && setEditing(null)}>
        <DialogContent className="sm:max-w-[480px]">
          <DialogHeader>
            <DialogTitle>{editing?.id ? 'Edit link' : 'Add link'}</DialogTitle>
            <DialogDescription>Links are shared with the whole team.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="sl-category">Company / provider *</Label>
              <Input
                id="sl-category"
                list="sl-categories"
                placeholder="e.g. Tide"
                value={form.category}
                onChange={(e) => setForm((p) => ({ ...p, category: e.target.value }))}
              />
              <datalist id="sl-categories">
                {categories.map((c) => <option key={c} value={c} />)}
              </datalist>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="sl-title">Name *</Label>
              <Input
                id="sl-title"
                placeholder="e.g. Referral link, Partner portal"
                value={form.title}
                onChange={(e) => setForm((p) => ({ ...p, title: e.target.value }))}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="sl-url">Link *</Label>
              <Input
                id="sl-url"
                placeholder="https://"
                value={form.url}
                onChange={(e) => setForm((p) => ({ ...p, url: e.target.value }))}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="sl-note">{IS_FINSTAP ? 'Offer' : 'Note'}</Label>
              <Textarea
                id="sl-note"
                rows={3}
                placeholder={IS_FINSTAP ? `The partner's offer, e.g. a sign-up bonus (empty: "${PERK_OFFER}")` : 'When to use it, referral code, who to contact…'}
                value={form.note}
                onChange={(e) => setForm((p) => ({ ...p, note: e.target.value }))}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditing(null)} disabled={isSaving}>Cancel</Button>
            <Button onClick={save} disabled={isSaving}>
              {isSaving ? <IconLoader2 className="h-4 w-4 animate-spin" /> : <IconCheck className="h-4 w-4" />}
              {editing?.id ? 'Save' : 'Add link'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <DeleteConfirmation
        isOpen={!!toDelete}
        onClose={() => setToDelete(null)}
        onConfirm={confirmDelete}
        isLoading={isDeleting}
        title="Remove link"
        description={toDelete ? `Remove "${toDelete.title}" (${toDelete.category}) for the whole team?` : ''}
        confirmText={isDeleting ? 'Removing…' : 'Remove'}
      />
    </div>
  )
}
