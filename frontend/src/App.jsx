import React from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import Login from './Pages/Login'
import ForgotPassword from './Pages/ForgotPassword'
import ResetPassword from './Pages/ResetPassword'
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
import EmailLog from './Pages/EmailLog/EmailLog'
import Tickets from './Pages/Tickets/Tickets'
import SmartOperations from './Pages/SmartOperations/SmartOperations'
import Sso from './Pages/Sso'
import Settings from './Pages/Settings/Settings'
import NotificationsPage from './Pages/Notifications/Notifications'
import Performance, { StaffDashboard } from './Pages/Performance/Performance'
import PageGuard from './components/PageGuard'
import { isStaffRole, homePath, isManagerOrAbove } from './lib/permissions'
import ClientLayout from './Layout/ClientLayout'
import PortalDashboard from './Pages/Portal/PortalDashboard'
import PortalCompanies from './Pages/Portal/PortalCompanies'
import PortalOrders from './Pages/Portal/PortalOrders'
import PortalInvoices from './Pages/Portal/PortalInvoices'
import PortalDocuments from './Pages/Portal/PortalDocuments'
import PortalSupport, { PortalMessages } from './Pages/Portal/PortalSupport'
import { PortalServices, PortalAddresses, PortalAccountancy } from './Pages/Portal/PortalMisc'

// "/" sends each user to their own home (customers -> portal, team -> CRM)
function HomeRedirect() {
  return <Navigate to={homePath()} replace />
}

// Team is the members list (admins and managers); tasks moved to Smart Operations → GOV Forms,
// so staff (and old task links) land there
function TeamPage() {
  return isManagerOrAbove() ? <Tasks view="team" /> : <Navigate to="/admin/smart-operations?tab=gov-forms" replace />
}

// Staff land on their own work; admins and managers get the company overview (money stays admin-only)
function DashboardHome() {
  return isStaffRole() ? <StaffDashboard /> : <Dashboard />
}
import ToastPlayground from './Pages/ToastPlayground'
import { TooltipProvider } from './components/ui/tooltip'
import { MotionRoot } from './lib/motion'
import { ThemeProvider } from './hooks/theme-provider'
import { PrivacyProvider } from './context/PrivacyContext'
import { Toaster } from './components/ui/sonner'

const App = () => {
  return (
    <ThemeProvider defaultTheme="light" storageKey="vite-ui-theme">
      <PrivacyProvider>
        <TooltipProvider>
          <MotionRoot>
          <BrowserRouter>
            <Routes>
            <Route path="/" element={<HomeRedirect />} />
            
            {/* Public Login Route */}
            <Route
              path="/login"
              element={
                <PublicRoute>
                  <Login />
                </PublicRoute>
              }
            />
            
            {/* Password reset: request a link, then set a new password from the emailed link */}
            <Route
              path="/forgot-password"
              element={
                <PublicRoute>
                  <ForgotPassword />
                </PublicRoute>
              }
            />
            <Route path="/reset-password" element={<ResetPassword />} />

            {/* Sign-in handed over from the Brixen website (B2B accounts) */}
            <Route path="/sso" element={<Sso />} />

            {/* SignUp disabled for now */}
            {/* <Route path="/signup" element={<SignUp />} /> */}
            <Route path="/signup" element={<Navigate to="/login" replace />} />

            {/* Protected Admin Routes (Requires Login) */}
            <Route element={<ProtectedRoute />}>
              {/* Customer portal (CLIENT role), same sections as the old portal */}
              <Route path="/portal" element={<ClientLayout />}>
                <Route index element={<Navigate to="dashboard" replace />} />
                <Route path="dashboard" element={<PortalDashboard />} />
                <Route path="companies" element={<PortalCompanies />} />
                <Route path="accountancy" element={<PortalAccountancy />} />
                <Route path="addresses" element={<PortalAddresses />} />
                <Route path="orders" element={<PortalOrders />} />
                <Route path="invoices" element={<PortalInvoices />} />
                <Route path="payments" element={<Navigate to="/portal/invoices" replace />} />
                <Route path="documents" element={<PortalDocuments />} />
                <Route path="services" element={<PortalServices />} />
                <Route path="support" element={<PortalSupport />} />
                <Route path="messages" element={<PortalMessages />} />
                <Route path="profile" element={<Settings />} />
                <Route path="notifications" element={<NotificationsPage />} />
              </Route>
              <Route path="/admin" element={<AdminLayout />}>
                <Route index element={<Navigate to="dashboard" replace />} />
                <Route path="dashboard" element={<DashboardHome />} />
                <Route path="performance" element={<Performance />} />
                <Route path="customers" element={<PageGuard page="customers"><Customers /></PageGuard>} />
                <Route path="companies" element={<Companies />} />
                <Route path="accountancy" element={<PageGuard page="accountancy"><Accountancy /></PageGuard>} />
                <Route path="orders" element={<PageGuard page="orders"><Orders /></PageGuard>} />
                <Route path="tasks" element={<TeamPage />} />
                <Route path="services" element={<PageGuard page="services"><Services /></PageGuard>} />
                <Route path="payments" element={<PageGuard page="payments"><Payments /></PageGuard>} />
                <Route path="documents" element={<PageGuard page="documents"><Documents /></PageGuard>} />
                <Route path="intake" element={<PageGuard page="intake"><Intake /></PageGuard>} />
                <Route path="logs" element={<PageGuard page="logs"><AuditLogs /></PageGuard>} />
                <Route path="email-log" element={<PageGuard page="email-log"><EmailLog /></PageGuard>} />
                <Route path="tickets" element={<PageGuard page="tickets"><Tickets /></PageGuard>} />
                <Route path="smart-operations" element={<PageGuard page="smart-operations"><SmartOperations /></PageGuard>} />
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
          </MotionRoot>
        <Toaster position="top-center" />
        </TooltipProvider>
      </PrivacyProvider>
    </ThemeProvider>
  )
}

export default App