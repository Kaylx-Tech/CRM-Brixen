import { useEffect } from 'react'

// After the first page is on screen, the other pages a user can open load quietly one by one,
// so moving around the CRM / portal does not wait for the (slow) server each time
const PORTAL_PAGES = [
  () => import('@/Pages/Settings/Settings'),
  () => import('@/Pages/Notifications/Notifications'),
  () => import('@/Pages/Portal/PortalDashboard'),
  () => import('@/Pages/Portal/PortalCompanies'),
  () => import('@/Pages/Portal/PortalOrders'),
  () => import('@/Pages/Portal/PortalInvoices'),
  () => import('@/Pages/Portal/PortalDocuments'),
  () => import('@/Pages/Portal/PortalSupport'),
  () => import('@/Pages/Portal/PortalMisc'),
]

const ADMIN_PAGES = [
  () => import('@/Pages/Dasboard'),
  () => import('@/Pages/Customer/Customers'),
  () => import('@/Pages/Companies/Companies'),
  () => import('@/Pages/Accountancy/Accountancy'),
  () => import('@/Pages/Orders/Orders'),
  () => import('@/Pages/Tasks/Tasks'),
  () => import('@/Pages/Services/Services'),
  () => import('@/Pages/Payments/Payments'),
  () => import('@/Pages/Documents/Documents'),
  () => import('@/Pages/Intake/Intake'),
  () => import('@/Pages/AuditLogs/AuditLogs'),
  () => import('@/Pages/EmailLog/EmailLog'),
  () => import('@/Pages/Tickets/Tickets'),
  () => import('@/Pages/SmartOperations/SmartOperations'),
  () => import('@/Pages/Settings/Settings'),
  () => import('@/Pages/Notifications/Notifications'),
  () => import('@/Pages/Performance/Performance'),
  () => import('@/components/PageGuard'),
]

/** Call from a layout: once it is on screen, load that side's other pages in the background. */
export function usePrefetchPages(side) {
  useEffect(() => {
    const timer = setTimeout(() => {
      const pages = side === 'portal' ? PORTAL_PAGES : ADMIN_PAGES
      pages.reduce((done, load) => done.then(() => load().catch(() => {})), Promise.resolve())
    }, 2500)
    return () => clearTimeout(timer)
  }, [side])
}
