import { mergeProps } from "@base-ui/react/merge-props"
import { useRender } from "@base-ui/react/use-render"
import { cva } from "class-variance-authority";
import { cn } from "cn"

const badgeVariants = cva(
  "group/badge inline-flex h-5 w-fit shrink-0 items-center justify-center gap-1 overflow-hidden rounded-full border border-transparent px-2 py-0.5 text-[0.625rem] font-medium whitespace-nowrap transition-all focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 has-data-[icon=inline-end]:pr-1.5 has-data-[icon=inline-start]:pl-1.5 aria-invalid:border-destructive aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 [&>svg]:pointer-events-none [&>svg]:size-2.5!",
  {
    variants: {
      variant: {
        default:
          "[background:linear-gradient(to_bottom,#eff6ff_0%,#dbeafe_100%)] text-blue-700 [a]:hover:opacity-90",
        secondary:
          "[background:linear-gradient(135deg,#f1f5f9_0%,#e2e8f0_100%)] text-secondary-foreground dark:[background:linear-gradient(135deg,#1e293b_0%,#334155_100%)] [a]:hover:opacity-90",
        destructive:
          "[background:linear-gradient(135deg,#fecaca_0%,#fca5a5_100%)] text-red-700 dark:[background:linear-gradient(135deg,#450a0a_0%,#7f1d1d_100%)] dark:text-red-300 [a]:hover:opacity-90",
        outline:
          "border-border [background:linear-gradient(135deg,oklch(1_0_0/50%)_0%,oklch(0.97_0_0)_100%)] text-foreground dark:[background:linear-gradient(135deg,oklch(0.2_0_0/60%)_0%,oklch(0.25_0_0)_100%)] [a]:hover:opacity-80",
        ghost:
          "hover:bg-muted hover:text-muted-foreground dark:hover:bg-muted/50",
        link: "text-primary underline-offset-4 hover:underline",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
)

function Badge({
  className,
  variant = "default",
  render,
  ...props
}) {
  return useRender({
    defaultTagName: "span",
    props: mergeProps({
      className: cn(badgeVariants({ variant }), className),
    }, props),
    render,
    state: {
      slot: "badge",
      variant,
    },
  });
}

export { Badge, badgeVariants }
