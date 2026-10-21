import { useEffect, useState } from "react"
import { Link, useNavigate, useSearchParams } from "react-router-dom"
import { IconAlertCircle, IconBuildingStore, IconCircleCheck } from "@tabler/icons-react"
import { AuthLayout } from "@/components/auth-layout"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { toastProcessing, toastDone, toastFail } from "@/lib/toastActions"
import { homePath } from "@/lib/permissions"
import { getApiBase } from "@/lib/api"
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
        body: JSON.stringify({ email, password }),
      })
      const data = await res.json().catch(() => ({}))
      const token = data.data?.token || data.token
      const user = data.data?.user || data.user
      if (res.ok && token) {
        setWorkspace(slug)
        localStorage.setItem("token", token)
        localStorage.setItem("user", JSON.stringify(user || { email }))
        toastDone(toastId, "Logged in successfully")
        navigate(homePath(user || {}))
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
  const signupLink = fixedWorkspace ? (
    <a href={sharedUrl("/signup")} className="font-semibold text-primary underline-offset-4 hover:underline">
      Create your workspace
    </a>
  ) : (
    <Link to="/signup" className="font-semibold text-primary underline-offset-4 hover:underline">
      Create your workspace
    </Link>
  )

  // acme.finstap.com for a company that does not exist
  if (fixedWorkspace && workspaceError) {
    return (
      <AuthLayout title="Workspace not found" subtitle={`There is no Finstap workspace called "${fixedWorkspace}".`}>
        <FieldGroup>
          <Button onClick={() => window.location.assign(sharedUrl("/login"))}>Find your workspace</Button>
          <p className="text-center text-sm text-muted-foreground">New to Finstap? {signupLink}</p>
        </FieldGroup>
      </AuthLayout>
    )
  }

  return (
    <AuthLayout
      title={findMode ? "Find your workspace" : "Welcome back"}
      subtitle={
        findMode
          ? "Enter your company's workspace name to sign in"
          : workspaceName
            ? `Sign in to ${workspaceName}`
            : "Sign in to your workspace"
      }
      footer={<p className="text-sm text-muted-foreground">New to Finstap? {signupLink}</p>}
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
              <Button type="submit">Continue</Button>
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
            <Input
              id="password"
              type="password"
              autoComplete="current-password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              disabled={isLoading}
            />
          </Field>
          <Field>
            <Button type="submit" disabled={isLoading}>
              {isLoading ? "Logging in..." : "Login"}
            </Button>
          </Field>
          </>
          )}
        </FieldGroup>
      </form>
    </AuthLayout>
  )
}
