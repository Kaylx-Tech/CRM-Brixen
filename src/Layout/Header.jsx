import { Breadcrumb, BreadcrumbItem, BreadcrumbLink, BreadcrumbSeparator, BreadcrumbEllipsis, BreadcrumbPage } from "@/components/ui/breadcrumb"
import { Separator } from "@/components/ui/separator"
import { SidebarTrigger } from "@/components/ui/sidebar"
import { ModeToggle } from "@/components/ThemeTogge"
import Notification from "@/components/Notification"

export function SiteHeader() {
  return (
    <header className="sticky top-0 z-10 bg-background/80 backdrop-blur-xl flex py-3.5 shrink-0 items-center gap-2 border-b transition-[width,height] ease-linear group-has-data-[collapsible=icon]/sidebar-wrapper:h-(--header-height)">
      <div className="flex w-full items-center justify-between gap-1 px-4 lg:gap-2 lg:px-6">
        <div className="flex items-center gap-2">
        <SidebarTrigger className="-ml-1" />
        <Separator
          orientation="vertical"
          className=" h-4 data-vertical:self-auto"
        />
        <h3 className="text-sm text-foreground">Dashboard</h3>
        </div>
        <div className="flex items-center gap-2">
        <Notification />
        <ModeToggle />
        </div>
      </div>
    </header>
  )
}