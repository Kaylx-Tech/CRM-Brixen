import { useEffect, useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Checkbox } from '@/components/ui/checkbox'
import { Badge } from '@/components/ui/badge'
import { IconUpload, IconTrash, IconWand, IconRestore, IconCheck } from '@tabler/icons-react'
import { toast } from 'sonner'
import { extractPalette, prepareBrandImage, previewAccent, textOn, usableAccent } from '@/lib/branding'

// Finstap's own violet: what the app uses while no accent colour is saved
const FINSTAP_ACCENT = '#6559ff'

const IMAGE_SLOTS = [
  {
    key: 'brand_logo',
    title: 'Logo',
    hint: 'Your main logo, for light backgrounds. PNG with a transparent background or SVG works best.',
    maxSize: 600,
    dark: false,
  },
  {
    key: 'brand_logo_dark',
    title: 'Logo for dark backgrounds',
    hint: 'Optional: a white or light version for the dark sidebar. Without it, your logo sits on a white chip.',
    maxSize: 600,
    dark: true,
  },
  {
    key: 'brand_icon',
    title: 'Icon',
    hint: 'Square icon for the browser tab (64 × 64 px or bigger). PNG, SVG or ICO.',
    maxSize: 256,
    dark: false,
  },
]

function Section({ title, description, children }) {
  return (
    <div className="rounded-md border bg-card p-4 space-y-4">
      <div>
        <h3 className="text-sm font-semibold">{title}</h3>
        {description ? <p className="text-sm text-muted-foreground mt-1">{description}</p> : null}
      </div>
      {children}
    </div>
  )
}

function ImageSlot({ slot, value, disabled, onPick, onRemove }) {
  const inputRef = useRef(null)
  return (
    <div className="flex flex-col gap-3 rounded-md border p-3">
      <div>
        <p className="text-sm font-medium m-0">{slot.title}</p>
        <p className="text-[11px] text-muted-foreground m-0 mt-0.5">{slot.hint}</p>
      </div>
      <div
        className={`flex h-28 items-center justify-center rounded-md border border-dashed p-3 ${
          // Each logo on the background it is made for, in light and dark mode alike
          slot.dark ? 'bg-[#120f2e]' : 'bg-white'
        }`}
      >
        {value ? (
          <img src={value} alt={slot.title} className="max-h-full max-w-full object-contain" />
        ) : (
          <span className={`text-xs ${slot.dark ? 'text-white/50' : 'text-neutral-400'}`}>No image yet</span>
        )}
      </div>
      <div className="flex gap-2">
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
        <Button type="button" variant="outline" size="sm" disabled={disabled} onClick={() => inputRef.current?.click()}>
          <IconUpload className="mr-1.5 h-3.5 w-3.5" />
          {value ? 'Replace' : 'Upload'}
        </Button>
        {value ? (
          <Button type="button" variant="ghost" size="sm" disabled={disabled} onClick={onRemove}>
            <IconTrash className="mr-1.5 h-3.5 w-3.5" />
            Remove
          </Button>
        ) : null}
      </div>
    </div>
  )
}

/**
 * Settings → Branding (Finstap only): the company's logos and icon, and its accent colour, which is
 * picked from the logo automatically unless the admin chooses one. Changes are saved with the page's
 * Save Settings button; the colour is previewed on the page straight away.
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
    const src = form.brand_logo || form.brand_icon
    if (on && src) await pickFromLogo(src)
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

  return (
    <div className="space-y-4">
      <Section title="Logo & icon" description="Shown in the sidebar, on your company's login page and in the browser tab.">
        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          {IMAGE_SLOTS.map((slot) => (
            <ImageSlot
              key={slot.key}
              slot={slot}
              value={form[slot.key]}
              disabled={disabled || !!busy}
              onPick={(file) => handlePick(slot, file)}
              onRemove={() => setField(slot.key, '')}
            />
          ))}
        </div>
      </Section>

      <Section
        title="Accent colour"
        description="Used for buttons, links, the active page in the sidebar and highlights."
      >
        <div className="flex items-start gap-2">
          <Checkbox
            id="accent_auto"
            checked={!!form.accent_auto}
            onCheckedChange={(v) => toggleAuto(!!v)}
            disabled={disabled}
          />
          <div className="grid gap-0.5">
            <Label htmlFor="accent_auto" className="text-sm">Pick it from my logo automatically</Label>
            <p className="text-[11px] text-muted-foreground m-0">
              Uploading a new logo sets the accent to the logo&apos;s main colour.
            </p>
          </div>
        </div>

        {palette.length > 0 && (
          <div className="grid gap-1.5">
            <Label className="text-sm">Colours in your logo</Label>
            <div className="flex flex-wrap gap-2">
              {palette.map((c) => {
                const value = usableAccent(c)
                const active = value.toLowerCase() === accent.toLowerCase()
                return (
                  <button
                    key={c}
                    type="button"
                    title={value}
                    disabled={disabled}
                    onClick={() => chooseColour(value)}
                    className="flex size-9 items-center justify-center rounded-md border shadow-xs transition-transform hover:scale-105 disabled:opacity-50"
                    style={{ background: value, color: textOn(value) }}
                  >
                    {active ? <IconCheck className="h-4 w-4" /> : null}
                  </button>
                )
              })}
            </div>
          </div>
        )}

        <div className="flex flex-wrap items-end gap-3">
          <div className="grid gap-1.5">
            <Label htmlFor="accent_color" className="text-sm">Accent colour</Label>
            <div className="flex items-center gap-2">
              <input
                type="color"
                aria-label="Choose accent colour"
                value={shown}
                disabled={disabled}
                onChange={(e) => chooseColour(e.target.value)}
                className="h-8 w-10 cursor-pointer rounded-md border bg-transparent p-0.5"
              />
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
                className="w-28 font-mono"
              />
            </div>
          </div>
          {(form.brand_logo || form.brand_icon) && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={disabled}
              onClick={() => {
                setField('accent_auto', true)
                pickFromLogo(form.brand_logo || form.brand_icon)
              }}
            >
              <IconWand className="mr-1.5 h-3.5 w-3.5" />
              Pick from logo
            </Button>
          )}
          {accent && (
            <Button type="button" variant="ghost" size="sm" disabled={disabled} onClick={() => setField('accent_color', '')}>
              <IconRestore className="mr-1.5 h-3.5 w-3.5" />
              Use Finstap colour
            </Button>
          )}
        </div>

        <div className="rounded-md border bg-muted/30 p-4">
          <p className="text-[11px] uppercase tracking-wide text-muted-foreground m-0 mb-3">Preview</p>
          <div className="flex flex-wrap items-center gap-3">
            <Button type="button">Primary button</Button>
            <Button type="button" variant="outline">Outline</Button>
            <Badge>Badge</Badge>
            <span className="text-sm font-medium text-primary">A link in your colour</span>
            <span className="inline-flex items-center gap-2 rounded-md bg-[#120f2e] px-3 py-1.5 text-sm text-white">
              <span className="size-2 rounded-full" style={{ background: shown }} />
              <span className="rounded px-2 py-0.5" style={{ background: shown, color: textOn(shown) }}>Active page</span>
            </span>
          </div>
          {!accent && (
            <p className="text-[11px] text-muted-foreground m-0 mt-3">No accent saved yet: Finstap&apos;s violet is used.</p>
          )}
        </div>
      </Section>
    </div>
  )
}
