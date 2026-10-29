import { useState } from "react"
import { Link, useNavigate, useSearchParams } from "react-router-dom"
import { IconAlertCircle } from "@tabler/icons-react"
import { toast } from "sonner"
import { AuthLayout } from "@/components/auth-layout"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { getWorkspace, normalizeSlug, setWorkspace, workspaceHeaders } from "@/lib/workspace"
import { useFormErrors } from "@/lib/validation"
import { FieldMessage, invalidProps } from "@/components/FormField"

const apiUrl = import.meta.env.VITE_API_URL || "/api"
const MIN_PASSWORD_LEN = 8
const RESET_SCHEMA = {
  password: { label: "Password", required: true, minLength: MIN_PASSWORD_LEN },
  confirm: { label: "Confirm password", required: true, match: "password", matchMessage: "Passwords do not match." },
}

// Opened from the emailed link: /reset-password?token=... (&workspace=acme on Finstap)
export default function ResetPassword() {
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const token = params.get("token") || ""
  const workspace = normalizeSlug(params.get("workspace")) || getWorkspace()
  const [password, setPassword] = useState("")
  const [confirm, setConfirm] = useState("")
  const [error, setError] = useState("")
  const { errors, check } = useFormErrors(RESET_SCHEMA)
  const [websiteUrl, setWebsiteUrl] = useState("")
  const [isLoading, setIsLoading] = useState(false)

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError("")
    setWebsiteUrl("")
    if (!check({ password, confirm })) return
    setIsLoading(true)
    try {
      const res = await fetch(`${apiUrl}/auth/reset-password`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...workspaceHeaders(workspace) },
        credentials: "include",
        body: JSON.stringify({ token, password, confirm_password: confirm }),
      })
      const data = await res.json().catch(() => ({}))
      if (res.ok) {
        toast.success("Password updated. You can now sign in.")
        if (workspace) setWorkspace(workspace)
        navigate(workspace ? `/login?workspace=${encodeURIComponent(workspace)}` : "/login", { replace: true })
        return
      }
      setError(data.message || data.error || "Could not reset the password. Please try again.")
      setWebsiteUrl(data.details?.login_target === "website" ? data.details.website_url || "" : "")
    } catch {
      setError("Failed to connect to server. Please check your connection.")
    } finally {
      setIsLoading(false)
    }
  }

  if (!token) {
    return (
      <AuthLayout title="Reset link is missing">
        <FieldGroup>
          <Alert variant="destructive">
            <IconAlertCircle className="size-4" />
            <AlertDescription>Open the link from your email again, or request a new one.</AlertDescription>
          </Alert>
          <Field>
            <Button onClick={() => navigate("/forgot-password")}>Request a new link</Button>
          </Field>
          <Link to="/login" className="text-center text-sm underline-offset-4 hover:underline">
            Back to login
          </Link>
        </FieldGroup>
      </AuthLayout>
    )
  }

  return (
    <AuthLayout title="Set a new password" subtitle="Enter a new password for your account">
      <form onSubmit={handleSubmit} noValidate>
        <FieldGroup>
          {error && (
            <Alert variant="destructive">
              <IconAlertCircle className="size-4" />
              <AlertDescription>
                {error}
                {/expired|invalid/i.test(error) && (
                  <Link to="/forgot-password" className="mt-1 block font-semibold underline">
                    Request a new link
                  </Link>
                )}
                {websiteUrl && (
                  <a href={websiteUrl} className="mt-1 block font-semibold underline">
                    Reset it on the website
                  </a>
                )}
              </AlertDescription>
            </Alert>
          )}
          <Field>
            <FieldLabel htmlFor="password">New password</FieldLabel>
            <Input
              id="password"
              {...invalidProps(errors, 'password', '')}
              type="password"
              autoFocus
              autoComplete="new-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              disabled={isLoading}
            />
            <FieldMessage id="password-error" message={errors.password} />
            <FieldDescription>At least {MIN_PASSWORD_LEN} characters.</FieldDescription>
          </Field>
          <Field>
            <FieldLabel htmlFor="confirm">Confirm new password</FieldLabel>
            <Input
              id="confirm"
              {...invalidProps(errors, 'confirm', '')}
              type="password"
              autoComplete="new-password"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              disabled={isLoading}
            />
            <FieldMessage id="confirm-error" message={errors.confirm} />
          </Field>
          <Field>
            <Button type="submit" disabled={isLoading}>
              {isLoading ? "Saving..." : "Update password"}
            </Button>
          </Field>
          <Link to="/login" className="text-center text-sm underline-offset-4 hover:underline">
            Back to login
          </Link>
        </FieldGroup>
      </form>
    </AuthLayout>
  )
}
