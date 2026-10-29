import React, { useEffect, useState } from 'react'
import { Navigate, Outlet } from 'react-router-dom'
import { homePath } from '@/lib/permissions'
import { apiRequest } from '@/lib/api'

// Fields that change what a user can see; if the server's copy differs from the saved one, re-render the app
const ACCESS_FIELDS = ['id', 'role', 'department', 'status', 'impersonated']

// The login reply has no `impersonated` flag while /auth/me sends false; both mean "not impersonated"
function accessValue(user, key) {
  return key === 'impersonated' ? String(Boolean(user[key])) : String(user[key] ?? '')
}

function readStoredUser() {
  try {
    return JSON.parse(localStorage.getItem('user') || 'null')
  } catch {
    return null
  }
}

/**
 * Keeps the saved login in step with the server: an expired or revoked session goes back to login, and a
 * changed role / department (or a login saved by an older app version) is refreshed without signing out.
 */
function useSessionSync() {
  const [expired, setExpired] = useState(false)

  useEffect(() => {
    let cancelled = false
    apiRequest('/auth/me', { silent: true, label: 'Session' }).then((res) => {
      if (cancelled) return
      if (res.status === 401) {
        localStorage.removeItem('user')
        localStorage.removeItem('token')
        setExpired(true)
        return
      }
      const fresh = res.ok ? res.data?.data?.user : null
      if (!fresh) return
      const stored = readStoredUser() || {}
      const changed = ACCESS_FIELDS.some((k) => accessValue(stored, k) !== accessValue(fresh, k))
      localStorage.setItem('user', JSON.stringify({ ...stored, ...fresh }))
      if (changed) window.location.replace(window.location.pathname + window.location.search)
    })
    return () => {
      cancelled = true
    }
  }, [])

  return expired
}

export const ProtectedRoute = () => {
  const user = localStorage.getItem('user')
  const expired = useSessionSync()

  if (!user || expired) {
    return <Navigate to="/login" replace />
  }

  return <Outlet />
}

export const PublicRoute = ({ children }) => {
  const user = localStorage.getItem('user')

  if (user) {
    return <Navigate to={homePath()} replace />
  }

  return children
}
