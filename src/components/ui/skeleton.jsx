import { cn } from "cn"

function Skeleton({
  className,
  ...props
}) {
  return (
    <div
      data-slot="skeleton"
      className={cn(
        "animate-shimmer rounded-xl border-none",
        className
      )}
      {...props}
    />
  )
}

export { Skeleton }
