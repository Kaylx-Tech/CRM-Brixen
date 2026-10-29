"use client"

import * as React from "react"
import { cn } from "cn"

// Phones (below md): each body row becomes a card, every cell a "column name … value" line
const STACK_ON_PHONES = [
  "max-md:block max-md:[&_tbody]:block max-md:[&_thead]:hidden",
  "max-md:[&_tbody_tr]:mb-2 max-md:[&_tbody_tr]:block max-md:[&_tbody_tr]:rounded-xl max-md:[&_tbody_tr]:border max-md:[&_tbody_tr]:bg-card max-md:[&_tbody_tr]:px-3 max-md:[&_tbody_tr]:py-2",
  // label on the left; the cell's own lines stacked on the right. max-w-none: a desktop column width
  // (max-w-64 etc.) must not squeeze the value into the middle of the card
  "max-md:[&_tbody_td]:max-w-none max-md:[&_tbody_td]:grid max-md:[&_tbody_td]:grid-cols-[auto_minmax(0,1fr)] max-md:[&_tbody_td]:items-center max-md:[&_tbody_td]:gap-x-3 max-md:[&_tbody_td]:px-0 max-md:[&_tbody_td]:py-1 max-md:[&_tbody_td]:text-right max-md:[&_tbody_td]:whitespace-normal max-md:[&_tbody_td]:break-words max-md:[&_tbody_td>*]:col-start-2 max-md:[&_tbody_td>*]:justify-self-end max-md:[&_tbody_td>*]:max-w-full",
  "max-md:[&_tbody_td]:before:shrink-0 max-md:[&_tbody_td]:before:text-left max-md:[&_tbody_td]:before:text-xs max-md:[&_tbody_td]:before:text-muted-foreground max-md:[&_tbody_td]:before:content-[attr(data-label)]",
].join(" ")

function Table({
  className,
  stack = true,
  ...props
}) {
  const ref = React.useRef(null)

  // Each cell is labelled with its column's heading, for the phone layout
  React.useEffect(() => {
    const table = ref.current
    if (!stack || !table) return undefined
    const label = () => {
      const heads = [...table.querySelectorAll("thead th")].map((th) => th.textContent.trim())
      table.querySelectorAll("tbody tr").forEach((tr) => {
        ;[...tr.children].forEach((td, i) => {
          const text = td.colSpan > 1 ? "" : heads[i] || ""
          if (td.getAttribute("data-label") !== text) td.setAttribute("data-label", text)
        })
      })
    }
    label()
    const observer = new MutationObserver(label)
    observer.observe(table, { childList: true, subtree: true })
    return () => observer.disconnect()
  }, [stack])

  return (
    <div
      data-slot="table-container"
      className="relative w-full overflow-x-auto"
    >
      <table
        ref={ref}
        data-slot="table"
        className={cn("w-full caption-bottom text-sm", stack && STACK_ON_PHONES, className)}
        {...props}
      />
    </div>
  )
}

function TableHeader({
  className,
  ...props
}) {
  return (
    <thead
      data-slot="table-header"
      className={cn("[&_tr]:border-b", className)}
      {...props}
    />
  )
}

function TableBody({
  className,
  ...props
}) {
  return (
    <tbody
      data-slot="table-body"
      className={cn("[&_tr:last-child]:border-0", className)}
      {...props}
    />
  )
}

function TableFooter({
  className,
  ...props
}) {
  return (
    <tfoot
      data-slot="table-footer"
      className={cn(
        "border-t bg-muted/50 font-medium [&>tr]:last:border-b-0",
        className
      )}
      {...props}
    />
  )
}

function TableRow({
  className,
  ...props
}) {
  return (
    <tr
      data-slot="table-row"
      className={cn(
        "border-b transition-colors hover:bg-muted/50 has-aria-expanded:bg-muted/50 data-[state=selected]:bg-muted",
        className
      )}
      {...props}
    />
  )
}

function TableHead({
  className,
  ...props
}) {
  return (
    <th
      data-slot="table-head"
      className={cn(
        "h-10 px-2 text-left align-middle font-medium whitespace-nowrap text-foreground [&:has([role=checkbox])]:pr-0",
        className
      )}
      {...props}
    />
  )
}

function TableCell({
  className,
  ...props
}) {
  return (
    <td
      data-slot="table-cell"
      className={cn(
        "p-2 align-middle whitespace-nowrap [&:has([role=checkbox])]:pr-0",
        className
      )}
      {...props}
    />
  )
}

function TableCaption({
  className,
  ...props
}) {
  return (
    <caption
      data-slot="table-caption"
      className={cn("mt-4 text-sm text-muted-foreground", className)}
      {...props}
    />
  )
}

export {
  Table,
  TableHeader,
  TableBody,
  TableFooter,
  TableHead,
  TableRow,
  TableCell,
  TableCaption,
}
