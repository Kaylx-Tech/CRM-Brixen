import { cn } from "cn"

function Skeleton({
  className,
  ...props
}) {
  return (
    <div
      data-slot="skeleton"
      className={cn(
        "animate-shimmer rounded-xl border border-slate-200/80 dark:border-slate-800 shadow-xs",
        className
      )}
      {...props}
    />
  )
}

export { Skeleton }
