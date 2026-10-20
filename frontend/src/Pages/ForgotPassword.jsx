import { useState } from "react"
import { Link, useSearchParams } from "react-router-dom"
import { IS_FINSTAP, getWorkspace, normalizeSlug, workspaceHeaders } from "@/lib/workspace"
import { IconAlertCircle, IconMailCheck } from "@tabler/icons-react"
import { AuthLayout } from "@/components/auth-layout"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field"
import { Alert, AlertDescription } from "@/components/ui/alert"

const apiUrl = import.meta.env.VITE_API_URL || "/api"

export default function ForgotPassword() {
  const [params] = useSearchParams()
  // Finstap: the reset is for one workspace (from the login page link, or remembered)
  const [workspace, setWorkspaceInput] = useState(() => normalizeSlug(params.get("workspace")) || getWorkspace())
  const [email, setEmail] = useState("")
  const [error, setError] = useState("")
  const [sentTo, setSentTo] = useState("")
  const [isLoading, setIsLoading] = useState(false)

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError("")
    setIsLoading(true)
    try {
      const res = await fetch(`${apiUrl}/auth/forgot-password`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...workspaceHeaders(normalizeSlug(workspace)) },
        credentials: "include",
        body: JSON.stringify({ email }),
      })
      const data = await res.json().catch(() => ({}))
      if (res.ok) {
        setSentTo(email.trim())
      } else {
        setError(data.message || data.error || "Could not send the reset link. Please try again.")
      }
    } catch {
      setError("Failed to connect to server. Please check your connection.")
    } finally {
      setIsLoading(false)
    }
  }

  // The server answers the same for unknown emails, so the message never confirms an account exists
  if (sentTo) {
    return (
      <AuthLayout title="Check your email">
        <FieldGroup>
          <Alert>
            <IconMailCheck className="size-4" />
            <AlertDescription>
              If <span className="font-medium text-foreground">{sentTo}</span> is registered, we have
              sent a link to reset your password. The link works for 2 hours.
            </AlertDescription>
          </Alert>
          <Field>
            <Button variant="outline" onClick={() => setSentTo("")}>
              Use a different email
            </Button>
          </Field>
          <Link to="/login" className="text-center text-sm underline-offset-4 hover:underline">
            Back to login
          </Link>
        </FieldGroup>
      </AuthLayout>
    )
  }

  return (
    <AuthLayout title="Forgot your password?" subtitle="Enter your email and we will send you a reset link">
      <form onSubmit={handleSubmit}>
        <FieldGroup>
          {error && (
            <Alert variant="destructive">
              <IconAlertCircle className="size-4" />
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}
          {IS_FINSTAP && (
            <Field>
              <FieldLabel htmlFor="workspace">Workspace</FieldLabel>
              <Input
                id="workspace"
                placeholder="your-company"
                autoCapitalize="none"
                required
                value={workspace}
                onChange={(e) => setWorkspaceInput(e.target.value)}
                disabled={isLoading}
              />
            </Field>
          )}
          <Field>
            <FieldLabel htmlFor="email">Email</FieldLabel>
            <Input
              id="email"
              type="email"
              placeholder="you@example.com"
              required
              autoFocus
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              disabled={isLoading}
            />
          </Field>
          <Field>
            <Button type="submit" disabled={isLoading}>
              {isLoading ? "Sending..." : "Send reset link"}
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
