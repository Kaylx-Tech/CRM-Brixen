import { Navigate } from "react-router-dom"
import { canOpenPage } from "@/lib/permissions"

/** Sends users to their dashboard when their role may not open this page (typed URL, old link). */
export default function PageGuard({ page, children }) {
  if (!canOpenPage(page)) return <Navigate to="/admin/dashboard" replace />
  return children
}
