import { cn } from "cn"
import whiteLogo from "../assets/white-logo.webp"

import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import {
  Field,
  FieldDescription,
  FieldGroup,
  FieldLabel,
  FieldSeparator,
} from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Link, useNavigate } from "react-router-dom"
import { useState } from "react"
import { Alert, AlertDescription } from "./ui/alert"
import { IconAlertCircle } from "@tabler/icons-react"

export function LoginForm({
  className,
  ...props
}) {
  const navigate = useNavigate()
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [error, setError] = useState("")
  const [isLoading, setIsLoading] = useState(false)

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError("")
    setIsLoading(true)

    try {
      // Connect to the API using the environment variable
      const res = await fetch(`${import.meta.env.VITE_API_URL}/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ email, password }),
      })
      
      const data = await res.json()

      if (data.status === "success") {
        localStorage.setItem("user", JSON.stringify(data.user || { name: email.split('@')[0], email }))
        navigate("/admin/dashboard")
      } else {
        setError(data.message || "Login failed")
      }
    } catch (err) {
      // If server is offline/dev fallback, allow valid login for demo or show error
      setError("Failed to connect to server. Please check backend connection.")
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className={cn("flex flex-col gap-6 w-full max-w-sm md:max-w-3xl", className)} {...props}>
      <Card className="overflow-hidden p-0">
        <CardContent className="grid p-0 md:grid-cols-2">
           <div className="relative hidden md:flex flex-col justify-center p-10 bg-linear-to-br from-slate-900 via-blue-900 to-blue-950 text-white">
            <div className="max-w-[420px] space-y-4">
              <img src={whiteLogo} alt="Brixen Logo" className="h-10 w-auto mb-6" />
              <h1 className="text-3xl sm:text-4xl font-extrabold tracking-tight leading-[1.2]">
                Grow your practice with<br />the Brixen portal
              </h1>
              <p className="text-md text-blue-100/80">
                Access your CRM dashboard to track orders, manage clients, and run compliance work in one place.
              </p>
            </div>
          </div>
          <form className="p-6 md:p-8" onSubmit={handleSubmit}>
            <FieldGroup>
              <div className="flex flex-col py-8 items-center gap-2 text-center">
                <h1 className="text-2xl font-bold">Welcome back</h1>
                <p className="text-balance text-muted-foreground">
                  Login to your account
                </p>
              </div>

              {error && (
               <Alert variant="destructive">
                <IconAlertCircle className="size-4" />
                <AlertDescription>
                 {error}
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
                  <a
                    href="#"
                    className="ml-auto text-sm underline-offset-2 hover:underline"
                  >
                    Forgot your password?
                  </a>
                </div>
                <Input 
                  id="password" 
                  type="password" 
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
        </CardContent>
      </Card>
      <FieldDescription className="px-6 text-center">
       © 2026 Brixen Consultants Ltd. All rights reserved.
      </FieldDescription>
    </div>
  )
}
