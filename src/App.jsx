import React from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import Login from './Pages/Login'
// import SignUp from './Pages/SignUp'
import { ProtectedRoute, PublicRoute } from './components/ProtectedRoute'
import AdminLayout from './Layout/AdminLayout'
import Dashboard from './Pages/Dasboard'
import Customers from './Pages/Customer/Customers'
import Companies from './Pages/Companies/Companies'
import ComingSoon from './Pages/ComingSoon'
import { TooltipProvider } from './components/ui/tooltip'
import { ThemeProvider } from './hooks/theme-provider'

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
                
                {/* Coming Soon Pages */}
                <Route path="accountancy" element={<ComingSoon />} />
                <Route path="orders" element={<ComingSoon />} />
                <Route path="tasks" element={<ComingSoon />} />
                <Route path="services" element={<ComingSoon />} />
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
      </TooltipProvider>
    </ThemeProvider>
  )
}

export default App