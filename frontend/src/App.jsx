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
import Payments from './Pages/Payments/Payments'
import Documents from './Pages/Documents/Documents'
import Intake from './Pages/Intake/Intake'
import AuditLogs from './Pages/AuditLogs/AuditLogs'
import Settings from './Pages/Settings/Settings'
import NotificationsPage from './Pages/Notifications/Notifications'
import ToastPlayground from './Pages/ToastPlayground'
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
                <Route path="payments" element={<Payments />} />
                <Route path="documents" element={<Documents />} />
                <Route path="intake" element={<Intake />} />
                <Route path="logs" element={<AuditLogs />} />
                <Route path="settings" element={<Settings />} />
                <Route path="notifications" element={<NotificationsPage />} />
                <Route path="profile" element={<Navigate to="/admin/settings?tab=profile" replace />} />
                <Route path="toast-test" element={<ToastPlayground />} />
              </Route>
            </Route>

            {/* Public route for direct test */}
            <Route path="/toast-test" element={<ToastPlayground />} />

            {/* Catch-all fallback */}
            <Route path="*" element={<Navigate to="/login" replace />} />
          </Routes>
        </BrowserRouter>
        <Toaster position="top-center" />
      </TooltipProvider>
    </ThemeProvider>
  )
}

export default App