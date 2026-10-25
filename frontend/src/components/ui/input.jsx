import * as React from "react"
import { Input as InputPrimitive } from "@base-ui/react/input"
import { cn } from "cn"

function Input({
  className,
  type,
  ...props
}) {
  return (
    <InputPrimitive
      type={type}
      data-slot="input"
      className={cn(
        "h-[26px] w-full min-w-0 rounded-full border border-input bg-transparent px-3 py-1 text-base shadow-xs transition-[color,box-shadow] outline-none file:inline-flex file:h-[26px] file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-0 focus-visible:ring-ring/50 disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20 md:text-[13px] dark:bg-input/30 dark:aria-invalid:border-destructive/50 dark:aria-invalid:ring-destructive/40",
        // File picker: room for a real "Choose file" pill button next to the file name
        type === "file" &&
          "h-auto cursor-pointer py-1 pl-1 text-[13px] text-muted-foreground file:mr-3 file:h-7 file:cursor-pointer file:items-center file:rounded-full file:bg-muted file:px-3.5 file:align-middle file:text-[13px] file:text-foreground file:transition-colors hover:file:bg-muted-foreground/15",
        className
      )}
      {...props}
    />
  )
}

export { Input }
