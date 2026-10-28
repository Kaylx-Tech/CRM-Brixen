import { useNavigate } from "react-router-dom"
import { IconLock } from "@tabler/icons-react"
import { Button } from "@/components/ui/button"

/** Shown in place of a page whose feature is not in the workspace's plan: what it is and where to upgrade. */
export function PlanLocked({ message }) {
  const navigate = useNavigate()
  return (
    <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed bg-card px-6 py-12 text-center">
      <span className="flex size-11 items-center justify-center rounded-full bg-muted">
        <IconLock className="size-5 text-muted-foreground" />
      </span>
      <p className="max-w-md text-sm text-muted-foreground">
        {message || "This feature is not part of your current plan."}
      </p>
      <Button size="sm" onClick={() => navigate("/admin/settings?tab=plan")}>
        See plans
      </Button>
    </div>
  )
}

export default PlanLocked
