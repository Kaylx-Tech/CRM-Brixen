import { useEffect, useState } from "react"
import { Link, useNavigate, useSearchParams } from "react-router-dom"
import { IconAlertCircle, IconArrowRight, IconBuildingStore, IconCircleCheck } from "@tabler/icons-react"
import { AuthLayout } from "@/components/auth-layout"
import { FINSTAP_CTA } from "@/components/finstap-auth-layout"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { PasswordInput } from "@/components/ui/password-input"
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { toastProcessing, toastDone, toastFail } from "@/lib/toastActions"
import { toast } from "@/components/ui/toast"
import { homePath } from "@/lib/permissions"
import { getApiBase } from "@/lib/api"
import { getDeviceId } from "@/lib/device"
import { LoginCodeStep } from "@/components/login-code-step"
import {
  getWorkspace,
  normalizeSlug,
  onSharedHost,
  setWorkspace,
  sharedUrl,
  subdomainWorkspace,
  workspaceHeaders,
  workspaceUrl,
} from "@/lib/workspace"

/**
 * Finstap login, in one of three forms:
 *  - on a company's own subdomain (acme.finstap.com): email and password only
 *  - on the shared address with subdomains on (finstap.com): "find your workspace", then go there
 *  - subdomains off: workspace, email and password (?workspace=acme fills it in)
 */
export function FinstapLoginForm() {
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const fixedWorkspace = subdomainWorkspace()
  const findMode = onSharedHost()
  const [workspace, setWorkspaceInput] = useState(
    () => fixedWorkspace || normalizeSlug(params.get("workspace")) || getWorkspace()
  )
  const [workspaceName, setWorkspaceName] = useState("")
  const [workspaceError, setWorkspaceError] = useState("")
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [error, setError] = useState("")
  const [isLoading, setIsLoading] = useState(false)
  // Second step: the emailed login code ({ challenge, emailHint, resendAfter, slug } while shown)
  const [codeStep, setCodeStep] = useState(null)

  /** Keep the session from a successful login (password, or password + emailed code) and go home. */
  const finishLogin = (data, slug) => {
    const token = data.data?.token || data.token
    const user = data.data?.user || data.user
    if (!token) return false
    const skipped = data.data?.otp_skipped_reason
    if (skipped) {
      // The code email could not go out, so the server let this sign-in through without one
      toast.warning("Signed in without a login code", {
        description: `The login code email could not be sent: ${skipped}. Ask your admin to fix the email settings.`,
        duration: 20000,
      })
    }
    setWorkspace(slug)
    localStorage.setItem("token", token)
    localStorage.setItem("user", JSON.stringify(user || { email }))
    navigate(homePath(user || {}))
    return true
  }

  // Show which company the user is signing in to, as soon as the workspace is known
  useEffect(() => {
    const slug = normalizeSlug(workspace)
    setWorkspaceName("")
    setWorkspaceError("")
    if (slug.length < 3) return
    const ctrl = new AbortController()
    const timer = setTimeout(async () => {
      try {
        const res = await fetch(`${getApiBase()}/platform/workspace?slug=${encodeURIComponent(slug)}`, {
          signal: ctrl.signal,
        })
        const data = await res.json().catch(() => ({}))
        if (res.ok) setWorkspaceName(data.data?.workspace?.name || "")
        else setWorkspaceError("No workspace with this name. Check the spelling or create a new one.")
      } catch (err) {
        if (err.name !== "AbortError") setWorkspaceError("")
      }
    }, 350)
    return () => {
      clearTimeout(timer)
      ctrl.abort()
    }
  }, [workspace])

  const handleSubmit = async (e) => {
    e.preventDefault()
    const slug = normalizeSlug(workspace)
    if (!slug) {
      setError("Enter your workspace.")
      return
    }
    if (findMode) {
      // The company signs in on its own address
      if (!workspaceName) {
        setError("No workspace with this name. Check the spelling or create a new one.")
        return
      }
      setWorkspace(slug)
      window.location.assign(workspaceUrl(slug, "/login"))
      return
    }
    setError("")
    setIsLoading(true)
    const toastId = toastProcessing("Signing in…")
    try {
      const res = await fetch(`${getApiBase()}/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...workspaceHeaders(slug) },
        credentials: "include",
        body: JSON.stringify({ email, password, device_id: getDeviceId() }),
      })
      const data = await res.json().catch(() => ({}))
      if (res.ok && data.data?.otp_required) {
        // Password right, new browser (or 24 hours passed): ask for the emailed code
        toastDone(toastId, "We emailed you a login code")
        setCodeStep({ challenge: data.data.challenge, emailHint: data.data.email_hint,
                      resendAfter: data.data.resend_after, slug })
        return
      }
      if (res.ok && finishLogin(data, slug)) {
        toastDone(toastId, "Logged in successfully")
        return
      }
      const msg = data.message || data.error || "Invalid email or password."
      setError(msg)
      toastFail(toastId, msg)
    } catch {
      const msg = "Failed to connect to server. Please check your connection."
      setError(msg)
      toastFail(toastId, msg)
    } finally {
      setIsLoading(false)
    }
  }

  const slug = normalizeSlug(workspace)

  // Signup lives on the shared address; from a company subdomain it is a full page link
  const linkClass = "font-semibold text-[#5f5cff] underline-offset-4 hover:underline dark:text-[#8b8aff]"
  const signupLink = fixedWorkspace ? (
    <a href={sharedUrl("/signup")} className={linkClass}>
      Sign up
    </a>
  ) : (
    <Link to="/signup" className={linkClass}>
      Sign up
    </Link>
  )

  // acme.finstap.com for a company that does not exist
  if (fixedWorkspace && workspaceError) {
    return (
      <AuthLayout title="Workspace not found" subtitle={`There is no Finstap workspace called "${fixedWorkspace}".`}>
        <FieldGroup>
          <Button className={FINSTAP_CTA} onClick={() => window.location.assign(sharedUrl("/login"))}>
            Find your workspace
          </Button>
          <p className="text-center text-sm text-muted-foreground">Don&apos;t have an account? {signupLink}</p>
        </FieldGroup>
      </AuthLayout>
    )
  }

  if (codeStep) {
    return (
      <AuthLayout
        title="Check your email"
        subtitle={`We sent a 6-digit login code to ${codeStep.emailHint}. This browser will not ask again for 24 hours.`}
      >
        <LoginCodeStep
          heading={false}
          apiUrl={getApiBase()}
          challenge={codeStep.challenge}
          emailHint={codeStep.emailHint}
          resendAfter={codeStep.resendAfter}
          headers={workspaceHeaders(codeStep.slug)}
          onSuccess={(data) => finishLogin(data, codeStep.slug)}
          onBack={() => {
            setCodeStep(null)
            setPassword("")
          }}
        />
      </AuthLayout>
    )
  }

  return (
    <AuthLayout
      title={findMode ? "Find your workspace" : "Welcome Back!"}
      subtitle={
        findMode
          ? "Enter your company's workspace name to sign in"
          : workspaceName
            ? `Please enter your details to sign in to ${workspaceName}`
            : "Please enter your details"
      }
      footer={<>Don&apos;t have an account? {signupLink}</>}
    >
      <form onSubmit={handleSubmit}>
        <FieldGroup>
          {error && (
            <Alert variant="destructive">
              <IconAlertCircle className="size-4" />
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}
          {/* On a company subdomain the address already names the workspace */}
          {!fixedWorkspace && (
          <Field>
            <FieldLabel htmlFor="workspace">Workspace</FieldLabel>
            <div className="relative">
              <IconBuildingStore className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                id="workspace"
                className="pl-9"
                placeholder="your-company"
                autoCapitalize="none"
                autoCorrect="off"
                required
                value={workspace}
                onChange={(e) => setWorkspaceInput(e.target.value)}
                disabled={isLoading}
              />
            </div>
            {workspaceName ? (
              <FieldDescription className="flex items-center gap-1.5 text-emerald-600 dark:text-emerald-400">
                <IconCircleCheck className="size-4" /> {workspaceName}
              </FieldDescription>
            ) : workspaceError ? (
              <FieldDescription className="text-destructive">{workspaceError}</FieldDescription>
            ) : (
              <FieldDescription>The workspace name you chose when you signed up.</FieldDescription>
            )}
          </Field>
          )}
          {findMode ? (
            <Field>
              <Button type="submit" className={FINSTAP_CTA}>
                Continue <IconArrowRight className="size-4" />
              </Button>
            </Field>
          ) : (
          <>
          <Field>
            <FieldLabel htmlFor="email">Email</FieldLabel>
            <Input
              id="email"
              type="email"
              placeholder="you@company.com"
              autoComplete="username"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              disabled={isLoading}
            />
          </Field>
          <Field>
            <div className="flex items-center">
              <FieldLabel htmlFor="password">Password</FieldLabel>
              <Link
                to={slug ? `/forgot-password?workspace=${encodeURIComponent(slug)}` : "/forgot-password"}
                className="ml-auto text-sm underline-offset-2 hover:underline"
              >
                Forgot your password?
              </Link>
            </div>
            <PasswordInput
              id="password"
              autoComplete="current-password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              disabled={isLoading}
            />
          </Field>
          <Field>
            <Button type="submit" disabled={isLoading} className={FINSTAP_CTA}>
              {isLoading ? "Logging in..." : "Login"}
              {!isLoading && <IconArrowRight className="size-4" />}
            </Button>
          </Field>
          </>
          )}
        </FieldGroup>
      </form>
    </AuthLayout>
  )
}
