import { useEffect, useState } from "react"
import { Link, useNavigate, useSearchParams } from "react-router-dom"
import { IconAlertCircle, IconCircleCheck, IconLock } from "@tabler/icons-react"
import { LoginCodeStep } from "@/components/login-code-step"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field"
import { getApiBase } from "@/lib/api"
import { ownerApi } from "@/lib/owner"
import finstapLogo from "@/assets/finstap-logo.svg"
import finstapLogoLight from "@/assets/finstap-logo-light.svg"

const MIN_PASSWORD = 12

/** The owner portal's own sign-in pages: one plain card in the middle of the screen. */
function OwnerCard({ title, subtitle, children, footer }) {
  useEffect(() => {
    document.title = `${title} · Finstap owner`
  }, [title])
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-muted/40 px-4 py-10">
      <div className="w-full max-w-sm">
        <div className="mb-6 flex flex-col items-center gap-3">
          <img src={finstapLogo} alt="Finstap" className="w-auto dark:hidden h-11" />
          <img src={finstapLogoLight} alt="Finstap" className="hidden h-9 w-auto dark:block" />
          <span className="inline-flex items-center gap-1.5 rounded-full bg-primary/10 px-3 py-1 text-xs font-semibold text-primary">
            <IconLock className="size-3.5" /> Owner portal
          </span>
        </div>
        <div className="rounded-2xl border bg-card p-6 shadow-sm">
          <h1 className="text-xl font-bold tracking-tight">{title}</h1>
          {subtitle && <p className="mt-1 text-sm text-muted-foreground">{subtitle}</p>}
          <div className="mt-6">{children}</div>
        </div>
        {footer && <div className="mt-4 text-center text-sm text-muted-foreground">{footer}</div>}
        <p className="mt-8 text-center text-xs text-muted-foreground">
          For the Finstap team only. Companies sign in at their own address.
        </p>
      </div>
    </div>
  )
}

function ErrorBox({ error }) {
  return error ? (
    <Alert variant="destructive">
      <IconAlertCircle className="size-4" />
      <AlertDescription>{error}</AlertDescription>
    </Alert>
  ) : null
}

/** Email + password, then the 6-digit code emailed to the owner. */
export function OwnerLogin({ onSignedIn }) {
  const [params] = useSearchParams()
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [error, setError] = useState("")
  const [busy, setBusy] = useState(false)
  const [code, setCode] = useState(null)

  const submit = async (e) => {
    e.preventDefault()
    setBusy(true)
    setError("")
    const res = await ownerApi("/login", { method: "POST", body: { email, password } })
    setBusy(false)
    if (res.ok) setCode(res.data)
    else setError(res.error)
  }

  if (code) {
    return (
      <OwnerCard
        title="Check your email"
        subtitle={`We sent a 6-digit code to ${code.email_hint}.`}
      >
        <LoginCodeStep
          heading={false}
          apiUrl={getApiBase()}
          challenge={code.challenge}
          emailHint={code.email_hint}
          resendAfter={code.resend_after}
          verifyPath="/platform/owner/login/verify"
          resendPath="/platform/owner/login/resend"
          onSuccess={(data) => onSignedIn(data.data)}
          onBack={() => {
            setCode(null)
            setPassword("")
          }}
        />
      </OwnerCard>
    )
  }

  return (
    <OwnerCard
      title="Sign in"
      subtitle="Use your owner email and password."
      footer={
        <Link to="/owner/forgot" className="font-medium text-primary hover:underline">
          Set up or reset your password
        </Link>
      }
    >
      <form onSubmit={submit}>
        <FieldGroup>
          <ErrorBox error={error} />
          {params.get("ready") && !error && (
            <div className="flex gap-2 rounded-xl border border-emerald-500/30 bg-emerald-500/5 p-3 text-sm">
              <IconCircleCheck className="size-5 shrink-0 text-emerald-600" />
              Password saved. Sign in with it now.
            </div>
          )}
          <Field>
            <FieldLabel htmlFor="owner-email">Email</FieldLabel>
            <Input
              id="owner-email"
              type="email"
              autoComplete="username"
              autoFocus
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              disabled={busy}
            />
          </Field>
          <Field>
            <FieldLabel htmlFor="owner-password">Password</FieldLabel>
            <Input
              id="owner-password"
              type="password"
              autoComplete="current-password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              disabled={busy}
            />
          </Field>
          <Button type="submit" disabled={busy} className="w-full">
            {busy ? "Checking..." : "Continue"}
          </Button>
        </FieldGroup>
      </form>
    </OwnerCard>
  )
}

/** Ask for a one-time link to set (first time) or reset the password. */
export function OwnerForgot() {
  const [email, setEmail] = useState("")
  const [error, setError] = useState("")
  const [sent, setSent] = useState("")
  const [busy, setBusy] = useState(false)

  const submit = async (e) => {
    e.preventDefault()
    setBusy(true)
    setError("")
    const res = await ownerApi("/password-link", { method: "POST", body: { email } })
    setBusy(false)
    if (res.ok) setSent(res.message)
    else setError(res.error)
  }

  return (
    <OwnerCard
      title="Set your password"
      subtitle="First time here, or forgot your password? We'll email you a link."
      footer={
        <Link to="/owner/login" className="font-medium text-primary hover:underline">
          Back to sign in
        </Link>
      }
    >
      {sent ? (
        <div className="flex gap-3 rounded-xl border border-emerald-500/30 bg-emerald-500/5 p-4 text-sm">
          <IconCircleCheck className="size-5 shrink-0 text-emerald-600" />
          <p>{sent}</p>
        </div>
      ) : (
        <form onSubmit={submit}>
          <FieldGroup>
            <ErrorBox error={error} />
            <Field>
              <FieldLabel htmlFor="owner-forgot-email">Owner email</FieldLabel>
              <Input
                id="owner-forgot-email"
                type="email"
                autoComplete="email"
                autoFocus
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                disabled={busy}
              />
            </Field>
            <Button type="submit" disabled={busy} className="w-full">
              {busy ? "Sending..." : "Email me a link"}
            </Button>
          </FieldGroup>
        </form>
      )}
    </OwnerCard>
  )
}

/** The page the emailed link opens: choose a new password. */
export function OwnerSetPassword() {
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const token = params.get("token") || ""
  const [email, setEmail] = useState(null)
  const [name, setName] = useState("")
  const [password, setPassword] = useState("")
  const [repeat, setRepeat] = useState("")
  const [error, setError] = useState("")
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    ownerApi(`/password-link?token=${encodeURIComponent(token)}`).then((res) =>
      res.ok ? setEmail(res.data.email) : setError(res.error),
    )
  }, [token])

  const submit = async (e) => {
    e.preventDefault()
    setError("")
    if (password.length < MIN_PASSWORD) return setError(`Use at least ${MIN_PASSWORD} characters.`)
    if (password !== repeat) return setError("The two passwords are not the same.")
    setBusy(true)
    const res = await ownerApi("/password", {
      method: "POST",
      body: { token, password, full_name: name },
    })
    setBusy(false)
    if (res.ok) navigate("/owner/login?ready=1", { replace: true })
    else setError(res.error)
  }

  return (
    <OwnerCard
      title="Choose a password"
      subtitle={email ? `For ${email}` : undefined}
      footer={
        <Link to="/owner/login" className="font-medium text-primary hover:underline">
          Back to sign in
        </Link>
      }
    >
      {email === null ? (
        error ? (
          <FieldGroup>
            <ErrorBox error={error} />
            <Link to="/owner/forgot" className="text-sm font-medium text-primary hover:underline">
              Ask for a new link
            </Link>
          </FieldGroup>
        ) : (
          <p className="text-sm text-muted-foreground">Checking the link…</p>
        )
      ) : (
        <form onSubmit={submit}>
          <FieldGroup>
            <ErrorBox error={error} />
            <Field>
              <FieldLabel htmlFor="owner-name">Your name</FieldLabel>
              <Input
                id="owner-name"
                autoComplete="name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                disabled={busy}
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="owner-new-password">New password</FieldLabel>
              <Input
                id="owner-new-password"
                type="password"
                autoComplete="new-password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                disabled={busy}
              />
              <FieldDescription>At least {MIN_PASSWORD} characters.</FieldDescription>
            </Field>
            <Field>
              <FieldLabel htmlFor="owner-repeat-password">Repeat password</FieldLabel>
              <Input
                id="owner-repeat-password"
                type="password"
                autoComplete="new-password"
                required
                value={repeat}
                onChange={(e) => setRepeat(e.target.value)}
                disabled={busy}
              />
            </Field>
            <Button type="submit" disabled={busy} className="w-full">
              {busy ? "Saving..." : "Save password"}
            </Button>
          </FieldGroup>
        </form>
      )}
    </OwnerCard>
  )
}
