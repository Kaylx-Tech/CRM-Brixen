import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { useParams } from "react-router-dom"
import {
  IconAlertTriangle,
  IconArrowLeft,
  IconBook2,
  IconCamera,
  IconCar,
  IconCircleCheck,
  IconFileText,
  IconId,
  IconLoader2,
  IconRefresh,
  IconShieldCheck,
  IconUpload,
} from "@tabler/icons-react"
import { cn } from "cn"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { getApiBase } from "@/lib/api"
import { useBranding } from "@/lib/branding"
import { maskDob } from "@/lib/date-of-birth"

/**
 * acme.finstap.com/verify/<code> — Finstap's own identity check, the link in the "Verify your identity" email.
 * No sign-in: the private code opens this one person's check. Step by step: the document (ID card, driving
 * licence or passport), its photos and the person's details, a live selfie, their address, and a proof of
 * address. Each photo is uploaded as soon as it is taken; the answers are sent at the end and the check then
 * goes to the KYC team.
 */

const STEPS = ["Document", "Details", "Selfie", "Address", "Proof of address"]
const TYPE_ICONS = { id_card: IconId, driving_licence: IconCar, passport: IconBook2 }
const NUMBER_LABEL = { id_card: "ID card number", driving_licence: "Licence number", passport: "Passport number" }
const SIDE_LABEL = { id_front: "Front", id_back: "Back" }
// Which step holds each answer, to go back to the first one the server did not accept
const FIELD_STEP = {
  id_type: 0,
  full_name: 1,
  date_of_birth: 1,
  id_number: 1,
  address_line1: 3,
  address_line2: 3,
  city: 3,
  region: 3,
  postal_code: 3,
  country: 3,
  poa_type: 4,
}
const EMPTY = {
  id_type: "",
  full_name: "",
  date_of_birth: "",
  id_number: "",
  address_line1: "",
  address_line2: "",
  city: "",
  region: "",
  postal_code: "",
  country: "",
  poa_type: "",
}

function draftKey(token) {
  return `kyc-form:${token.slice(-16)}`
}

function readDraft(token) {
  try {
    return JSON.parse(localStorage.getItem(draftKey(token)) || "null")
  } catch {
    return null
  }
}

function writeDraft(token, draft) {
  try {
    if (draft) localStorage.setItem(draftKey(token), JSON.stringify(draft))
    else localStorage.removeItem(draftKey(token))
  } catch {
    // Private mode: the answers are only kept on this page
  }
}

/** Phone photos are large: send them at most 2000 px wide as JPEG. PDFs (and anything the browser cannot
 * read) go as they are; the server checks the real type. */
async function shrink(file) {
  if (!file.type.startsWith("image/")) return file
  try {
    const bitmap = await createImageBitmap(file)
    const scale = Math.min(1, 2000 / Math.max(bitmap.width, bitmap.height))
    const canvas = document.createElement("canvas")
    canvas.width = Math.round(bitmap.width * scale)
    canvas.height = Math.round(bitmap.height * scale)
    canvas.getContext("2d").drawImage(bitmap, 0, 0, canvas.width, canvas.height)
    const blob = await new Promise((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.88))
    return blob || file
  } catch {
    return file
  }
}

function Field({ id, label, error, hint, children }) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>{label}</Label>
      {children}
      {hint && !error && <p className="text-xs text-muted-foreground">{hint}</p>}
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  )
}

const CAN_USE_CAMERA = typeof navigator !== "undefined" && Boolean(navigator.mediaDevices?.getUserMedia)

/**
 * A document photo: "Open camera" shows the back camera with a card-shaped guide, or "Upload" picks a photo
 * (or a PDF where `accept` allows it) from the phone. Shows the photo once added, with Retake / Change.
 */
function DocumentCamera({ label, done, preview, busy, onCapture, onFile, accept = "image/*" }) {
  const [open, setOpen] = useState(false)
  const inputRef = useRef(null)
  if (open) {
    return (
      <LiveCamera
        facing="environment"
        busy={busy}
        takeLabel={`Take photo: ${label.toLowerCase()}`}
        onCancel={() => setOpen(false)}
        onCapture={(blob) => onCapture(blob).then((ok) => ok && setOpen(false))}
      />
    )
  }
  return (
    <div
      className={cn(
        "relative flex aspect-[4/3] w-full flex-col items-center justify-center gap-3 overflow-hidden rounded-2xl border-2 border-dashed text-sm",
        done ? "border-emerald-500/60 bg-emerald-500/5" : "border-border",
      )}
    >
      {preview ? (
        <img src={preview} alt={label} className="absolute inset-0 h-full w-full object-cover" />
      ) : done ? (
        <IconCircleCheck className="size-8 text-emerald-600" />
      ) : (
        <IconCamera className="size-8 text-muted-foreground" />
      )}
      <span className={cn("relative z-10 rounded-full px-3 py-1 font-medium", preview && "bg-background/90 shadow-sm")}>
        {done ? `${label} added` : label}
      </span>
      <div className="relative z-10 flex flex-wrap justify-center gap-2">
        <Button
          type="button"
          size="sm"
          variant={done ? "outline" : "default"}
          className={cn(done && "bg-background shadow-sm")}
          disabled={busy}
          onClick={() => setOpen(true)}
        >
          {done ? <IconRefresh className="size-4" /> : <IconCamera className="size-4" />}
          {done ? "Retake" : "Open camera"}
        </Button>
        <Button
          type="button"
          size="sm"
          variant="outline"
          className="bg-background shadow-sm"
          disabled={busy}
          onClick={() => inputRef.current?.click()}
        >
          {busy ? <IconLoader2 className="size-4 animate-spin" /> : <IconUpload className="size-4" />}
          {busy ? "Uploading…" : done ? "Change" : "Upload"}
        </Button>
      </div>
      <input
        ref={inputRef}
        type="file"
        accept={accept}
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0]
          e.target.value = ""
          if (file) onFile(file)
        }}
      />
    </div>
  )
}

/**
 * The live camera: the front one for the selfie (round guide, mirrored like a mirror) or the back one for
 * documents (card guide). The photo is taken from the live picture, so nothing can be picked from the phone.
 */
function LiveCamera({ facing = "user", onCapture, onCancel, busy, takeLabel = "Take selfie" }) {
  const selfie = facing === "user"
  const videoRef = useRef(null)
  const [ready, setReady] = useState(false)
  const [error, setError] = useState(
    CAN_USE_CAMERA ? "" : "This browser cannot open the camera. Open the link on your phone in Chrome or Safari.",
  )

  useEffect(() => {
    if (!CAN_USE_CAMERA) return undefined
    let live = true
    let stream = null
    const size = selfie ? { width: { ideal: 1280 }, height: { ideal: 960 } } : { width: { ideal: 1920 }, height: { ideal: 1440 } }
    navigator.mediaDevices
      .getUserMedia({ video: { facingMode: { ideal: facing }, ...size }, audio: false })
      .then((s) => {
        stream = s
        if (!live) return s.getTracks().forEach((t) => t.stop())
        if (videoRef.current) videoRef.current.srcObject = s
        setReady(true)
      })
      .catch((err) =>
        live &&
        setError(
          err?.name === "NotAllowedError"
            ? "Allow the camera for this page (in the address bar or your browser settings), then try again."
            : "No camera was found. Open the link on your phone to take the photo.",
        ),
      )
    return () => {
      live = false
      stream?.getTracks().forEach((t) => t.stop())
    }
  }, [facing, selfie])

  const take = () => {
    const video = videoRef.current
    if (!video?.videoWidth) return
    const canvas = document.createElement("canvas")
    canvas.width = video.videoWidth
    canvas.height = video.videoHeight
    canvas.getContext("2d").drawImage(video, 0, 0)
    canvas.toBlob((blob) => blob && onCapture(blob), "image/jpeg", 0.9)
  }

  if (error) {
    return (
      <div className="space-y-3">
        <div className="flex gap-2 rounded-2xl border border-amber-500/40 bg-amber-500/5 p-4 text-sm text-amber-800 dark:text-amber-300">
          <IconAlertTriangle className="size-5 shrink-0" />
          {error}
        </div>
        {onCancel && (
          <Button type="button" variant="outline" className="w-full" onClick={onCancel}>
            Close
          </Button>
        )}
      </div>
    )
  }
  return (
    <div className="space-y-3">
      <div
        className={cn(
          "relative mx-auto w-full overflow-hidden rounded-3xl bg-black",
          selfie ? "aspect-[3/4] max-w-sm" : "aspect-[4/3]",
        )}
      >
        <video
          ref={videoRef}
          autoPlay
          playsInline
          muted
          className={cn("h-full w-full object-cover", selfie && "-scale-x-100")}
        />
        <div
          className={cn(
            "pointer-events-none absolute border-4 border-white/70",
            selfie ? "inset-[12%] rounded-[50%]" : "inset-x-[8%] inset-y-[14%] rounded-xl",
          )}
        />
        {!ready && (
          <div className="absolute inset-0 flex items-center justify-center text-sm text-white/80">
            <IconLoader2 className="mr-2 size-5 animate-spin" /> Opening the camera…
          </div>
        )}
      </div>
      {!selfie && (
        <p className="text-center text-xs text-muted-foreground">Fit the whole document inside the frame, then take the photo.</p>
      )}
      <div className="flex gap-2">
        {onCancel && (
          <Button type="button" variant="outline" className="h-11" onClick={onCancel} disabled={busy}>
            Cancel
          </Button>
        )}
        <Button type="button" className="h-11 flex-1" onClick={take} disabled={!ready || busy}>
          {busy ? <IconLoader2 className="size-4 animate-spin" /> : <IconCamera className="size-4" />}
          {busy ? "Uploading…" : takeLabel}
        </Button>
      </div>
    </div>
  )
}

export default function KycVerify() {
  const { token = "" } = useParams()
  const { logo } = useBranding()
  const workspace = token.includes(".") ? token.split(".")[0] : ""
  const base = `${getApiBase()}/kyc-form/${encodeURIComponent(token)}`
  const query = workspace ? `?workspace=${encodeURIComponent(workspace)}` : ""

  const [info, setInfo] = useState(null)
  const [loadError, setLoadError] = useState("")
  // A reload goes back to the step the person was on (their photos are already on the server)
  const [step, setStep] = useState(() => (readDraft(token)?.form?.id_type ? readDraft(token).step || 0 : 0))
  const [form, setForm] = useState(() => ({ ...EMPTY, ...(readDraft(token)?.form || {}) }))
  const [errors, setErrors] = useState({})
  const [uploading, setUploading] = useState("")
  const [previews, setPreviews] = useState({})
  const [sending, setSending] = useState(false)
  const [sent, setSent] = useState(false)
  const [notice, setNotice] = useState("")
  const [retake, setRetake] = useState(false)

  useEffect(() => {
    fetch(`${base}${query}`)
      .then(async (res) => {
        const json = await res.json().catch(() => ({}))
        if (!res.ok) throw new Error(json.error || "This link is not valid.")
        setInfo(json.data)
        if (!json.data.full_name) return
        setForm((f) => (f.full_name ? f : { ...f, full_name: json.data.full_name }))
      })
      .catch((err) => setLoadError(err.message || "The page could not be loaded. Please try again in a moment."))
  }, [base, query])

  useEffect(() => {
    if (!sent) writeDraft(token, { step, form })
  }, [token, step, form, sent])

  const uploaded = useMemo(() => new Set(info?.uploaded || []), [info])
  const idType = (info?.id_types || []).find((t) => t.value === form.id_type)
  const set = (key) => (e) => {
    const value = key === "date_of_birth" ? maskDob(e.target.value) : e.target.value
    setForm((f) => ({ ...f, [key]: value }))
    setErrors((er) => ({ ...er, [key]: "" }))
  }

  const upload = useCallback(
    async (kind, file) => {
      setUploading(kind)
      setNotice("")
      const blob = await shrink(file)
      const body = new FormData()
      body.append("kind", kind)
      body.append("file", blob, blob.type === "application/pdf" ? "document.pdf" : `${kind}.jpg`)
      try {
        const res = await fetch(`${base}/file${query}`, { method: "POST", body })
        const json = await res.json().catch(() => ({}))
        if (!res.ok) throw new Error(json.error || "The file could not be uploaded.")
        setInfo(json.data)
        if (blob.type.startsWith("image/")) {
          const url = URL.createObjectURL(blob)
          setPreviews((p) => {
            if (p[kind]) URL.revokeObjectURL(p[kind])
            return { ...p, [kind]: url }
          })
        }
        return true
      } catch (err) {
        setNotice(err.message || "The file could not be uploaded. Check your connection and try again.")
        return false
      } finally {
        setUploading("")
      }
    },
    [base, query],
  )

  // A photo from the live camera or a file picked on the phone: uploaded straight away, and the step's
  // message for it is cleared
  const attach = (kind, file) =>
    upload(kind, file).then((ok) => {
      if (ok) setErrors((e) => ({ ...e, [kind]: "" }))
      return ok
    })
  const capture = (kind, blob) => attach(kind, new File([blob], `${kind}.jpg`, { type: "image/jpeg" }))

  // What each step needs before Continue
  const missing = () => {
    const out = {}
    if (step === 0 && !form.id_type) out.id_type = "Choose your document."
    if (step === 1) {
      for (const side of idType?.sides || []) if (!uploaded.has(side)) out[side] = `Add the ${SIDE_LABEL[side].toLowerCase()} photo.`
      if (!form.full_name.trim()) out.full_name = "Enter your full name as shown on your document."
      if (!/^\d{2}\/\d{2}\/\d{4}$/.test(form.date_of_birth)) out.date_of_birth = "Enter your date of birth as DD/MM/YYYY."
      if (!form.id_number.trim()) out.id_number = "Enter your document number."
    }
    if (step === 2 && !uploaded.has("selfie")) out.selfie = "Take your selfie."
    if (step === 3) {
      for (const key of ["address_line1", "city", "region", "postal_code", "country"])
        if (!form[key].trim()) out[key] = "This is required."
    }
    if (step === 4) {
      if (!form.poa_type) out.poa_type = "Choose the kind of document."
      if (!uploaded.has("poa")) out.poa = "Upload your proof of address."
    }
    return out
  }

  const next = async () => {
    const out = missing()
    setErrors(out)
    if (Object.keys(out).length) return
    if (step < STEPS.length - 1) {
      setStep(step + 1)
      window.scrollTo({ top: 0, behavior: "smooth" })
      return
    }
    setSending(true)
    setNotice("")
    try {
      const res = await fetch(`${base}/submit${query}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) {
        const fields = json.fields || {}
        setErrors(fields)
        const first = Object.keys(fields).map((k) => FIELD_STEP[k]).filter((s) => s !== undefined)
        if (first.length) setStep(Math.min(...first))
        setNotice(json.error || "Your details could not be sent.")
        return
      }
      writeDraft(token, null)
      setSent(true)
    } catch {
      setNotice("Your details could not be sent. Check your connection and try again.")
    } finally {
      setSending(false)
    }
  }

  const header = (
    <header className="border-b bg-background/80 backdrop-blur-md">
      <div className="mx-auto flex max-w-xl items-center justify-between gap-3 px-4 py-3">
        {logo ? (
          <img src={logo} alt="" className="h-8 w-auto max-w-[160px] object-contain" />
        ) : (
          <span className="text-sm font-semibold">{info?.workspace || "Identity check"}</span>
        )}
        <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
          <IconShieldCheck className="size-4" /> Secure
        </span>
      </div>
    </header>
  )

  const shell = (children) => (
    <div className="min-h-svh bg-muted/40">
      {header}
      <main className="mx-auto max-w-xl px-4 py-6 sm:py-10">{children}</main>
    </div>
  )

  if (loadError) {
    return shell(
      <div className="rounded-2xl border bg-background p-6 text-center">
        <IconAlertTriangle className="mx-auto size-10 text-amber-500" />
        <h1 className="mt-3 text-lg font-semibold">This link cannot be used</h1>
        <p className="mt-1 text-sm text-muted-foreground">{loadError}</p>
      </div>,
    )
  }
  if (!info) {
    return shell(
      <div className="flex justify-center py-16 text-muted-foreground">
        <IconLoader2 className="size-6 animate-spin" />
      </div>,
    )
  }
  if (sent || info.step !== "open") {
    const approved = info.step === "approved"
    return shell(
      <div className="rounded-2xl border bg-background p-6 text-center sm:p-10">
        <IconCircleCheck className="mx-auto size-14 text-emerald-600" />
        <h1 className="mt-4 text-xl font-semibold">{approved ? "Your identity is verified" : "Thank you!"}</h1>
        <p className="mx-auto mt-2 max-w-sm text-sm text-muted-foreground">
          {approved
            ? "There is nothing else you need to do."
            : "Your documents have been sent securely. Our team will check them and email you once your identity is verified. You can close this page."}
        </p>
      </div>,
    )
  }

  const err = (key) => errors[key] || ""

  return shell(
    <>
      <div className="mb-6">
        <p className="text-sm text-muted-foreground">
          Step {step + 1} of {STEPS.length} · {STEPS[step]}
        </p>
        <div className="mt-2 flex gap-1.5">
          {STEPS.map((s, i) => (
            <div key={s} className={cn("h-1.5 flex-1 rounded-full", i <= step ? "bg-primary" : "bg-border")} />
          ))}
        </div>
      </div>

      {step === 0 && info.reason && (
        <div className="mb-4 flex gap-2 rounded-2xl border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">
          <IconAlertTriangle className="size-5 shrink-0" />
          <div>
            <p className="font-semibold">Please send your documents again</p>
            <p className="mt-0.5">{info.reason}</p>
          </div>
        </div>
      )}

      <section className="rounded-2xl border bg-background p-5 sm:p-6">
        {step === 0 && (
          <>
            <h1 className="text-xl font-semibold">Verify your identity</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Hi {info.full_name}, it takes about five minutes. Which document will you use?
            </p>
            <div className="mt-5 grid gap-3">
              {info.id_types.map((t) => {
                const Icon = TYPE_ICONS[t.value] || IconId
                const on = form.id_type === t.value
                return (
                  <button
                    key={t.value}
                    type="button"
                    aria-pressed={on}
                    onClick={() => {
                      setForm((f) => ({ ...f, id_type: t.value }))
                      setErrors({})
                    }}
                    className={cn(
                      "flex items-center gap-4 rounded-2xl border p-4 text-left transition",
                      on ? "border-primary bg-primary/5 ring-2 ring-primary/30" : "hover:bg-muted",
                    )}
                  >
                    <span className={cn("rounded-xl p-2.5", on ? "bg-primary text-primary-foreground" : "bg-muted")}>
                      <Icon className="size-6" />
                    </span>
                    <span>
                      <span className="block font-medium">{t.label}</span>
                      <span className="text-xs text-muted-foreground">
                        {t.sides.length > 1 ? "Photos of the front and back" : "A photo of the photo page"}
                      </span>
                    </span>
                  </button>
                )
              })}
            </div>
            {err("id_type") && <p className="mt-2 text-xs text-destructive">{err("id_type")}</p>}
          </>
        )}

        {step === 1 && idType && (
          <>
            <h1 className="text-xl font-semibold">Your {idType.value === "id_card" ? "ID card" : idType.label.toLowerCase()}</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Take clear photos in good light, with all four corners showing and no glare.
            </p>
            <div className={cn("mt-5 grid gap-3", idType.sides.length > 1 && "sm:grid-cols-2")}>
              {idType.sides.map((side) => (
                <div key={side}>
                  <DocumentCamera
                    label={idType.sides.length > 1 ? SIDE_LABEL[side] : "Photo page"}
                    done={uploaded.has(side)}
                    preview={previews[side]}
                    busy={uploading === side}
                    onCapture={(blob) => capture(side, blob)}
                    onFile={(file) => attach(side, file)}
                  />
                  {err(side) && <p className="mt-1 text-xs text-destructive">{err(side)}</p>}
                </div>
              ))}
            </div>
            <div className="mt-6 space-y-4">
              <Field id="full_name" label="Full name" hint="As shown on your document" error={err("full_name")}>
                <Input id="full_name" value={form.full_name} onChange={set("full_name")} autoComplete="name" />
              </Field>
              <Field id="date_of_birth" label="Date of birth" error={err("date_of_birth")}>
                <Input
                  id="date_of_birth"
                  value={form.date_of_birth}
                  onChange={set("date_of_birth")}
                  placeholder="dd/mm/yyyy"
                  inputMode="numeric"
                  autoComplete="bday"
                />
              </Field>
              <Field id="id_type_shown" label="ID type">
                <Input id="id_type_shown" value={idType.label} readOnly className="bg-muted/50" />
              </Field>
              <Field id="id_number" label={NUMBER_LABEL[idType.value] || "Document number"} error={err("id_number")}>
                <Input id="id_number" value={form.id_number} onChange={set("id_number")} autoCapitalize="characters" />
              </Field>
            </div>
          </>
        )}

        {step === 2 && (
          <>
            <h1 className="text-xl font-semibold">Take a selfie</h1>
            <p className="mt-1 mb-5 text-sm text-muted-foreground">
              Look straight at the camera, with your face inside the circle. No glasses, hat or mask.
            </p>
            {uploaded.has("selfie") && !retake ? (
              <div className="space-y-4">
                <div className="mx-auto aspect-[3/4] w-full max-w-sm overflow-hidden rounded-3xl border bg-muted">
                  {previews.selfie ? (
                    <img src={previews.selfie} alt="Your selfie" className="h-full w-full -scale-x-100 object-cover" />
                  ) : (
                    <div className="flex h-full flex-col items-center justify-center gap-2 text-sm text-emerald-700 dark:text-emerald-300">
                      <IconCircleCheck className="size-10" /> Selfie added
                    </div>
                  )}
                </div>
                <Button variant="outline" className="h-11 w-full" onClick={() => setRetake(true)}>
                  <IconRefresh className="size-4" /> Take it again
                </Button>
              </div>
            ) : (
              <LiveCamera
                facing="user"
                busy={uploading === "selfie"}
                onCapture={(blob) => capture("selfie", blob).then((ok) => ok && setRetake(false))}
              />
            )}
            {err("selfie") && <p className="mt-2 text-xs text-destructive">{err("selfie")}</p>}
          </>
        )}

        {step === 3 && (
          <>
            <h1 className="text-xl font-semibold">Enter your address</h1>
            <p className="mt-1 text-sm text-muted-foreground">Provide the address you&apos;d like linked to your account.</p>
            <div className="mt-5 space-y-4">
              <Field id="address_line1" label="Address line 1" error={err("address_line1")}>
                <Input id="address_line1" value={form.address_line1} onChange={set("address_line1")} autoComplete="address-line1" />
              </Field>
              <Field id="address_line2" label="Address line 2 (optional)">
                <Input id="address_line2" value={form.address_line2} onChange={set("address_line2")} autoComplete="address-line2" />
              </Field>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field id="city" label="City" error={err("city")}>
                  <Input id="city" value={form.city} onChange={set("city")} autoComplete="address-level2" />
                </Field>
                <Field id="region" label="State / Region" error={err("region")}>
                  <Input id="region" value={form.region} onChange={set("region")} autoComplete="address-level1" />
                </Field>
                <Field id="postal_code" label="Postal code" error={err("postal_code")}>
                  <Input id="postal_code" value={form.postal_code} onChange={set("postal_code")} autoComplete="postal-code" />
                </Field>
                <Field id="country" label="Country" error={err("country")}>
                  <Input id="country" value={form.country} onChange={set("country")} autoComplete="country-name" />
                </Field>
              </div>
            </div>
          </>
        )}

        {step === 4 && (
          <>
            <h1 className="text-xl font-semibold">Proof of address</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              One document dated within the last 3 months, showing your name and the address you entered.
            </p>
            <div className="mt-5 grid gap-2">
              {info.poa_types.map((t) => (
                <label
                  key={t.value}
                  className={cn(
                    "flex cursor-pointer items-center gap-3 rounded-xl border p-3.5 text-sm transition",
                    form.poa_type === t.value ? "border-primary bg-primary/5" : "hover:bg-muted",
                  )}
                >
                  <input
                    type="radio"
                    name="poa_type"
                    value={t.value}
                    checked={form.poa_type === t.value}
                    onChange={set("poa_type")}
                    className="accent-primary"
                  />
                  <IconFileText className="size-4 text-muted-foreground" />
                  {t.label}
                </label>
              ))}
            </div>
            {err("poa_type") && <p className="mt-1 text-xs text-destructive">{err("poa_type")}</p>}
            <div className="mt-4">
              <DocumentCamera
                label="Proof of address"
                done={uploaded.has("poa")}
                preview={previews.poa}
                busy={uploading === "poa"}
                onCapture={(blob) => capture("poa", blob)}
                onFile={(file) => attach("poa", file)}
                accept="image/*,application/pdf"
              />
              <p className="mt-1.5 text-xs text-muted-foreground">
                Take a photo, or upload a photo or PDF (up to 10 MB). The whole page must be readable; screenshots and
                edited files are not accepted.
              </p>
              {err("poa") && <p className="mt-1 text-xs text-destructive">{err("poa")}</p>}
            </div>
          </>
        )}

        {notice && (
          <div className="mt-5 flex gap-2 rounded-xl border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
            <IconAlertTriangle className="size-5 shrink-0" />
            {notice}
          </div>
        )}

        <div className="mt-6 flex gap-3">
          {step > 0 && (
            <Button variant="outline" className="h-11" onClick={() => setStep(step - 1)} disabled={sending}>
              <IconArrowLeft className="size-4" /> Back
            </Button>
          )}
          <Button className="h-11 flex-1" onClick={next} disabled={Boolean(uploading) || sending}>
            {sending && <IconLoader2 className="size-4 animate-spin" />}
            {step === STEPS.length - 1 ? (sending ? "Sending…" : "Send my details") : "Continue"}
          </Button>
        </div>
      </section>
      <p className="mt-4 text-center text-xs text-muted-foreground">
        Your documents are only used to verify your identity and are seen only by the team checking them.
      </p>
    </>,
  )
}
