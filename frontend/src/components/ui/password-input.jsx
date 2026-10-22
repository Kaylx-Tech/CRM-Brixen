import { useState } from "react"
import { IconEye, IconEyeOff } from "@tabler/icons-react"
import { cn } from "cn"
import { Input } from "@/components/ui/input"

/** Password field with an eye button to show or hide what was typed. */
function PasswordInput({ className, disabled, ...props }) {
  const [visible, setVisible] = useState(false)
  return (
    <div className="relative">
      <Input
        type={visible ? "text" : "password"}
        className={cn("pr-9", className)}
        disabled={disabled}
        {...props}
      />
      <button
        type="button"
        onClick={() => setVisible((v) => !v)}
        disabled={disabled}
        aria-label={visible ? "Hide password" : "Show password"}
        aria-pressed={visible}
        className="absolute right-1 top-1/2 flex size-7 -translate-y-1/2 items-center justify-center rounded-full text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50 disabled:pointer-events-none disabled:opacity-50"
      >
        {visible ? <IconEyeOff className="size-4" /> : <IconEye className="size-4" />}
      </button>
    </div>
  )
}

export { PasswordInput }
