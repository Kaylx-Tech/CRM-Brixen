import { useEffect, useRef, useState } from "react"
import { useNavigate, useSearchParams } from "react-router-dom"
import { IconAlertCircle, IconLoader2 } from "@tabler/icons-react"
import { AuthLayout } from "@/components/auth-layout"
import { Button } from "@/components/ui/button"
import { FieldGroup } from "@/components/ui/field"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { homePath } from "@/lib/permissions"
import { getApiBase } from "@/lib/api"
import { setWorkspace } from "@/lib/workspace"

/**
 * acme.finstap.com/welcome?code=… — reached straight after signup on finstap.com.
 * Browsers keep logins per address, so the new session arrives as a one-time code and is swapped here.
 */
export default function FinstapWelcome() {
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const [error, setError] = useState("")
  const started = useRef(false)

  useEffect(() => {
    if (started.current) return // the code works once; StrictMode runs effects twice in development
    started.current = true
    const code = params.get("code") || ""
    ;(async () => {
      try {
        const res = await fetch(`${getApiBase()}/platform/handoff`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({ code }),
        })
        const data = await res.json().catch(() => ({}))
        const payload = data.data || {}
        if (res.ok && payload.token) {
          setWorkspace(payload.workspace?.slug)
          localStorage.setItem("token", payload.token)
          localStorage.setItem("user", JSON.stringify(payload.user || {}))
          navigate(homePath(payload.user || {}), { replace: true })
          return
        }
        setError(data.message || data.error || "This sign-in link has expired. Please log in.")
      } catch {
        setError("Failed to connect to server. Please check your connection.")
      }
    })()
  }, [navigate, params])

  if (!error) {
    return (
      <AuthLayout title="Setting up your workspace" subtitle="Signing you in…">
        <div className="flex justify-center py-6">
          <IconLoader2 className="size-8 animate-spin text-primary" />
        </div>
      </AuthLayout>
    )
  }

  return (
    <AuthLayout title="Please sign in" subtitle="Your workspace is ready.">
      <FieldGroup>
        <Alert variant="destructive">
          <IconAlertCircle className="size-4" />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
        <Button onClick={() => navigate("/login", { replace: true })}>Go to login</Button>
      </FieldGroup>
    </AuthLayout>
  )
}
