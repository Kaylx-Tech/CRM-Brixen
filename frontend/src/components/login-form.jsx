import { cn } from "cn"
import whiteLogo from "../assets/white-logo.webp"

import { Button } from "@/components/ui/button"
import {
  Field,
  FieldDescription,
  FieldGroup,
  FieldLabel,
  FieldSeparator,
} from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { PasswordInput } from "@/components/ui/password-input"
import { Link, useNavigate } from "react-router-dom"
import { useState } from "react"
import { Alert, AlertDescription } from "./ui/alert"
import { IconAlertCircle } from "@tabler/icons-react"
import { toast } from "sonner"
import { toastProcessing, toastDone, toastFail } from "@/lib/toastActions"
import { homePath } from "@/lib/permissions"

export function LoginForm({ className, ...props }) {
  const navigate = useNavigate()
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [error, setError] = useState("")
  const [websiteUrl, setWebsiteUrl] = useState("")
  const [isLoading, setIsLoading] = useState(false)

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError("")
    setWebsiteUrl("")
    setIsLoading(true)
    const toastId = toastProcessing("Signing in…")

    try {
      const apiUrl = import.meta.env.VITE_API_URL || "/api"
      const res = await fetch(`${apiUrl}/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ email, password }),
      })

      const data = await res.json()

      // Robustly extract token from all possible backend response shapes:
      // { token } | { data: { token } } | { session_token } | { data: { session_token } }
      const isSuccess = data.status === "success" || data.success === true || res.ok
      const nested = data.data || {}
      const token = data.token || nested.token || data.session_token || nested.session_token || null

      const userObj = data.user || nested.user || null

      if (isSuccess && token) {
        localStorage.setItem("token", token)
        localStorage.setItem("user", JSON.stringify(userObj || { email }))
        toastDone(toastId, "Logged in successfully")
        // Customers land on their portal, the team on the CRM
        navigate(homePath(userObj || {}))
      } else if (isSuccess && !token) {
        // Logged in but no token in response — should not happen
        const msg = "Login succeeded but no session token received. Contact support."
        setError(msg)
        toastFail(toastId, msg)
      } else {
        const msg = data.message || data.error || "Invalid email or password."
        setError(msg)
        // Individual / Business customers sign in on the website, not this portal
        setWebsiteUrl(
          data.details?.login_target === "website" ? data.details.website_url || "" : "",
        )
        toastFail(toastId, msg)
      }
    } catch (err) {
      const msg = "Failed to connect to server. Please check your connection."
      setError(msg)
      toastFail(toastId, msg)
    } finally {
      setIsLoading(false)
    }
  }

  return (
    // Full screen split: brand panel fills the left half, the form sits in the right half
    <div className={cn("grid min-h-screen w-full md:grid-cols-2", className)} {...props}>
      <div className="relative hidden md:flex flex-col justify-center p-12 lg:p-16 bg-linear-to-br from-slate-900 via-blue-900 to-blue-950 text-white">
        <div className="max-w-[480px] space-y-4">
          <img src={whiteLogo} alt="Brixen Logo" className="w-auto mb-6 h-16" />
          <h1 className="text-3xl sm:text-4xl font-extrabold tracking-tight leading-[1.2]">
            Grow your practice with
            <br />
            the Brixen portal
          </h1>
          <p className="text-md text-blue-100/80">
            Access your CRM dashboard to track orders, manage clients, and run compliance work in
            one place.
          </p>
        </div>
      </div>
      <div className="flex flex-col items-center justify-center gap-6 p-6 md:p-10">
        <form className="w-full max-w-sm" onSubmit={handleSubmit}>
          <FieldGroup>
            <div className="flex flex-col py-8 items-center gap-2 text-center">
              <h1 className="text-2xl font-bold">Welcome back</h1>
              <p className="text-balance text-muted-foreground">Login to your account</p>
            </div>

            {error && (
              <Alert variant="destructive">
                <IconAlertCircle className="size-4" />
                <AlertDescription>
                  {error}
                  {websiteUrl ? (
                    <a href={websiteUrl} className="mt-1 block font-semibold underline">
                      Sign in on the Brixen website
                    </a>
                  ) : null}
                </AlertDescription>
              </Alert>
            )}

            <Field>
              <FieldLabel htmlFor="email">Email</FieldLabel>
              <Input
                id="email"
                type="email"
                placeholder="admin@brixenconsultants.com"
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
                  to="/forgot-password"
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
              <Button type="submit" disabled={isLoading}>
                {isLoading ? "Logging in..." : "Login"}
              </Button>
            </Field>
            {/* <FieldDescription className="text-center">
                Don&apos;t have an account? <Link to="/signup">Sign up</Link>
              </FieldDescription> */}
          </FieldGroup>
        </form>

        <a
          href="https://brixenconsultants.com"
          className="font-medium underline-offset-4 hover:underline text-[color:var(--chart-4)]"
          target="_blank"
        >
          Visit Our Website
        </a>

        <FieldDescription className="px-6 text-center">
          © 2026 Brixen Consultants Ltd. All rights reserved.
        </FieldDescription>
      </div>
    </div>
  )
}
