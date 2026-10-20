import { useEffect, useState } from "react"
import { Link, useNavigate } from "react-router-dom"
import { IconAlertCircle, IconCircleCheck, IconLoader2 } from "@tabler/icons-react"
import { AuthLayout } from "@/components/auth-layout"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { toastProcessing, toastDone, toastFail } from "@/lib/toastActions"
import { homePath } from "@/lib/permissions"
import { getApiBase } from "@/lib/api"
import { normalizeSlug, setWorkspace } from "@/lib/workspace"

const MIN_PASSWORD_LEN = 8

/** Finstap signup: a company creates its workspace and its owner account, then lands in the CRM. */
export default function FinstapSignup() {
  const navigate = useNavigate()
  const [companyName, setCompanyName] = useState("")
  const [slug, setSlug] = useState("")
  const [slugEdited, setSlugEdited] = useState(false)
  const [slugState, setSlugState] = useState({ status: "idle", error: "" })
  const [fullName, setFullName] = useState("")
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [error, setError] = useState("")
  const [isLoading, setIsLoading] = useState(false)

  // The workspace name follows the company name until the user types their own
  useEffect(() => {
    if (!slugEdited) setSlug(normalizeSlug(companyName))
  }, [companyName, slugEdited])

  // Live "is this workspace name free?" check
  useEffect(() => {
    const value = normalizeSlug(slug)
    if (value.length < 3) {
      setSlugState({ status: "idle", error: "" })
      return
    }
    setSlugState({ status: "checking", error: "" })
    const ctrl = new AbortController()
    const timer = setTimeout(async () => {
      try {
        const res = await fetch(`${getApiBase()}/platform/check-slug?slug=${encodeURIComponent(value)}`, {
          signal: ctrl.signal,
        })
        const data = (await res.json().catch(() => ({}))).data || {}
        setSlugState(data.available ? { status: "available", error: "" } : { status: "taken", error: data.error || "Not available" })
      } catch (err) {
        if (err.name !== "AbortError") setSlugState({ status: "idle", error: "" })
      }
    }, 400)
    return () => {
      clearTimeout(timer)
      ctrl.abort()
    }
  }, [slug])

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError("")
    if (password.length < MIN_PASSWORD_LEN) {
      setError(`Password must be at least ${MIN_PASSWORD_LEN} characters.`)
      return
    }
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
          slug: normalizeSlug(slug),
          full_name: fullName,
          email,
          password,
        }),
      })
      const data = await res.json().catch(() => ({}))
      const payload = data.data || {}
      if (res.ok && payload.token) {
        setWorkspace(payload.workspace?.slug)
        localStorage.setItem("token", payload.token)
        localStorage.setItem("user", JSON.stringify(payload.user || { email }))
        toastDone(toastId, `Welcome to Finstap, ${payload.workspace?.name || companyName}`)
        navigate(homePath(payload.user || {}), { replace: true })
        return
      }
      const msg = data.message || data.error || "Could not create the workspace. Please try again."
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

  return (
    <AuthLayout
      title="Create your workspace"
      subtitle="Start your free trial. No card needed."
      footer={
        <p className="text-sm text-muted-foreground">
          Already have a workspace?{" "}
          <Link to="/login" className="font-semibold text-primary underline-offset-4 hover:underline">
            Login
          </Link>
        </p>
      }
    >
      <form onSubmit={handleSubmit}>
        <FieldGroup>
          {error && (
            <Alert variant="destructive">
              <IconAlertCircle className="size-4" />
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}
          <Field>
            <FieldLabel htmlFor="company">Company name</FieldLabel>
            <Input
              id="company"
              placeholder="Acme Accountants Ltd"
              required
              autoFocus
              value={companyName}
              onChange={(e) => setCompanyName(e.target.value)}
              disabled={isLoading}
            />
          </Field>
          <Field>
            <FieldLabel htmlFor="slug">Workspace name</FieldLabel>
            <Input
              id="slug"
              placeholder="acme-accountants"
              autoCapitalize="none"
              autoCorrect="off"
              required
              value={slug}
              onChange={(e) => {
                setSlugEdited(true)
                setSlug(e.target.value.toLowerCase())
              }}
              onBlur={() => setSlug((v) => normalizeSlug(v))}
              disabled={isLoading}
            />
            {slugState.status === "checking" ? (
              <FieldDescription className="flex items-center gap-1.5">
                <IconLoader2 className="size-4 animate-spin" /> Checking…
              </FieldDescription>
            ) : slugState.status === "available" ? (
              <FieldDescription className="flex items-center gap-1.5 text-emerald-600 dark:text-emerald-400">
                <IconCircleCheck className="size-4" /> Available. Your team signs in with this name.
              </FieldDescription>
            ) : slugState.status === "taken" ? (
              <FieldDescription className="text-destructive">{slugState.error}</FieldDescription>
            ) : (
              <FieldDescription>Letters, numbers and dashes. Your team signs in with this name.</FieldDescription>
            )}
          </Field>
          <Field>
            <FieldLabel htmlFor="name">Your name</FieldLabel>
            <Input
              id="name"
              autoComplete="name"
              required
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              disabled={isLoading}
            />
          </Field>
          <Field>
            <FieldLabel htmlFor="email">Work email</FieldLabel>
            <Input
              id="email"
              type="email"
              placeholder="you@company.com"
              autoComplete="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              disabled={isLoading}
            />
          </Field>
          <Field>
            <FieldLabel htmlFor="password">Password</FieldLabel>
            <Input
              id="password"
              type="password"
              autoComplete="new-password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              disabled={isLoading}
            />
            <FieldDescription>At least {MIN_PASSWORD_LEN} characters.</FieldDescription>
          </Field>
          <Field>
            <Button type="submit" disabled={isLoading || slugState.status === "taken"}>
              {isLoading ? "Creating workspace..." : "Create workspace"}
            </Button>
          </Field>
        </FieldGroup>
      </form>
    </AuthLayout>
  )
}
