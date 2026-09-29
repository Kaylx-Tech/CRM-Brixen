import React from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import Login from './Pages/Login'
// import SignUp from './Pages/SignUp'
import { ProtectedRoute, PublicRoute } from './components/ProtectedRoute'
import AdminLayout from './Layout/AdminLayout'
import Dashboard from './Pages/Dasboard'
import Customers from './Pages/Customer/Customers'
import Companies from './Pages/Companies/Companies'
import Accountancy from './Pages/Accountancy/Accountancy'
import Orders from './Pages/Orders/Orders'
import Tasks from './Pages/Tasks/Tasks'
import Services from './Pages/Services/Services'
import ComingSoon from './Pages/ComingSoon'
import { TooltipProvider } from './components/ui/tooltip'
import { ThemeProvider } from './hooks/theme-provider'
import { Toaster } from './components/ui/sonner'

const App = () => {
  return (
    <ThemeProvider defaultTheme="light" storageKey="vite-ui-theme">
      <TooltipProvider>
        <BrowserRouter>
          <Routes>
            <Route path="/" element={<Navigate to="/admin/dashboard" replace />} />
            
            {/* Public Login Route */}
            <Route
              path="/login"
              element={
                <PublicRoute>
                  <Login />
                </PublicRoute>
              }
            />
            
            {/* SignUp disabled for now */}
            {/* <Route path="/signup" element={<SignUp />} /> */}
            <Route path="/signup" element={<Navigate to="/login" replace />} />

            {/* Protected Admin Routes (Requires Login) */}
            <Route element={<ProtectedRoute />}>
              <Route path="/admin" element={<AdminLayout />}>
                <Route index element={<Navigate to="dashboard" replace />} />
                <Route path="dashboard" element={<Dashboard />} />
                <Route path="customers" element={<Customers />} />
                <Route path="companies" element={<Companies />} />
                <Route path="accountancy" element={<Accountancy />} />
                <Route path="orders" element={<Orders />} />
                <Route path="tasks" element={<Tasks />} />
                <Route path="services" element={<Services />} />
                <Route path="payments" element={<ComingSoon />} />
                <Route path="documents" element={<ComingSoon />} />
                <Route path="intake" element={<ComingSoon />} />
                <Route path="logs" element={<ComingSoon />} />
                <Route path="settings" element={<ComingSoon />} />
                <Route path="profile" element={<ComingSoon />} />
              </Route>
            </Route>

            {/* Catch-all fallback */}
            <Route path="*" element={<Navigate to="/login" replace />} />
          </Routes>
        </BrowserRouter>
        <Toaster richColors closeButton position="top-right" />
      </TooltipProvider>
    </ThemeProvider>
  )
}

export default App