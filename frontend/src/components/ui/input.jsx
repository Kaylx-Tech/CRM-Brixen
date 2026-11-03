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
        // File picker: a dashed drop box with a theme-colour "Choose file" pill that lights up and presses in
        type === "file" &&
          "h-auto cursor-pointer border-dashed py-1 pl-1 text-[13px] text-muted-foreground transition-all duration-200 hover:border-primary/60 hover:bg-primary/[0.04] file:mr-3 file:h-7 file:cursor-pointer file:items-center file:rounded-full file:bg-primary/10 file:px-3.5 file:align-middle file:text-[13px] file:font-semibold file:text-primary file:transition-all file:duration-200 hover:file:bg-primary hover:file:text-primary-foreground hover:file:shadow-md hover:file:shadow-primary/25 active:file:scale-95",
        className
      )}
      {...props}
    />
  )
}

export { Input }
