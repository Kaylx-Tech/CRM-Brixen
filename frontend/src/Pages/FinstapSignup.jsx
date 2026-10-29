import { useEffect, useState } from "react"
import { useFormErrors } from "@/lib/validation"
import { FieldMessage, invalidProps } from "@/components/FormField"
import { Link, useNavigate } from "react-router-dom"
import { cn } from "cn"
import {
  IconAlertCircle,
  IconArrowLeft,
  IconArrowRight,
  IconCheck,
  IconCircleCheck,
  IconLoader2,
} from "@tabler/icons-react"
import { AuthLayout } from "@/components/auth-layout"
import { FINSTAP_CTA } from "@/components/finstap-auth-layout"
import { LoginCodeStep } from "@/components/login-code-step"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { toastProcessing, toastDone, toastFail } from "@/lib/toastActions"
import { homePath } from "@/lib/permissions"
import { getApiBase } from "@/lib/api"
import {
  TENANT_DOMAIN,
  setWorkspace,
  sharedUrl,
  subdomainWorkspace,
  suggestWorkspaceName,
  toWorkspaceName,
  workspaceHost,
  workspaceUrl,
} from "@/lib/workspace"

const MIN_PASSWORD_LEN = 8
// Same rules as the signup checks in backend/routes/platform_routes.py
const SIGNUP_SCHEMA = {
  email: { label: "Work email", required: true, type: "email" },
  company_name: { label: "Company name", required: true, maxLength: 120 },
  full_name: { label: "Your name", required: true, maxLength: 120 },
  password: { label: "Password", required: true, minLength: MIN_PASSWORD_LEN },
}

const STEPS = ["Email", "Company", "Your account"]

const STEP_TEXT = {
  1: ["Confirm your email", "We'll send you a 6-digit code."],
  2: ["Create your workspace", "Start your free trial."],
  3: ["Create your account", "You'll sign in with these details."],
}

/** "1 Email — 2 Company — 3 Your account" with the current step highlighted and finished steps ticked. */
function SignupSteps({ step }) {
  return (
    <ol className="flex items-center gap-3">
      {STEPS.map((label, i) => {
        const n = i + 1
        const done = step > n
        const active = step === n
        return (
          <li key={label} className="flex flex-1 items-center gap-3">
            <span
              className={cn(
                "flex size-7 shrink-0 items-center justify-center rounded-full text-xs font-semibold",
                active || done
                  ? "bg-linear-to-r from-[#297bff] to-[#834aff] text-white"
                  : "border bg-muted text-muted-foreground",
              )}
            >
              {done ? <IconCheck className="size-4" /> : n}
            </span>
            <span
              className={cn(
                "text-sm",
                active ? "font-semibold text-foreground" : "text-muted-foreground",
              )}
            >
              {label}
            </span>
            {n < STEPS.length && (
              <span
                className={cn("h-px flex-1", done ? "bg-[#6559ff]" : "bg-border")}
                aria-hidden
              />
            )}
          </li>
        )
      })}
    </ol>
  )
}

/** Finstap signup: a company creates its workspace and its owner account, then lands in the CRM. */
export default function FinstapSignup() {
  const navigate = useNavigate()
  // Signup happens on the shared address (finstap.com), never inside a company's subdomain
  useEffect(() => {
    if (subdomainWorkspace()) window.location.replace(sharedUrl("/signup"))
  }, [])
  const [companyName, setCompanyName] = useState("")
  const [slug, setSlug] = useState("")
  const [slugEdited, setSlugEdited] = useState(false)
  const [slugState, setSlugState] = useState({ status: "idle", error: "" })
  const [fullName, setFullName] = useState("")
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [error, setError] = useState("")
  const { errors, check, recheck, fromResponse } = useFormErrors(SIGNUP_SCHEMA)
  const [isLoading, setIsLoading] = useState(false)
  // Three steps: 1 = the owner's email, confirmed with a code, 2 = the company and its address,
  // 3 = the owner's own account
  const [step, setStep] = useState(1)
  // Step 1: the code that was emailed ({ challenge, resendAfter }), then the token the signup must bring
  const [emailCode, setEmailCode] = useState(null)
  const [emailToken, setEmailToken] = useState("")

  const sendEmailCode = async (e) => {
    e.preventDefault()
    setError("")
    if (!check({ email }, null, ["email"])) return
    setIsLoading(true)
    try {
      const res = await fetch(`${getApiBase()}/platform/signup/email-code`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      })
      const data = await res.json().catch(() => ({}))
      if (res.ok && data.data?.challenge) {
        setEmail(data.data.email || email)
        setEmailCode({ challenge: data.data.challenge, resendAfter: data.data.resend_after || 60 })
        return
      }
      if (!fromResponse({ data })) setError(data.error || data.message || "Could not send the code. Please try again.")
    } catch {
      setError("Failed to connect to server. Please check your connection.")
    } finally {
      setIsLoading(false)
    }
  }

  const changeEmail = () => {
    setEmailCode(null)
    setEmailToken("")
    setError("")
    setStep(1)
  }

  // The workspace name (one word) follows the company name until the user types their own
  useEffect(() => {
    if (!slugEdited) setSlug(suggestWorkspaceName(companyName))
  }, [companyName, slugEdited])

  // Live "is this workspace name free?" check
  useEffect(() => {
    const value = toWorkspaceName(slug)
    if (value.length < 3) {
      setSlugState({ status: "idle", error: "" })
      return
    }
    setSlugState({ status: "checking", error: "" })
    const ctrl = new AbortController()
    const timer = setTimeout(async () => {
      try {
        const res = await fetch(
          `${getApiBase()}/platform/check-slug?slug=${encodeURIComponent(value)}`,
          {
            signal: ctrl.signal,
          },
        )
        const data = (await res.json().catch(() => ({}))).data || {}
        setSlugState(
          data.available
            ? { status: "available", error: "" }
            : { status: "taken", error: data.error || "Not available" },
        )
      } catch (err) {
        if (err.name !== "AbortError") setSlugState({ status: "idle", error: "" })
      }
    }, 400)
    return () => {
      clearTimeout(timer)
      ctrl.abort()
    }
  }, [slug])

  // Step 2 → 3 only with a company name and a free address
  const goToAccount = () => {
    if (!check({ company_name: companyName }, null, ["company_name"])) return
    if (toWorkspaceName(slug).length < 3) {
      setError("Choose your Finstap address: one word, 3-30 letters or numbers.")
      return
    }
    if (slugState.status === "checking") {
      setError("One moment, checking the address…")
      return
    }
    if (slugState.status !== "available") {
      setError(slugState.error || "This address is not available. Try another one.")
      return
    }
    setError("")
    setStep(3)
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (step === 2) {
      goToAccount()
      return
    }
    setError("")
    if (!check({ full_name: fullName, password }, null, ["full_name", "password"])) return
    if (slugState.status === "taken") {
      setError(slugState.error)
      return
    }
    setIsLoading(true)
    const toastId = toastProcessing("Creating your workspace…")
    try {
      const res = await fetch(`${getApiBase()}/platform/signup`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          company_name: companyName,
          slug: toWorkspaceName(slug),
          full_name: fullName,
          email,
          email_token: emailToken,
          password,
        }),
      })
      const data = await res.json().catch(() => ({}))
      const payload = data.data || {}
      if (res.ok && payload.token) {
        setWorkspace(payload.workspace?.slug)
        // Company subdomains: open acme.finstap.com, which signs in with the one-time code
        const target = payload.handoff_code
          ? workspaceUrl(
              payload.workspace?.slug,
              `/welcome?code=${encodeURIComponent(payload.handoff_code)}`,
            )
          : ""
        if (target) {
          toastDone(toastId, `Welcome to Finstap, ${payload.workspace?.name || companyName}`)
          window.location.assign(target)
          return
        }
        localStorage.setItem("token", payload.token)
        localStorage.setItem("user", JSON.stringify(payload.user || { email }))
        toastDone(toastId, `Welcome to Finstap, ${payload.workspace?.name || companyName}`)
        navigate(homePath(payload.user || {}), { replace: true })
        return
      }
      const msg = data.message || data.error || "Could not create the workspace. Please try again."
      if (data.details?.email_unverified) {
        // The confirmation ran out (or was used): confirm the email again on step 1
        changeEmail()
        setError(msg)
        toastFail(toastId, msg)
        return
      }
      if (!fromResponse({ data })) setError(msg)
      // A problem with the company or its address is fixed on step 2
      if (data.fields?.company_name || data.fields?.slug || (!data.fields && /workspace|address|company/i.test(msg))) setStep(2)
      toastFail(toastId, msg)
    } catch {
      const msg = "Failed to connect to server. Please check your connection."
      setError(msg)
      toastFail(toastId, msg)
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <AuthLayout
      title={STEP_TEXT[step][0]}
      subtitle={STEP_TEXT[step][1]}
      footer={
        <>
          Already have an account?{" "}
          <Link
            to="/login"
            className="font-semibold text-[#5f5cff] underline-offset-4 hover:underline dark:text-[#8b8aff]"
          >
            Login
          </Link>
        </>
      }
    >
      {step === 1 ? (
        // Step 1 sits outside the main form: the code step is a form of its own
        <FieldGroup>
          <SignupSteps step={step} />
          {error && (
            <Alert variant="destructive">
              <IconAlertCircle className="size-4" />
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}
          {emailCode ? (
            <>
              <p className="m-0 text-sm text-muted-foreground">
                We sent a 6-digit code to{" "}
                <span className="font-medium text-foreground">{email}</span>. It works for 10
                minutes.
              </p>
              <LoginCodeStep
                heading={false}
                apiUrl={getApiBase()}
                challenge={emailCode.challenge}
                emailHint={email}
                resendAfter={emailCode.resendAfter}
                verifyPath="/platform/signup/email-verify"
                resendPath="/platform/signup/email-resend"
                submitLabel="Confirm email"
                onSuccess={(data) => {
                  setEmailToken(data.data?.email_token || "")
                  setEmail(data.data?.email || email)
                  setError("")
                  setStep(2)
                }}
                onBack={changeEmail}
              />
            </>
          ) : (
            <form onSubmit={sendEmailCode} noValidate>
              <FieldGroup>
                <Field>
                  <FieldLabel htmlFor="email">Work email</FieldLabel>
                  <Input
                    id="email"
                    {...invalidProps(errors, 'email', '')}
                    type="email"
                    placeholder="you@company.com"
                    autoComplete="email"
                    autoFocus
                    value={email}
                    onChange={(e) => { setEmail(e.target.value); recheck('email', e.target.value) }}
                    disabled={isLoading}
                  />
                  <FieldMessage id="email-error" message={errors.email} />
                  <FieldDescription>
                    You'll use this email to sign in. We'll send it a code to confirm it's yours.
                  </FieldDescription>
                </Field>
                <Field>
                  <Button type="submit" disabled={isLoading} className={FINSTAP_CTA}>
                    {isLoading ? "Sending code..." : "Send code"}
                    {!isLoading && <IconArrowRight className="size-4" />}
                  </Button>
                </Field>
              </FieldGroup>
            </form>
          )}
        </FieldGroup>
      ) : (
      <form onSubmit={handleSubmit} noValidate>
        <FieldGroup>
          <SignupSteps step={step} />
          {error && (
            <Alert variant="destructive">
              <IconAlertCircle className="size-4" />
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}
          {step === 2 ? (
            <>
              <Field>
                <FieldLabel htmlFor="company_name">Company name</FieldLabel>
                <Input
                  id="company_name"
                  {...invalidProps(errors, 'company_name', '')}
                  placeholder="Acme Accountants Ltd"
                  autoFocus
                  value={companyName}
                  onChange={(e) => { setCompanyName(e.target.value); recheck('company_name', e.target.value) }}
                  disabled={isLoading}
                />
                <FieldMessage id="company_name-error" message={errors.company_name} />
              </Field>
              <Field>
                <FieldLabel htmlFor="slug">Your Finstap address</FieldLabel>
                {/* One word only: anything but letters and numbers is dropped while typing */}
                <div className="relative">
                  <Input
                    id="slug"
                    className="pr-28"
                    placeholder="acme"
                    autoCapitalize="none"
                    autoCorrect="off"
                    maxLength={30}
                    required
                    value={slug}
                    onChange={(e) => {
                      setSlugEdited(true)
                      setSlug(toWorkspaceName(e.target.value))
                    }}
                    disabled={isLoading}
                  />
                  <span className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">
                    .{TENANT_DOMAIN || "finstap.com"}
                  </span>
                </div>
                
                {slugState.status === "checking" ? (
                  <FieldDescription className="flex items-center gap-1.5">
                    <IconLoader2 className="size-4 animate-spin" /> Checking…
                  </FieldDescription>
                ) : slugState.status === "available" ? (
                  <FieldDescription className="flex items-center gap-1.5 text-emerald-600 dark:text-emerald-400">
                    <IconCircleCheck className="size-4" /> Available. Your team signs in at this
                    address.
                  </FieldDescription>
                ) : slugState.status === "taken" ? (
                  <FieldDescription className="text-destructive">
                    {slugState.error}
                  </FieldDescription>
                ) : (
                  <FieldDescription>
                    One word, 3-30 letters or numbers. No spaces or dashes.
                  </FieldDescription>
                )}
              </Field>
              <Field>
                <Button type="submit" className={FINSTAP_CTA}>
                  Continue <IconArrowRight className="size-4" />
                </Button>
              </Field>
            </>
          ) : (
            <>
              {/* What steps 1 and 2 set up, with a way back to change it */}
              <div className="flex items-center justify-between gap-3 rounded-xl border bg-muted/40 px-3 py-2 text-sm">
                <div className="min-w-0">
                  <div className="truncate font-semibold text-foreground">{companyName.trim()}</div>
                  <div className="truncate text-muted-foreground">
                    {workspaceHost(toWorkspaceName(slug))}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setError("")
                    setStep(2)
                  }}
                  className="shrink-0 font-medium text-[#5f5cff] underline-offset-4 hover:underline dark:text-[#8b8aff]"
                  disabled={isLoading}
                >
                  Change
                </button>
              </div>
              <Field>
                <FieldLabel htmlFor="full_name">Your name</FieldLabel>
                <Input
                  id="full_name"
                  {...invalidProps(errors, 'full_name', '')}
                  autoComplete="name"
                  autoFocus
                  value={fullName}
                  onChange={(e) => { setFullName(e.target.value); recheck('full_name', e.target.value) }}
                  disabled={isLoading}
                />
                <FieldMessage id="full_name-error" message={errors.full_name} />
              </Field>
              {/* The email confirmed on step 1; changing it means confirming the new one */}
              <Field>
                <FieldLabel htmlFor="email">Work email</FieldLabel>
                <div className="flex items-center justify-between gap-3 rounded-xl border bg-muted/40 px-3 py-2 text-sm">
                  <span id="email" className="flex min-w-0 items-center gap-1.5 text-foreground">
                    <IconCircleCheck className="size-4 shrink-0 text-emerald-600 dark:text-emerald-400" />
                    <span className="truncate">{email}</span>
                  </span>
                  <button
                    type="button"
                    onClick={changeEmail}
                    className="shrink-0 font-medium text-[#5f5cff] underline-offset-4 hover:underline dark:text-[#8b8aff]"
                    disabled={isLoading}
                  >
                    Change
                  </button>
                </div>
              </Field>
              <Field>
                <FieldLabel htmlFor="password">Password</FieldLabel>
                <Input
                  id="password"
                  {...invalidProps(errors, 'password', '')}
                  type="password"
                  autoComplete="new-password"
                  value={password}
                  onChange={(e) => { setPassword(e.target.value); recheck('password', e.target.value) }}
                  disabled={isLoading}
                />
                <FieldMessage id="password-error" message={errors.password} />
                <FieldDescription>At least {MIN_PASSWORD_LEN} characters.</FieldDescription>
              </Field>
              <Field orientation="horizontal" className="gap-2">
                <Button
                  type="button"
                  variant="outline"
                  disabled={isLoading}
                  onClick={() => {
                    setError("")
                    setStep(2)
                  }}
                >
                  <IconArrowLeft className="size-4" /> Back
                </Button>
                <Button
                  type="submit"
                  disabled={isLoading || slugState.status === "taken"}
                  className={cn("flex-1", FINSTAP_CTA)}
                >
                  {isLoading ? "Creating workspace..." : "Create workspace"}
                  {!isLoading && <IconArrowRight className="size-4" />}
                </Button>
              </Field>
              <p className="text-xs text-muted-foreground">
                By creating an account, you agree to the Finstap{" "}
                <Link to="/terms" target="_blank" className="underline underline-offset-4 hover:text-foreground">
                  Terms of Service
                </Link>{" "}
                and{" "}
                <Link to="/privacy" target="_blank" className="underline underline-offset-4 hover:text-foreground">
                  Privacy Policy
                </Link>
                .
              </p>
            </>
          )}
        </FieldGroup>
      </form>
      )}
    </AuthLayout>
  )
}
