import React from 'react'
import { Link, useLocation } from 'react-router-dom'
import {
  Breadcrumb,
  BreadcrumbList,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbSeparator,
  BreadcrumbPage,
} from '@/components/ui/breadcrumb'
import { Separator } from '@/components/ui/separator'
import { SidebarTrigger } from '@/components/ui/sidebar'
import { ModeToggle } from '@/components/ThemeTogge'
import Notification from '@/components/Notification'
import { PrivacyToggle } from '@/components/PrivacyToggle'

const ROUTE_LABELS = {
  admin: 'Admin',
  dashboard: 'Dashboard',
  customers: 'Customers',
  companies: 'Companies',
  accountancy: 'Accountancy',
  orders: 'Orders',
  tasks: 'Tasks',
  services: 'Services',
  payments: 'Payments',
  documents: 'Documents',
  intake: 'Intake',
  logs: 'Audit Logs',
  settings: 'Settings',
  notifications: 'Notifications',
  profile: 'Profile & Password',
}

export function SiteHeader() {
  const location = useLocation()
  const pathSegments = location.pathname.split('/').filter(Boolean)

  const getBreadcrumbs = () => {
    // If on /admin/dashboard or /admin or /
    if (pathSegments.length <= 1 || (pathSegments.length === 2 && pathSegments[1] === 'dashboard')) {
      return [{ label: 'Dashboard', href: '/admin/dashboard', isCurrent: true }]
    }

    const items = [
      { label: 'Dashboard', href: '/admin/dashboard', isCurrent: false }
    ]

    const currentSegment = pathSegments[pathSegments.length - 1]
    const label = ROUTE_LABELS[currentSegment] || (currentSegment.charAt(0).toUpperCase() + currentSegment.slice(1))

    items.push({
      label,
      href: location.pathname,
      isCurrent: true,
    })

    return items
  }

  const breadcrumbs = getBreadcrumbs()

  return (
    <header className="sticky top-0 z-10 bg-background/80 backdrop-blur-xl flex py-3.5 shrink-0 items-center gap-2 border-b transition-[width,height] ease-linear group-has-data-[collapsible=icon]/sidebar-wrapper:h-(--header-height)">
      <div className="flex w-full items-center justify-between gap-1 px-4 lg:gap-2 lg:px-6">
        <div className="flex items-center gap-3">
          <SidebarTrigger className="-ml-1" />
          <Separator
            orientation="vertical"
            className="h-4 data-vertical:self-auto"
          />

          <Breadcrumb>
            <BreadcrumbList>
              {breadcrumbs.map((item, index) => (
                <React.Fragment key={index}>
                  {index > 0 && <BreadcrumbSeparator />}
                  <BreadcrumbItem>
                    {item.isCurrent ? (
                      <BreadcrumbPage className=" text-sm text-foreground">
                        {item.label}
                      </BreadcrumbPage>
                    ) : (
                      <BreadcrumbLink render={<Link to={item.href} />}>
                        {item.label}
                      </BreadcrumbLink>
                    )}
                  </BreadcrumbItem>
                </React.Fragment>
              ))}
            </BreadcrumbList>
          </Breadcrumb>
        </div>

        <div className="flex items-center gap-2">
          <PrivacyToggle />
          <Notification />
          <ModeToggle />
        </div>
      </div>
    </header>
  )
}