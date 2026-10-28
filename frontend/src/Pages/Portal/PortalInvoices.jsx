import React, { useMemo, useState } from "react"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { SectionCards } from "@/Layout/StatsCard"
import { Button } from "@/components/ui/button"
import { IconFileText, IconDownload } from "@tabler/icons-react"
import { openInvoice, downloadInvoice } from "@/lib/invoices"
import { usePortalData, PageHeader, PageState, StatusBadge, money, formatDate } from "./portalShared"

export default function PortalInvoices() {
  const { data, isLoading, error, reload } = usePortalData("/client/invoices")
  const [tab, setTab] = useState("invoices")
  const invoices = data?.invoices || []

  const totals = useMemo(() => invoices.reduce((acc, i) => {
    if (i.status === "Cancelled") return acc
    acc.billed += Number(i.total || 0)
    acc.paid += Number(i.amount_paid || 0)
    acc.due += Number(i.amount_due || 0)
    return acc
  }, { billed: 0, paid: 0, due: 0 }), [invoices])

  const rows = tab === "payments" ? invoices.filter((i) => Number(i.amount_paid || 0) > 0) : invoices

  return (
    <div className="flex flex-col gap-6 w-full pb-10">
      <PageHeader title="Invoices & Payments" description="Your invoices, what you have paid and what is still due" onRefresh={reload} isLoading={isLoading} />
      <SectionCards
        compact
        isLoading={isLoading && !data}
        stats={[
          { title: "Total billed", value: money(totals.billed) },
          { title: "Paid", value: money(totals.paid) },
          { title: "Still due", value: money(totals.due) },
        ]}
      />
      <Tabs value={tab} onValueChange={setTab}>
        <TabsList>
          <TabsTrigger value="invoices">Invoices</TabsTrigger>
          <TabsTrigger value="payments">Payments</TabsTrigger>
        </TabsList>
      </Tabs>
      <PageState isLoading={isLoading && !data} error={error} onRetry={reload} isEmpty={!rows.length}
        emptyText={tab === "payments" ? "No payments recorded yet." : "No invoices yet."}>
        <div className="rounded-2xl border bg-card">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Invoice</TableHead>
                <TableHead>For</TableHead>
                <TableHead>{tab === "payments" ? "Paid on" : "Due date"}</TableHead>
                <TableHead className="text-right">Total</TableHead>
                <TableHead className="text-right">Paid</TableHead>
                <TableHead className="text-right">Due</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="w-0" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((i) => (
                <TableRow key={i.id}>
                  <TableCell className="font-medium">{i.invoice_number}</TableCell>
                  <TableCell className="max-w-64">
                    <span className="block truncate">{i.service_name || "—"}</span>
                    {i.order_number ? <span className="block text-xs text-muted-foreground">{i.order_number}</span> : null}
                  </TableCell>
                  <TableCell className="text-muted-foreground">{formatDate(tab === "payments" ? i.paid_at : i.due_date)}</TableCell>
                  <TableCell className="text-right tabular-nums">{money(i.total)}</TableCell>
                  <TableCell className="text-right tabular-nums text-emerald-600">{money(i.amount_paid)}</TableCell>
                  <TableCell className={`text-right tabular-nums ${Number(i.amount_due) > 0.004 ? "font-semibold text-destructive" : "text-muted-foreground"}`}>
                    {money(i.amount_due)}
                  </TableCell>
                  <TableCell><StatusBadge status={i.display_status || i.status} /></TableCell>
                  <TableCell>
                    <div className="flex items-center gap-1">
                      <Button variant="outline" size="sm" className="h-7 gap-1" onClick={() => openInvoice(i.id, { client: true })}>
                        <IconFileText className="size-3.5" /> View
                      </Button>
                      <Button variant="ghost" size="icon-sm" aria-label="Download invoice PDF"
                        onClick={() => downloadInvoice(i.id, i.invoice_number, { client: true })}>
                        <IconDownload className="size-3.5" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </PageState>
    </div>
  )
}
