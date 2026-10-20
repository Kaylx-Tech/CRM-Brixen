import { useState } from "react"
import { Link, useNavigate, useSearchParams } from "react-router-dom"
import { IconAlertCircle } from "@tabler/icons-react"
import { toast } from "sonner"
import { AuthLayout } from "@/components/auth-layout"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field"
import { Alert, AlertDescription } from "@/components/ui/alert"

const apiUrl = import.meta.env.VITE_API_URL || "/api"
const MIN_PASSWORD_LEN = 8

// Opened from the emailed link: /reset-password?token=...
export default function ResetPassword() {
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const token = params.get("token") || ""
  const [password, setPassword] = useState("")
  const [confirm, setConfirm] = useState("")
  const [error, setError] = useState("")
  const [websiteUrl, setWebsiteUrl] = useState("")
  const [isLoading, setIsLoading] = useState(false)

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError("")
    setWebsiteUrl("")
    if (password.length < MIN_PASSWORD_LEN) {
      setError(`Password must be at least ${MIN_PASSWORD_LEN} characters.`)
      return
    }
    if (password !== confirm) {
      setError("Passwords do not match.")
      return
    }
    setIsLoading(true)
    try {
      const res = await fetch(`${apiUrl}/auth/reset-password`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ token, password, confirm_password: confirm }),
      })
      const data = await res.json().catch(() => ({}))
      if (res.ok) {
        toast.success("Password updated. You can now sign in.")
        navigate("/login", { replace: true })
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
      <form onSubmit={handleSubmit}>
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
                    Reset it on the Brixen website
                  </a>
                )}
              </AlertDescription>
            </Alert>
          )}
          <Field>
            <FieldLabel htmlFor="password">New password</FieldLabel>
            <Input
              id="password"
              type="password"
              required
              autoFocus
              autoComplete="new-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              disabled={isLoading}
            />
            <FieldDescription>At least {MIN_PASSWORD_LEN} characters.</FieldDescription>
          </Field>
          <Field>
            <FieldLabel htmlFor="confirm">Confirm new password</FieldLabel>
            <Input
              id="confirm"
              type="password"
              required
              autoComplete="new-password"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              disabled={isLoading}
            />
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
