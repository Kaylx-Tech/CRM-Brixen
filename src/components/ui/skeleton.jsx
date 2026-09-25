import { cn } from "cn"

function Skeleton({
  className,
  ...props
}) {
  return (
    <div
      data-slot="skeleton"
      className={cn(
        "animate-shimmer rounded-md bg-muted/80 relative overflow-hidden border border-border/30",
        className
      )}
      {...props}
    />
  )
}

export { Skeleton }
