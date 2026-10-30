import { useEffect, useState } from "react"
import { Link, useNavigate, useSearchParams } from "react-router-dom"
import { IconAlertCircle, IconCircleCheck, IconLock } from "@tabler/icons-react"
import { LoginCodeStep } from "@/components/login-code-step"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { PasswordInput } from "@/components/ui/password-input"
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field"
import { getApiBase } from "@/lib/api"
import { ownerApi } from "@/lib/owner"
import finstapLogo from "@/assets/finstap-logo.svg"
import finstapLogoLight from "@/assets/finstap-logo-light.svg"
import { useFormErrors } from "@/lib/validation"
import { FieldMessage, invalidProps } from "@/components/FormField"

const MIN_PASSWORD = 12
const OWNER_LOGIN_SCHEMA = {
  email: { label: "Email", required: true, type: "email" },
  password: { label: "Password", required: true },
}
const OWNER_FORGOT_SCHEMA = { email: { label: "Email", required: true, type: "email" } }
const OWNER_PASSWORD_SCHEMA = {
  password: { label: "Password", required: true, minLength: MIN_PASSWORD },
  repeat: { label: "Repeat password", required: true, match: "password", matchMessage: "The two passwords are not the same." },
}

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
  const { errors, check, recheck } = useFormErrors(OWNER_LOGIN_SCHEMA, { prefix: "owner-" })

  const submit = async (e) => {
    e.preventDefault()
    if (!check({ email, password })) return
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
    >
      <form onSubmit={submit} noValidate>
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
              {...invalidProps(errors, 'email', 'owner-')}
              type="email"
              autoComplete="username"
              autoFocus
              value={email}
              onChange={(e) => { setEmail(e.target.value); recheck('email', e.target.value) }}
              disabled={busy}
            />
            <FieldMessage id="owner-email-error" message={errors.email} />
          </Field>
          <Field>
            {/* Same as the workspace sign-in: the reset link sits next to the label */}
            <div className="flex items-center">
              <FieldLabel htmlFor="owner-password">Password</FieldLabel>
              <Link to="/owner/forgot" className="ml-auto text-sm underline-offset-4 hover:underline">
                Forgot your password?
              </Link>
            </div>
            <PasswordInput
              id="owner-password"
              {...invalidProps(errors, 'password', 'owner-')}
              autoComplete="current-password"
              value={password}
              onChange={(e) => { setPassword(e.target.value); recheck('password', e.target.value) }}
              disabled={busy}
            />
            <FieldMessage id="owner-password-error" message={errors.password} />
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

  const forgotErrors = useFormErrors(OWNER_FORGOT_SCHEMA, { prefix: "owner-forgot-" })

  const submit = async (e) => {
    e.preventDefault()
    if (!forgotErrors.check({ email })) return
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
        <form onSubmit={submit} noValidate>
          <FieldGroup>
            <ErrorBox error={error} />
            <Field>
              <FieldLabel htmlFor="owner-forgot-email">Owner email</FieldLabel>
              <Input
                id="owner-forgot-email"
                {...invalidProps(forgotErrors.errors, 'email', 'owner-forgot-')}
                type="email"
                autoComplete="email"
                autoFocus
                value={email}
                onChange={(e) => { setEmail(e.target.value); forgotErrors.recheck('email', e.target.value) }}
                disabled={busy}
              />
              <FieldMessage id="owner-forgot-email-error" message={forgotErrors.errors.email} />
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
  const pwErrors = useFormErrors(OWNER_PASSWORD_SCHEMA, { prefix: "owner-" })
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
    if (!pwErrors.check({ password, repeat })) return
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
        <form onSubmit={submit} noValidate>
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
              <PasswordInput
                id="owner-new-password"
                {...invalidProps(pwErrors.errors, 'password', 'owner-new-')}
                autoComplete="new-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                disabled={busy}
              />
              <FieldMessage id="owner-new-password-error" message={pwErrors.errors.password} />
              <FieldDescription>At least {MIN_PASSWORD} characters.</FieldDescription>
            </Field>
            <Field>
              <FieldLabel htmlFor="owner-repeat">Repeat password</FieldLabel>
              <PasswordInput
                id="owner-repeat"
                {...invalidProps(pwErrors.errors, 'repeat', 'owner-')}
                autoComplete="new-password"
                value={repeat}
                onChange={(e) => setRepeat(e.target.value)}
                disabled={busy}
              />
              <FieldMessage id="owner-repeat-error" message={pwErrors.errors.repeat} />
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
