import React from 'react'
import { Navigate, Outlet } from 'react-router-dom'
import { homePath } from '@/lib/permissions'

export const ProtectedRoute = () => {
  const user = localStorage.getItem('user')
  
  if (!user) {
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