import { useEffect, useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import {
  IconCloudUpload,
  IconTrash,
  IconRefresh,
  IconWand,
  IconRestore,
  IconCheck,
  IconPhoto,
  IconPalette,
  IconSparkles,
  IconLoader2,
  IconLock,
  IconColorPicker,
} from '@tabler/icons-react'
import { toast } from 'sonner'
import finstapMark from '@/assets/finstap-mark.svg'
import finstapLogoLight from '@/assets/finstap-logo-light.svg'
import { menuColours, extractPalette, prepareBrandImage, previewAccent, textOn, usableAccent } from '@/lib/branding'
import { getWorkspace, workspaceHost } from '@/lib/workspace'

// Finstap's own violet: what the app uses while no accent colour is saved
const FINSTAP_ACCENT = '#6559ff'

// Hand-picked accents for companies whose logo has no colour (or who want a change)
const PRESETS = ['#6559ff', '#2563eb', '#0891b2', '#059669', '#ca8a04', '#ea580c', '#e11d48', '#9333ea', '#334155']

// Transparent images sit on a soft checkerboard, as in design tools
const CHECKER = {
  backgroundColor: '#ffffff',
  backgroundImage:
    'linear-gradient(45deg,#f1f1f4 25%,transparent 25%),linear-gradient(-45deg,#f1f1f4 25%,transparent 25%),linear-gradient(45deg,transparent 75%,#f1f1f4 75%),linear-gradient(-45deg,transparent 75%,#f1f1f4 75%)',
  backgroundSize: '16px 16px',
  backgroundPosition: '0 0,0 8px,8px -8px,-8px 0',
}

const IMAGE_SLOTS = [
  {
    key: 'brand_logo',
    title: 'Primary logo',
    hint: 'For light backgrounds. Transparent PNG or SVG.',
    size: 'About 600 × 160 px',
    maxSize: 600,
    dark: false,
  },
  {
    key: 'brand_logo_dark',
    title: 'Logo on dark',
    hint: 'White or light version for the menu. Optional.',
    size: 'Same size as the primary logo',
    maxSize: 600,
    dark: true,
  },
  {
    key: 'brand_icon',
    title: 'App icon',
    hint: 'Square mark for the browser tab.',
    size: '64 × 64 px or bigger',
    maxSize: 256,
    dark: false,
    square: true,
  },
]

function Panel({ icon: Icon, step, title, description, aside, children }) {
  return (
    <section className="rounded-xl border bg-card shadow-xs">
      <header className="flex items-start justify-between gap-3 border-b px-5 py-4">
        <div className="flex items-start gap-3">
          <span className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <Icon className="size-4" />
          </span>
          <div>
            <p className="m-0 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">Step {step}</p>
            <h3 className="m-0 text-sm font-semibold">{title}</h3>
            {description ? <p className="m-0 mt-0.5 text-sm text-muted-foreground">{description}</p> : null}
          </div>
        </div>
        {aside}
      </header>
      <div className="p-5">{children}</div>
    </section>
  )
}

function ImageSlot({ slot, value, disabled, busy, onPick, onRemove }) {
  const inputRef = useRef(null)
  const [dragging, setDragging] = useState(false)
  const open = () => !disabled && inputRef.current?.click()

  const drop = (e) => {
    e.preventDefault()
    setDragging(false)
    const file = e.dataTransfer?.files?.[0]
    if (file && !disabled) onPick(file)
  }

  return (
    <div className="flex flex-col gap-2">
      <div>
        <p className="m-0 text-sm font-medium">{slot.title}</p>
        <p className="m-0 text-[11px] text-muted-foreground">{slot.size}</p>
      </div>
      <div
        role="button"
        tabIndex={disabled ? -1 : 0}
        aria-label={`${value ? 'Replace' : 'Upload'} ${slot.title}`}
        onClick={open}
        onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && (e.preventDefault(), open())}
        onDragOver={(e) => {
          e.preventDefault()
          setDragging(true)
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={drop}
        style={slot.dark || !value ? undefined : CHECKER}
        className={`group relative flex h-36 cursor-pointer items-center justify-center overflow-hidden rounded-lg border-2 border-dashed p-4 outline-none transition-all focus-visible:ring-2 focus-visible:ring-ring ${
          slot.dark ? 'bg-sidebar' : value ? '' : 'bg-muted/30'
        } ${dragging ? 'scale-[1.01] border-primary bg-primary/5' : 'border-border hover:border-primary/60'} ${
          disabled ? 'cursor-not-allowed opacity-60' : ''
        }`}
      >
        {busy ? (
          <IconLoader2 className={`size-6 animate-spin ${slot.dark ? 'text-white/70' : 'text-muted-foreground'}`} />
        ) : value ? (
          <>
            <img
              src={value}
              alt={slot.title}
              className={`max-h-full max-w-full object-contain transition-transform duration-300 group-hover:scale-[1.03] ${
                slot.square ? 'size-16 rounded-xl' : ''
              }`}
            />
            <span className="pointer-events-none absolute inset-x-0 bottom-0 flex justify-center bg-linear-to-t from-black/55 to-transparent pb-2 pt-6 text-xs font-medium text-white opacity-0 transition-opacity group-hover:opacity-100">
              Click or drop to replace
            </span>
          </>
        ) : (
          <div className={`flex flex-col items-center gap-1.5 text-center ${slot.dark ? 'text-white/70' : 'text-muted-foreground'}`}>
            <span
              className={`flex size-10 items-center justify-center rounded-full transition-colors ${
                slot.dark ? 'bg-white/10' : 'bg-background shadow-xs group-hover:text-primary'
              }`}
            >
              <IconCloudUpload className="size-5" />
            </span>
            <span className="text-xs font-medium">
              <span className={slot.dark ? 'text-white' : 'text-primary'}>Click to upload</span> or drag and drop
            </span>
            <span className="text-[11px] opacity-80">PNG, SVG, JPG, WebP or ICO</span>
          </div>
        )}
      </div>
      <input
        ref={inputRef}
        type="file"
        accept="image/png,image/jpeg,image/webp,image/gif,image/svg+xml,image/x-icon,.ico"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0]
          e.target.value = ''
          if (file) onPick(file)
        }}
      />
      <div className="flex min-h-7 items-center justify-between gap-2">
        <p className="m-0 text-[11px] text-muted-foreground">{slot.hint}</p>
        {value ? (
          <div className="flex shrink-0 gap-1">
            <Button type="button" variant="ghost" size="icon-sm" title="Replace" disabled={disabled} onClick={open}>
              <IconRefresh className="size-3.5" />
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              title="Remove"
              disabled={disabled}
              onClick={onRemove}
              className="text-destructive hover:text-destructive"
            >
              <IconTrash className="size-3.5" />
            </Button>
          </div>
        ) : null}
      </div>
    </div>
  )
}

function Swatch({ colour, active, disabled, onClick, label }) {
  return (
    <button
      type="button"
      title={label || colour}
      aria-label={`Use ${label || colour}`}
      aria-pressed={active}
      disabled={disabled}
      onClick={onClick}
      className={`relative flex size-9 items-center justify-center rounded-full shadow-sm ring-offset-2 ring-offset-card transition-all hover:scale-110 disabled:opacity-50 ${
        active ? 'ring-2 ring-foreground/80' : 'ring-1 ring-black/10'
      }`}
      style={{ background: colour, color: textOn(colour) }}
    >
      {active ? <IconCheck className="size-4" /> : null}
    </button>
  )
}

/** The switch for "pick the colour from my logo". */
function AutoSwitch({ on, disabled, onChange }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      disabled={disabled}
      onClick={() => onChange(!on)}
      className={`relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors disabled:opacity-50 ${
        on ? 'bg-primary' : 'bg-input'
      }`}
    >
      <span
        className={`inline-block size-4 rounded-full bg-white shadow transition-transform ${on ? 'translate-x-4.5' : 'translate-x-0.5'}`}
      />
    </button>
  )
}

/** A small picture of the company's app: browser tab, menu, a card with buttons, in its colours. */
function LivePreview({ form, shown }) {
  const menu = menuColours(shown)
  const fg = textOn(shown)
  const name = form.brand_name || form.company_name || 'Your company'
  const icon = form.brand_icon || form.brand_logo || finstapMark
  const menuLogo = form.brand_logo_dark || form.brand_logo
  const host = workspaceHost(getWorkspace())

  return (
    <div className="overflow-hidden rounded-xl border bg-card shadow-lg">
      {/* Browser window with the tab icon and the company's address */}
      <div className="flex items-center gap-2 border-b bg-muted/60 px-3 pt-2">
        <div className="flex gap-1.5 pb-2">
          <span className="size-2.5 rounded-full bg-[#ff5f57]" />
          <span className="size-2.5 rounded-full bg-[#febc2e]" />
          <span className="size-2.5 rounded-full bg-[#28c840]" />
        </div>
        <div className="ml-2 flex min-w-0 max-w-[70%] items-center gap-1.5 rounded-t-md border border-b-0 bg-card px-2.5 py-1.5">
          <img src={icon} alt="" className="size-3.5 shrink-0 rounded-sm object-contain" />
          <span className="truncate text-[11px] font-medium">{name}</span>
        </div>
      </div>
      <div className="flex items-center gap-1.5 border-b bg-card px-3 py-1.5">
        <IconLock className="size-3 text-muted-foreground" />
        <span className="truncate text-[11px] text-muted-foreground">{host}/admin/dashboard</span>
      </div>

      {/* The app: menu in the accent's deep shade, page with accent buttons */}
      <div className="flex h-64">
        <div className="flex w-[38%] flex-col gap-1.5 p-3 transition-colors duration-300" style={{ background: menu.light }}>
          <div className="mb-2 flex h-7 items-center">
            {menuLogo ? (
              form.brand_logo_dark ? (
                <img src={menuLogo} alt="" className="max-h-6 max-w-full object-contain" />
              ) : (
                <span className="rounded bg-white px-1.5 py-1">
                  <img src={menuLogo} alt="" className="block max-h-4 max-w-full object-contain" />
                </span>
              )
            ) : (
              <img src={finstapLogoLight} alt="" className="max-h-5 max-w-full object-contain" />
            )}
          </div>
          {['Overview', 'Customers', 'Orders', 'Invoices', 'Documents'].map((item, i) => (
            <div
              key={item}
              className="flex items-center gap-1.5 rounded-md px-1.5 py-1 text-[10px] text-white transition-colors duration-300"
              style={i === 0 ? { background: menu.lightActive } : { color: 'rgba(255,255,255,0.65)' }}
            >
              <span className="size-1.5 rounded-full" style={{ background: i === 0 ? shown : 'rgba(255,255,255,0.35)' }} />
              {item}
            </div>
          ))}
        </div>
        <div className="flex flex-1 flex-col gap-2.5 bg-background p-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold">Dashboard</span>
            <span
              className="flex size-5 items-center justify-center rounded-full text-[8px] font-bold transition-colors duration-300"
              style={{ background: shown, color: fg }}
            >
              {name.slice(0, 2).toUpperCase()}
            </span>
          </div>
          <div className="grid grid-cols-2 gap-2">
            {['Sales', 'Orders'].map((label, i) => (
              <div key={label} className="rounded-md border bg-card p-2">
                <p className="m-0 text-[9px] text-muted-foreground">{label}</p>
                <p className="m-0 text-xs font-semibold">{i ? '128' : '£4,820'}</p>
                <div className="mt-1.5 h-1 rounded-full bg-muted">
                  <div className="h-1 rounded-full transition-colors duration-300" style={{ width: i ? '45%' : '70%', background: shown }} />
                </div>
              </div>
            ))}
          </div>
          <div className="rounded-md border bg-card p-2">
            <div className="mb-1.5 h-1.5 w-2/3 rounded bg-muted" />
            <div className="mb-2.5 h-1.5 w-1/2 rounded bg-muted" />
            <div className="flex items-center gap-1.5">
              <span className="rounded px-2 py-1 text-[9px] font-medium transition-colors duration-300" style={{ background: shown, color: fg }}>
                New order
              </span>
              <span className="rounded border px-2 py-1 text-[9px]">Export</span>
              <span className="ml-auto text-[9px] font-medium transition-colors duration-300" style={{ color: shown }}>
                View all →
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

/**
 * Settings → Branding (Finstap only): the company's logos and icon, and its accent colour, which is
 * picked from the logo automatically unless the admin chooses one. Changes are saved with the page's
 * Save Settings button; the colour is previewed on the page (and in the mockup) straight away.
 */
export default function BrandingTab({ form, setField, disabled }) {
  const [found, setFound] = useState({ src: '', colours: [] })
  const [busy, setBusy] = useState('')
  // What is typed in the hex box (null = show the current colour)
  const [hexDraft, setHexDraft] = useState(null)

  const accent = form.accent_color || ''
  const shown = accent || FINSTAP_ACCENT
  const logoSrc = form.brand_logo || form.brand_icon
  const palette = found.src === logoSrc ? found.colours : []

  // Colours of the current logo (for the swatches)
  useEffect(() => {
    if (!logoSrc) return undefined
    let cancelled = false
    extractPalette(logoSrc)
      .then((colours) => !cancelled && setFound({ src: logoSrc, colours }))
      .catch(() => !cancelled && setFound({ src: logoSrc, colours: [] }))
    return () => {
      cancelled = true
    }
  }, [logoSrc])

  // Live preview of the colour on this page; leaving Settings goes back to the saved one
  useEffect(() => {
    previewAccent(accent)
  }, [accent])
  useEffect(() => () => previewAccent(''), [])

  const pickFromLogo = async (src, { quiet = false } = {}) => {
    const colours = await extractPalette(src).catch(() => [])
    if (!colours.length) {
      if (!quiet) toast.info('No colour found in this logo (only black, white or grey). Choose an accent colour below.')
      return
    }
    setField('accent_color', usableAccent(colours[0]))
  }

  const handlePick = async (slot, file) => {
    setBusy(slot.key)
    try {
      const dataUrl = await prepareBrandImage(file, slot.maxSize)
      setField(slot.key, dataUrl)
      // The main logo (or the icon while there is no logo) sets the accent when it is on automatic
      const drivesColour = slot.key === 'brand_logo' || (slot.key === 'brand_icon' && !form.brand_logo)
      if (form.accent_auto && drivesColour) await pickFromLogo(dataUrl)
      toast.success(`${slot.title} ready. Click Save Settings to keep it.`)
    } catch (err) {
      toast.error(err?.message || 'Could not use this image.')
    } finally {
      setBusy('')
    }
  }

  const chooseColour = (hex) => {
    setField('accent_auto', false)
    setField('accent_color', hex.toLowerCase())
  }

  const toggleAuto = async (on) => {
    setField('accent_auto', on)
    if (on && logoSrc) await pickFromLogo(logoSrc)
  }

  const commitHex = () => {
    if (hexDraft === null) return
    const v = hexDraft.trim()
    setHexDraft(null)
    if (!v) return
    const hex = v.startsWith('#') ? v : `#${v}`
    if (/^#[0-9a-fA-F]{6}$/.test(hex)) chooseColour(hex)
    else toast.error('Enter a colour like #6559ff')
  }

  const isActive = (c) => c.toLowerCase() === shown.toLowerCase()

  return (
    <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_400px] lg:items-start">
      <div className="space-y-5">
        <Panel
          icon={IconPhoto}
          step={1}
          title="Logo & icon"
          description="Shown in the menu, on your company's login page and in the browser tab."
        >
          <div className="grid grid-cols-1 gap-5 md:grid-cols-3">
            {IMAGE_SLOTS.map((slot) => (
              <ImageSlot
                key={slot.key}
                slot={slot}
                value={form[slot.key]}
                busy={busy === slot.key}
                disabled={disabled || !!busy}
                onPick={(file) => handlePick(slot, file)}
                onRemove={() => setField(slot.key, '')}
              />
            ))}
          </div>
        </Panel>

        <Panel
          icon={IconPalette}
          step={2}
          title="Accent colour"
          description="Buttons, links and highlights use it; the menu takes a deep shade of it."
          aside={
            accent ? (
              <Button type="button" variant="ghost" size="sm" disabled={disabled} onClick={() => setField('accent_color', '')}>
                <IconRestore className="mr-1.5 size-3.5" />
                Reset
              </Button>
            ) : null
          }
        >
          <div className="space-y-5">
            {/* Current colour */}
            <div className="flex flex-wrap items-center gap-4 rounded-lg border bg-muted/30 p-3">
              <label
                className="relative size-14 shrink-0 cursor-pointer overflow-hidden rounded-xl shadow-md ring-1 ring-black/10 transition-transform hover:scale-105"
                style={{ background: shown }}
                title="Choose any colour"
              >
                <input
                  type="color"
                  aria-label="Choose accent colour"
                  value={shown}
                  disabled={disabled}
                  onChange={(e) => chooseColour(e.target.value)}
                  className="absolute inset-0 size-full cursor-pointer opacity-0"
                />
                <IconColorPicker className="absolute bottom-1 right-1 size-3.5" style={{ color: textOn(shown) }} />
              </label>
              <div className="grid gap-1">
                <span className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                  {accent ? (form.accent_auto ? 'From your logo' : 'Your colour') : 'Finstap default'}
                </span>
                <Input
                  id="accent_color"
                  value={hexDraft ?? accent}
                  placeholder={FINSTAP_ACCENT}
                  onChange={(e) => setHexDraft(e.target.value)}
                  onBlur={commitHex}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault()
                      commitHex()
                    }
                  }}
                  disabled={disabled}
                  className="h-8 w-32 font-mono uppercase"
                />
              </div>
              <div className="ml-auto flex items-center gap-3 rounded-lg border bg-card px-3 py-2">
                <IconSparkles className="size-4 text-primary" />
                <div className="grid">
                  <span className="text-sm font-medium">Match my logo</span>
                  <span className="text-[11px] text-muted-foreground">New logos set the colour</span>
                </div>
                <AutoSwitch on={!!form.accent_auto} disabled={disabled} onChange={toggleAuto} />
              </div>
            </div>

            {palette.length > 0 && (
              <div className="grid gap-2">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium">From your logo</span>
                  <Button
                    type="button"
                    variant="link"
                    size="sm"
                    className="h-auto p-0 text-xs"
                    disabled={disabled}
                    onClick={() => {
                      setField('accent_auto', true)
                      pickFromLogo(logoSrc)
                    }}
                  >
                    <IconWand className="mr-1 size-3.5" />
                    Pick the best one
                  </Button>
                </div>
                <div className="flex flex-wrap gap-2.5">
                  {palette.map((c) => {
                    const value = usableAccent(c)
                    return (
                      <Swatch key={c} colour={value} active={isActive(value)} disabled={disabled} onClick={() => chooseColour(value)} />
                    )
                  })}
                </div>
              </div>
            )}

            <div className="grid gap-2">
              <span className="text-sm font-medium">Curated colours</span>
              <div className="flex flex-wrap gap-2.5">
                {PRESETS.map((c) => (
                  <Swatch
                    key={c}
                    colour={c}
                    label={c === FINSTAP_ACCENT ? 'Finstap violet' : c}
                    active={isActive(c) && (c !== FINSTAP_ACCENT || !!accent)}
                    disabled={disabled}
                    onClick={() => chooseColour(c)}
                  />
                ))}
              </div>
            </div>
          </div>
        </Panel>
      </div>

      {/* Sticky live preview */}
      <aside className="space-y-3 lg:sticky lg:top-4">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="m-0 text-sm font-semibold">Live preview</h3>
            <p className="m-0 text-[11px] text-muted-foreground">How your team and clients will see it</p>
          </div>
          <Badge variant="secondary" className="gap-1">
            <span className="size-1.5 animate-pulse rounded-full" style={{ background: shown }} />
            Live
          </Badge>
        </div>
        <LivePreview form={form} shown={shown} />
        <p className="m-0 text-center text-[11px] text-muted-foreground">
          Changes apply to everyone in your workspace after <span className="font-medium text-foreground">Save Settings</span>.
        </p>
      </aside>
    </div>
  )
}
