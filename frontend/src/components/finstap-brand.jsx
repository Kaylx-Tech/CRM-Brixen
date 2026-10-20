import { cn } from "cn"

// Placeholder wordmark until the Finstap logo files arrive
export function FinstapLogo({ className, light = false }) {
  return (
    <span className={cn("inline-flex items-center gap-2.5 font-extrabold tracking-tight", className)}>
      <span
        className={cn(
          "flex size-10 items-center justify-center rounded-xl text-xl",
          light ? "bg-white text-blue-700" : "bg-primary text-primary-foreground"
        )}
      >
        F
      </span>
      <span className={cn("text-3xl", light ? "text-white" : "text-foreground")}>Finstap</span>
    </span>
  )
}
