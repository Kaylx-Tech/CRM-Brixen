/**
 * The Finstap admin menu: names, order and groups (the Brixen build keeps its own flat list in
 * Layout/Sidebar.jsx). The sidebar and the Ctrl/⌘ K search both read this, so they always match.
 * `badge` names a count from /admin/stats/nav-counts shown next to the page; `tag` is a small word next to it
 * (e.g. "Soon"); `managerOnly` pages are for admins and managers.
 */
import {
  IconLayoutDashboard,
  IconUsers,
  IconBuilding,
  IconShoppingCart,
  IconApps,
  IconLink,
  IconCalculator,
  IconFileCheck,
  IconBrain,
  IconFileInvoice,
  IconUsersGroup,
  IconTrophy,
  IconHeadset,
} from "@tabler/icons-react"

export const FINSTAP_NAV_GROUPS = [
  {
    label: "Workspace",
    items: [
      { title: "Dashboard", url: "/admin/dashboard", icon: IconLayoutDashboard },
      { title: "Clients", url: "/admin/customers", icon: IconUsers },
      { title: "Companies", url: "/admin/companies", icon: IconBuilding },
      { title: "Orders", url: "/admin/orders", icon: IconShoppingCart, badge: "orders" },
      { title: "Services", url: "/admin/services", icon: IconApps },
    ],
  },
  {
    label: "Operations",
    items: [
      { title: "Smart Operations", url: "/admin/smart-operations", icon: IconLink, tag: "Soon" },
      { title: "Accountancy", url: "/admin/accountancy", icon: IconCalculator, tag: "Soon" },
      { title: "Documents", url: "/admin/documents", icon: IconFileCheck, badge: "documents" },
      { title: "Smart Intake", url: "/admin/intake", icon: IconBrain, tag: "Soon" },
    ],
  },
  {
    label: "Business",
    items: [
      { title: "Finance", url: "/admin/payments", icon: IconFileInvoice },
      // Team members list: admins and managers (staff's tasks are GOV Forms in Smart Operations)
      { title: "Team", url: "/admin/tasks", icon: IconUsersGroup, managerOnly: true },
      { title: "Performance", url: "/admin/performance", icon: IconTrophy },
      { title: "Support", url: "/admin/tickets", icon: IconHeadset, badge: "tickets" },
    ],
  },
]
