import { useState, useEffect, useMemo, useCallback } from 'react'
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog"
import {
  IconCalendarWeek,
  IconRefresh,
  IconPlus,
  IconPencil,
  IconTrash,
  IconLoader2,
  IconRotate,
} from "@tabler/icons-react"
import DeleteConfirmation from "@/components/DeleteConfirmation"
import { createColumnHelper } from "@tanstack/react-table"
import { DataTable } from "../../Layout/DataTable"
import { SectionCards } from "../../Layout/StatsCard"
import { toast } from "sonner"
import { apiRequest } from "@/lib/api"
import { formatMoney, plainAmount } from "@/lib/money"

/**
 * Revenue & Balance Sheet (admins), the Balance Sheet tab on the Finance page: for each currency, what the company held at the start of the month,
 * the paid invoices that came in, the expenses that went out, and what is left. GBP and PKR are kept
 * apart. Each month opens with the previous month's closing balance; the owner enters a starting
 * balance once per currency.
 */

const incomeCol = createColumnHelper()
const expenseCol = createColumnHelper()
const monthCol = createColumnHelper()

const CURRENCIES = ['GBP', 'PKR']

function buildMonthOptions(count = 24) {
  const options = []
  const now = new Date()
  for (let i = 0; i < count; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
    const value = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
    const label = d.toLocaleDateString('en-GB', { month: 'long', year: 'numeric' })
    options.push({ value, label: i === 0 ? `Current month (${label})` : label })
  }
  return options
}

const MONTH_OPTIONS = buildMonthOptions()
const CURRENT_MONTH = MONTH_OPTIONS[0].value

function monthName(key) {
  const [y, m] = String(key || '').split('-').map(Number)
  if (!y || !m) return key || ''
  return new Date(y, m - 1, 1).toLocaleDateString('en-GB', { month: 'long', year: 'numeric' })
}

function shortDate(text) {
  const d = new Date(`${String(text || '').slice(0, 10)}T00:00:00`)
  return Number.isNaN(d.getTime()) ? (text || '—') : d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
}

function todayISO() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

const EMPTY_EXPENSE = { spent_on: '', category: 'Salary', description: '', amount: '', currency: 'GBP' }

export default function BalanceSheet({ embedded = false }) {
  const [month, setMonth] = useState(CURRENT_MONTH)
  const [sheet, setSheet] = useState(null)
  const [isLoading, setIsLoading] = useState(true)

  const [expenseForm, setExpenseForm] = useState(null) // { id?, ...fields } while the dialog is open
  const [savingExpense, setSavingExpense] = useState(false)
  const [expenseToDelete, setExpenseToDelete] = useState(null)
  const [deletingExpense, setDeletingExpense] = useState(false)

  const [startForm, setStartForm] = useState(null) // { currency, amount, start_month }
  const [savingStart, setSavingStart] = useState(false)

  const [rupeeForm, setRupeeForm] = useState(null) // { invoice, amount }
  const [savingRupees, setSavingRupees] = useState(false)

  const load = useCallback(async (silent = false) => {
    if (!silent) setIsLoading(true)
    const res = await apiRequest(`/admin/finance?month=${month}`, { label: 'Balance sheet' })
    if (res.ok) setSheet(res.data?.data || null)
    setIsLoading(false)
  }, [month])

  useEffect(() => { load() }, [load])

  const save = async (path, method, body, label) => {
    const res = await apiRequest(path, { method, body, label, silent: true })
    if (!res.ok) {
      toast.error(res.reason || res.data?.error || `${label} failed`)
      return false
    }
    toast.success(res.data?.message || 'Saved')
    load(true)
    return true
  }

  const saveExpense = async () => {
    setSavingExpense(true)
    const { id, ...fields } = expenseForm
    const ok = id
      ? await save(`/admin/finance/expenses/${id}`, 'PUT', fields, 'Save expense')
      : await save('/admin/finance/expenses', 'POST', fields, 'Add expense')
    setSavingExpense(false)
    if (ok) setExpenseForm(null)
  }

  const confirmDeleteExpense = async () => {
    setDeletingExpense(true)
    await save(`/admin/finance/expenses/${expenseToDelete.id}`, 'DELETE', undefined, 'Remove expense')
    setDeletingExpense(false)
    setExpenseToDelete(null)
  }

  const saveStart = async () => {
    setSavingStart(true)
    const ok = await save(`/admin/finance/opening/${startForm.currency}`, 'PUT',
      { amount: startForm.amount, start_month: startForm.start_month }, 'Starting balance')
    setSavingStart(false)
    if (ok) setStartForm(null)
  }

  const saveRupees = async (reset = false) => {
    setSavingRupees(true)
    const ok = await save(`/admin/finance/receipts/${rupeeForm.invoice.invoice_id}`, 'PUT',
      reset ? { reset: true } : { amount: rupeeForm.amount }, 'Rupees received')
    setSavingRupees(false)
    if (ok) setRupeeForm(null)
  }

  const openStart = (currency) => {
    const start = sheet?.starts?.[currency]
    setStartForm({
      currency,
      amount: start ? plainAmount(start.amount) : '',
      start_month: start?.start_month || month,
    })
  }

  const categories = sheet?.categories || ['Salary', 'Rent', 'Other']

  // One row of cards per currency: opening, money in, expenses, closing
  const cardsFor = (cur) => {
    const t = sheet?.totals?.[cur]
    const label = monthName(month)
    if (!t) {
      return [{ title: `${cur} balance`, value: '—', footerSubText: 'Before the starting month', tone: 'sky' }]
    }
    return [
      { title: `${cur} opening`, value: formatMoney(t.opening, cur), footerSubText: `On 1 ${label}`, tone: 'blue' },
      { title: `${cur} money in`, value: formatMoney(t.money_in, cur), footerSubText: 'Paid invoices', tone: 'emerald' },
      { title: `${cur} expenses`, value: formatMoney(t.money_out, cur), footerSubText: 'Salary, rent, other', tone: 'rose' },
      { title: `${cur} closing`, value: formatMoney(t.closing, cur), footerSubText: 'Opens next month', tone: t.closing < 0 ? 'orange' : 'violet' },
    ]
  }

  const incomeColumns = useMemo(() => [
    incomeCol.accessor('date', { header: 'Date', cell: ({ getValue }) => shortDate(getValue()) }),
    incomeCol.accessor('invoice_number', {
      header: 'Invoice',
      cell: ({ row }) => <Badge className="badge-sky rounded-full font-mono">{row.original.invoice_number}</Badge>,
    }),
    incomeCol.accessor('client_name', {
      header: 'Client',
      cell: ({ row }) => (
        <div className="flex flex-col">
          <span className="font-medium text-sm">{row.original.client_name || '—'}</span>
          <span className="text-sm text-muted-foreground">{row.original.service_name || row.original.order_number || ''}</span>
        </div>
      ),
    }),
    incomeCol.accessor('status', {
      header: 'Status',
      cell: ({ getValue }) => (
        <Badge className={`rounded-full ${getValue() === 'Paid' ? 'badge-green' : 'badge-amber'}`}>
          {getValue() === 'Partial Paid' ? 'Part paid' : getValue()}
        </Badge>
      ),
    }),
    incomeCol.accessor('currency', { header: 'Account' }),
    incomeCol.accessor('amount', {
      header: 'Received',
      cell: ({ row }) => {
        const inv = row.original
        if (inv.currency !== 'PKR') return <span className="font-semibold">{formatMoney(inv.amount, 'GBP')}</span>
        return (
          <div className="flex items-center gap-1.5">
            <div className="flex flex-col">
              <span className="font-semibold">
                {inv.amount == null ? 'Rupees needed' : formatMoney(inv.amount, 'PKR')}
              </span>
              <span className="text-sm text-muted-foreground">
                {formatMoney(inv.gbp_amount, 'GBP')}
                {inv.edited ? ' · typed in' : inv.rate ? ` × ${Number(inv.rate).toFixed(2)}` : ''}
              </span>
            </div>
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7"
              title="Correct the rupees received"
              onClick={() => setRupeeForm({ invoice: inv, amount: inv.amount == null ? '' : plainAmount(inv.amount) })}
            >
              <IconPencil className="h-4 w-4" />
            </Button>
          </div>
        )
      },
    }),
  ], [])

  const expenseColumns = useMemo(() => [
    expenseCol.accessor('spent_on', { header: 'Date', cell: ({ getValue }) => shortDate(getValue()) }),
    expenseCol.accessor('category', {
      header: 'Category',
      cell: ({ getValue }) => <Badge className="badge-purple rounded-full">{getValue()}</Badge>,
    }),
    expenseCol.accessor('description', { header: 'Details', cell: ({ getValue }) => getValue() || '—' }),
    expenseCol.accessor('currency', { header: 'Account' }),
    expenseCol.accessor('amount', {
      header: 'Amount',
      cell: ({ row }) => <span className="font-semibold">{formatMoney(row.original.amount, row.original.currency)}</span>,
    }),
    expenseCol.display({
      id: 'actions',
      header: '',
      cell: ({ row }) => (
        <div className="flex justify-end gap-1">
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7"
            title="Edit expense"
            onClick={() => setExpenseForm({
              id: row.original.id,
              spent_on: row.original.spent_on,
              category: row.original.category,
              description: row.original.description || '',
              amount: plainAmount(row.original.amount),
              currency: row.original.currency,
            })}
          >
            <IconPencil className="h-4 w-4" />
          </Button>
          <Button variant="ghost" size="icon" className="h-7 w-7" title="Remove expense" onClick={() => setExpenseToDelete(row.original)}>
            <IconTrash className="h-4 w-4" />
          </Button>
        </div>
      ),
    }),
  ], [])

  const monthColumns = useMemo(() => [
    monthCol.accessor('month', {
      header: 'Month',
      cell: ({ getValue }) => <span className="font-medium">{monthName(getValue())}</span>,
    }),
    ...CURRENCIES.map((cur) => monthCol.display({
      id: cur,
      header: cur,
      cell: ({ row }) => {
        const t = row.original[cur]
        if (!t) return <span className="text-muted-foreground">—</span>
        return (
          <div className="flex flex-col text-sm">
            <span className="font-semibold">{formatMoney(t.closing, cur)} <span className="font-normal text-muted-foreground">closing</span></span>
            <span className="text-muted-foreground">
              {formatMoney(t.opening, cur)} + {formatMoney(t.money_in, cur)} − {formatMoney(t.money_out, cur)}
            </span>
          </div>
        )
      },
    })),
  ], [])

  return (
    <div className="flex flex-col gap-4 w-full pb-10">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-3">
        <div>
          {!embedded && <h2 className="text-2xl font-bold tracking-tight">Revenue &amp; Balance Sheet</h2>}
          <p className="text-sm text-muted-foreground mt-0.5">
            {monthName(month)} · GBP and PKR kept separate · each month opens with last month&apos;s closing balance
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Select value={month} onValueChange={(v) => setMonth(v || CURRENT_MONTH)}>
            <SelectTrigger className="w-[220px] text-sm">
              <IconCalendarWeek className="h-4 w-4 shrink-0" />
              <SelectValue placeholder="Month">
                {MONTH_OPTIONS.find((m) => m.value === month)?.label || monthName(month)}
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              <SelectGroup>
                {MONTH_OPTIONS.map((m) => (
                  <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>
                ))}
              </SelectGroup>
            </SelectContent>
          </Select>
          <Button variant="outline" onClick={() => load()}>
            <IconRefresh className="mr-2 h-4 w-4" />
            Refresh
          </Button>
          <Button onClick={() => setExpenseForm({ ...EMPTY_EXPENSE, spent_on: month === CURRENT_MONTH ? todayISO() : `${month}-01` })}>
            <IconPlus className="mr-2 h-4 w-4" />
            Add expense
          </Button>
        </div>
      </div>

      {CURRENCIES.map((cur) => {
        const start = sheet?.starts?.[cur]
        return (
          <div key={cur} className="flex flex-col gap-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 className="text-base font-semibold">{cur === 'GBP' ? 'GBP account (£)' : 'PKR account (Rs)'}</h3>
              <Button variant="link" size="sm" className="h-auto p-0" onClick={() => openStart(cur)}>
                {start
                  ? `Starting balance ${formatMoney(start.amount, cur)} from ${monthName(start.start_month)} · change`
                  : 'Set the starting balance'}
              </Button>
            </div>
            <SectionCards stats={cardsFor(cur)} isLoading={isLoading && !sheet} compact />
          </div>
        )
      })}

      {sheet?.rupees_missing > 0 && (
        <p className="text-sm text-amber-700 dark:text-amber-400">
          {sheet.rupees_missing} PKR invoice{sheet.rupees_missing === 1 ? '' : 's'} could not be turned into rupees (no exchange rate right now).
          Type in the rupees received with the pencil, or refresh later.
        </p>
      )}

      <div className="mt-2">
        <h3 className="text-base font-semibold mb-2">Money in: paid invoices</h3>
        <DataTable columns={incomeColumns} data={sheet?.income || []} isLoading={isLoading && !sheet} />
      </div>

      <div className="mt-2">
        <h3 className="text-base font-semibold mb-2">Expenses</h3>
        <DataTable columns={expenseColumns} data={sheet?.expenses || []} isLoading={isLoading && !sheet} />
      </div>

      <div className="mt-2">
        <h3 className="text-base font-semibold mb-2">Month by month</h3>
        <DataTable columns={monthColumns} data={sheet?.months || []} isLoading={isLoading && !sheet} />
      </div>

      {/* Add / edit an expense */}
      <Dialog open={!!expenseForm} onOpenChange={(open) => !open && !savingExpense && setExpenseForm(null)}>
        <DialogContent className="sm:max-w-[460px]">
          <DialogHeader>
            <DialogTitle>{expenseForm?.id ? 'Edit expense' : 'Add expense'}</DialogTitle>
            <DialogDescription>Money the company paid out. It comes off that account&apos;s balance.</DialogDescription>
          </DialogHeader>
          {expenseForm && (
            <div className="grid grid-cols-2 gap-3 py-1">
              <div className="grid gap-1.5">
                <Label>Date</Label>
                <Input type="date" value={expenseForm.spent_on}
                  onChange={(e) => setExpenseForm((p) => ({ ...p, spent_on: e.target.value }))} />
              </div>
              <div className="grid gap-1.5">
                <Label>Category</Label>
                <Select value={expenseForm.category} onValueChange={(v) => setExpenseForm((p) => ({ ...p, category: v }))}>
                  <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {categories.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-1.5">
                <Label>Amount</Label>
                <Input inputMode="decimal" placeholder="0" value={expenseForm.amount}
                  onChange={(e) => setExpenseForm((p) => ({ ...p, amount: e.target.value }))} />
              </div>
              <div className="grid gap-1.5">
                <Label>Paid from</Label>
                <Select value={expenseForm.currency} onValueChange={(v) => setExpenseForm((p) => ({ ...p, currency: v }))}>
                  <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="GBP">GBP account (£)</SelectItem>
                    <SelectItem value="PKR">PKR account (Rs)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-1.5 col-span-2">
                <Label>Details</Label>
                <Input placeholder="e.g. October salary, office rent" value={expenseForm.description}
                  onChange={(e) => setExpenseForm((p) => ({ ...p, description: e.target.value }))} />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setExpenseForm(null)} disabled={savingExpense}>Cancel</Button>
            <Button onClick={saveExpense} disabled={savingExpense}>
              {savingExpense && <IconLoader2 className="mr-2 h-4 w-4 animate-spin" />}
              {expenseForm?.id ? 'Save expense' : 'Add expense'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Starting balance for one currency */}
      <Dialog open={!!startForm} onOpenChange={(open) => !open && !savingStart && setStartForm(null)}>
        <DialogContent className="sm:max-w-[420px]">
          <DialogHeader>
            <DialogTitle>{startForm?.currency} starting balance</DialogTitle>
            <DialogDescription>
              What was in the {startForm?.currency} account on the first day of the starting month. Later months
              carry over the closing balance on their own. Money dated before this month is not counted again.
            </DialogDescription>
          </DialogHeader>
          {startForm && (
            <div className="grid grid-cols-2 gap-3 py-1">
              <div className="grid gap-1.5">
                <Label>Balance</Label>
                <Input inputMode="decimal" placeholder="0" value={startForm.amount}
                  onChange={(e) => setStartForm((p) => ({ ...p, amount: e.target.value }))} />
              </div>
              <div className="grid gap-1.5">
                <Label>From month</Label>
                <Input type="month" value={startForm.start_month}
                  onChange={(e) => setStartForm((p) => ({ ...p, start_month: e.target.value }))} />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setStartForm(null)} disabled={savingStart}>Cancel</Button>
            <Button onClick={saveStart} disabled={savingStart}>
              {savingStart && <IconLoader2 className="mr-2 h-4 w-4 animate-spin" />}
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Rupees actually received for a PKR invoice */}
      <Dialog open={!!rupeeForm} onOpenChange={(open) => !open && !savingRupees && setRupeeForm(null)}>
        <DialogContent className="sm:max-w-[420px]">
          <DialogHeader>
            <DialogTitle>Rupees received</DialogTitle>
            <DialogDescription>
              {rupeeForm && `${rupeeForm.invoice.invoice_number}: ${formatMoney(rupeeForm.invoice.gbp_amount, 'GBP')} paid into the PKR account. Type what actually reached the bank.`}
            </DialogDescription>
          </DialogHeader>
          {rupeeForm && (
            <div className="grid gap-1.5 py-1">
              <Label>Amount (Rs)</Label>
              <Input inputMode="decimal" placeholder="0" value={rupeeForm.amount}
                onChange={(e) => setRupeeForm((p) => ({ ...p, amount: e.target.value }))} />
            </div>
          )}
          <DialogFooter className="gap-2">
            {rupeeForm?.invoice.edited && (
              <Button variant="ghost" onClick={() => saveRupees(true)} disabled={savingRupees} className="mr-auto">
                <IconRotate className="mr-2 h-4 w-4" />
                Use live rate
              </Button>
            )}
            <Button variant="outline" onClick={() => setRupeeForm(null)} disabled={savingRupees}>Cancel</Button>
            <Button onClick={() => saveRupees(false)} disabled={savingRupees}>
              {savingRupees && <IconLoader2 className="mr-2 h-4 w-4 animate-spin" />}
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <DeleteConfirmation
        isOpen={!!expenseToDelete}
        onClose={() => !deletingExpense && setExpenseToDelete(null)}
        onConfirm={confirmDeleteExpense}
        isLoading={deletingExpense}
        title="Remove expense?"
        description={expenseToDelete
          ? `${expenseToDelete.category} of ${formatMoney(expenseToDelete.amount, expenseToDelete.currency)} on ${shortDate(expenseToDelete.spent_on)} will be removed and the balance goes back up.`
          : ''}
        confirmText="Remove expense"
      />
    </div>
  )
}
