import { useEffect, useState } from "react"
import { useNavigate, useParams } from "react-router-dom"
import { IconAlertTriangle, IconArrowRight, IconLoader2, IconShieldCheck } from "@tabler/icons-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { PhoneInput } from "@/components/ui/phone-input"
import { Label } from "@/components/ui/label"
import brixenLogo from "@/assets/brixen-logo.png"

// Brixen's identity checks run on Finstap (its "brixen" KYC workspace): the form talks to the Finstap API
// straight from the browser, and Finstap's KYC team checks what is sent (kyc.finstap.com).
const getApiBase = () => String(import.meta.env.VITE_FINSTAP_API_URL || "https://api.finstap.com/api").replace(/\/$/, "")
const useBranding = () => ({ logo: brixenLogo })

/**
 * portal.brixenconsultants.com/verify/start/<code> — the workspace's own KYC link, which it sends to any client (no order).
 * The client gives their name and email, then continues to the same step-by-step form (/verify/<token>).
 */
export default function KycStart() {
  const { code = "" } = useParams()
  const navigate = useNavigate()
  const { logo } = useBranding()
  const workspace = code.includes(".") ? code.split(".")[0] : ""
  const url = `${getApiBase()}/kyc-link/${encodeURIComponent(code)}${workspace ? `?workspace=${encodeURIComponent(workspace)}` : ""}`

  const [info, setInfo] = useState(null)
  const [loadError, setLoadError] = useState("")
  const [form, setForm] = useState({ first_name: "", last_name: "", email: "", phone: "" })
  const [errors, setErrors] = useState({})
  const [notice, setNotice] = useState("")
  const [sending, setSending] = useState(false)

  useEffect(() => {
    fetch(url)
      .then(async (res) => {
        const json = await res.json().catch(() => ({}))
        if (!res.ok) throw new Error(json.error || "This verification link is not valid.")
        setInfo(json.data)
      })
      .catch((err) => setLoadError(err.message || "The page could not be loaded. Please try again in a moment."))
  }, [url])

  const set = (key) => (e) => {
    setForm((f) => ({ ...f, [key]: e.target.value }))
    setErrors((er) => ({ ...er, [key]: "" }))
  }

  const start = async (e) => {
    e.preventDefault()
    setSending(true)
    setNotice("")
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) {
        setErrors(json.fields || {})
        setNotice(json.fields ? "" : json.error || "Your verification could not be started.")
        return
      }
      navigate(`/verify/${json.data.token}`, { replace: true })
    } catch {
      setNotice("Your verification could not be started. Check your connection and try again.")
    } finally {
      setSending(false)
    }
  }

  const name = info?.workspace || "Identity check"

  return (
    <div className="min-h-svh bg-muted/40">
      <header className="border-b bg-background/80 backdrop-blur-md">
        <div className="mx-auto flex max-w-xl items-center justify-between gap-3 px-4 py-3">
          {logo ? (
            <img src={logo} alt="" className="h-8 w-auto max-w-[160px] object-contain" />
          ) : (
            <span className="text-sm font-semibold">{name}</span>
          )}
          <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
            <IconShieldCheck className="size-4" /> Secure
          </span>
        </div>
      </header>
      <main className="mx-auto max-w-xl px-4 py-6 sm:py-10">
        {loadError || (info && !info.available) ? (
          <div className="rounded-2xl border bg-background p-6 text-center">
            <IconAlertTriangle className="mx-auto size-10 text-amber-500" />
            <h1 className="mt-3 text-lg font-semibold">This link cannot be used</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              {loadError || `${info.message} Please contact ${name}.`}
            </p>
          </div>
        ) : !info ? (
          <div className="flex justify-center py-16 text-muted-foreground">
            <IconLoader2 className="size-6 animate-spin" />
          </div>
        ) : (
          <form onSubmit={start} className="rounded-2xl border bg-background p-5 sm:p-6">
            <h1 className="text-xl font-semibold">Verify your identity</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              {name} asks you to verify your identity. It takes about five minutes: have your ID card, driving
              licence or passport and a proof of address ready.
            </p>
            <div className="mt-5 space-y-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label htmlFor="first_name">First name</Label>
                  <Input id="first_name" value={form.first_name} onChange={set("first_name")} autoComplete="given-name" />
                  {errors.first_name && <p className="text-xs text-destructive">{errors.first_name}</p>}
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="last_name">Last name</Label>
                  <Input id="last_name" value={form.last_name} onChange={set("last_name")} autoComplete="family-name" />
                  {errors.last_name && <p className="text-xs text-destructive">{errors.last_name}</p>}
                </div>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="email">Email</Label>
                <Input id="email" type="email" value={form.email} onChange={set("email")} autoComplete="email" />
                {errors.email ? (
                  <p className="text-xs text-destructive">{errors.email}</p>
                ) : (
                  <p className="text-xs text-muted-foreground">We email you the result.</p>
                )}
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="phone">Phone (optional)</Label>
                <PhoneInput id="phone" type="tel" value={form.phone} onChange={set("phone")} autoComplete="tel" />
              </div>
            </div>
            {notice && (
              <div className="mt-5 flex gap-2 rounded-xl border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
                <IconAlertTriangle className="size-5 shrink-0" />
                {notice}
              </div>
            )}
            <Button type="submit" className="mt-6 h-11 w-full" disabled={sending}>
              {sending ? <IconLoader2 className="size-4 animate-spin" /> : <IconArrowRight className="size-4" />}
              Start verification
            </Button>
          </form>
        )}
      </main>
    </div>
  )
}
