import React, { useCallback, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { SectionCards } from '@/Layout/StatsCard'
import { IconRefresh, IconLoader2, IconBolt } from '@tabler/icons-react'
import { toast } from 'sonner'
import { apiRequest } from '@/lib/api'
import { getCurrentUser, isManagerOrAbove } from '@/lib/permissions'

function gradeBadgeClass(grade) {
  if (grade === 'A+' || grade === 'A') return 'badge-green'
  if (grade === 'B') return 'badge-sky'
  if (grade === 'C') return 'badge-amber'
  return 'badge-red'
}

function isOverdue(order) {
  if (!order.expected_date || order.status === 'Completed') return false
  const due = new Date(String(order.expected_date).slice(0, 10) + 'T23:59:59')
  return !Number.isNaN(due.getTime()) && due < new Date()
}

function statusBadgeClass(status) {
  if (status === 'Processing' || status === 'In Progress') return 'badge-sky'
  if (status === 'Documents Required' || status === 'Information Required') return 'badge-red'
  return 'badge-amber'
}

function departmentLabel(value) {
  const text = String(value || '').trim()
  if (!text.startsWith('[')) return text || 'General'
  try {
    const list = JSON.parse(text)
    return Array.isArray(list) && list.length ? (list.length > 2 ? `${list.length} departments` : list.join(', ')) : 'General'
  } catch {
    return 'General'
  }
}

/** The signed-in member's own work from their orders: grade, order counts and orders still to finish. */
export function MyPerformance() {
  const navigate = useNavigate()
  const [data, setData] = useState(null)
  const [isLoading, setIsLoading] = useState(true)

  const load = useCallback(async () => {
    setIsLoading(true)
    try {
      const res = await apiRequest('/tasks/my-dashboard', { label: 'My performance', silent: true })
      setData(res.ok ? (res.data?.data || null) : null)
      if (!res.ok) toast.error(res.reason || 'Could not load your dashboard')
    } finally {
      setIsLoading(false)
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  const m = data?.metrics || {}
  const orders = data?.my_orders || []
  const stats = [
    { title: 'Incentive grade', hero: true, value: m.grade ? `Grade ${m.grade}` : '—' },
    { title: 'Orders this month', value: String(m.assigned_count ?? 0) },
    { title: 'Pending', value: String(m.open_count ?? 0) },
    { title: 'In progress', value: String(m.in_progress_count ?? 0) },
    { title: 'Completed this month', value: String(m.completed_count ?? 0) },
  ]

  return (
    <div className="flex flex-col gap-4">
      <SectionCards stats={stats} isLoading={isLoading && !data} compact/>

      {m.bonus_badge ? (
        <div className="flex items-start gap-3 rounded-2xl border bg-card px-4 py-3">
          <IconBolt className="mt-0.5 size-4 shrink-0 text-amber-500" />
          <div className="text-sm">
            <p className="font-medium">{m.bonus_badge}</p>
            <p className="text-muted-foreground">
              {m.completion_rate ?? 0}% of this month's orders completed · {m.sla_rate ?? 100}% on time
              {m.overdue_count ? ` · ${m.overdue_count} overdue` : ''}
            </p>
          </div>
        </div>
      ) : null}

      <div className="rounded-2xl border bg-card">
        <div className="flex items-center justify-between gap-3 border-b px-4 py-3">
          <div>
            <h3 className="font-semibold">My orders</h3>
            <p className="text-sm text-muted-foreground">Orders assigned to you (or added by you) still to finish</p>
          </div>
          <Button variant="outline" size="sm" onClick={load} disabled={isLoading}>
            <IconRefresh className={`size-4 ${isLoading ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
        </div>
        {isLoading && !data ? (
          <div className="flex items-center justify-center gap-2 py-12 text-sm text-muted-foreground">
            <IconLoader2 className="size-4 animate-spin" /> Loading your orders…
          </div>
        ) : orders.length === 0 ? (
          <p className="py-12 text-center text-sm font-medium text-emerald-600">All caught up, no orders to finish.</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Order</TableHead>
                <TableHead>Customer</TableHead>
                <TableHead>Product</TableHead>
                <TableHead>Expected</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Action</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {orders.map((o) => (
                <TableRow key={o.id}>
                  <TableCell className="font-medium tabular-nums">{o.order_number || `#${o.id}`}</TableCell>
                  <TableCell className="max-w-56">
                    <span className="block truncate">{o.client_name || '—'}</span>
                    {o.company_name ? <span className="block truncate text-xs text-muted-foreground">{o.company_name}</span> : null}
                  </TableCell>
                  <TableCell className="max-w-56 truncate text-sm text-muted-foreground" title={o.products_summary}>
                    {o.products_summary || o.service_name || '—'}
                  </TableCell>
                  <TableCell className={`text-sm ${isOverdue(o) ? 'font-semibold text-destructive' : 'text-muted-foreground'}`}>
                    {o.expected_date ? String(o.expected_date).slice(0, 10) : '—'}
                    {isOverdue(o) ? ' · overdue' : ''}
                  </TableCell>
                  <TableCell><Badge className={statusBadgeClass(o.status)}>{o.status}</Badge></TableCell>
                  <TableCell className="text-right">
                    <Button variant="outline" size="sm" onClick={() => navigate(`/admin/orders?open=${o.id}`)}>
                      Open
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </div>
    </div>
  )
}

/** Monthly leaderboard for admins and managers. */
function TeamIncentives() {
  const [month, setMonth] = useState(() => new Date().toISOString().slice(0, 7))
  const [rows, setRows] = useState([])
  const [isLoading, setIsLoading] = useState(true)

  const load = useCallback(async () => {
    setIsLoading(true)
    try {
      const res = await apiRequest(`/tasks/incentives-report?month=${encodeURIComponent(month)}`, {
        label: 'Team incentives',
        silent: true,
      })
      setRows(res.ok ? (res.data?.data?.leaderboard || []) : [])
      if (!res.ok) toast.error(res.reason || 'Could not load team incentives')
    } finally {
      setIsLoading(false)
    }
  }, [month])

  useEffect(() => {
    load()
  }, [load])

  return (
    <div className="rounded-2xl border bg-card">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b px-4 py-3">
        <div>
          <h3 className="font-semibold">Team incentives</h3>
          <p className="text-sm text-muted-foreground">Monthly leaderboard, grades and bonus eligibility</p>
        </div>
        <div className="flex items-center gap-2">
          <Input type="month" value={month} onChange={(e) => setMonth(e.target.value)} className="w-40" aria-label="Month" />
          <Button variant="outline" size="sm" onClick={load} disabled={isLoading}>
            <IconRefresh className={`size-4 ${isLoading ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
        </div>
      </div>
      {isLoading ? (
        <div className="flex items-center justify-center gap-2 py-12 text-sm text-muted-foreground">
          <IconLoader2 className="size-4 animate-spin" /> Loading leaderboard…
        </div>
      ) : rows.length === 0 ? (
        <p className="py-12 text-center text-sm text-muted-foreground">No active team members found.</p>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Rank</TableHead>
              <TableHead>Team member</TableHead>
              <TableHead>Department</TableHead>
              <TableHead className="text-right">Orders</TableHead>
              <TableHead className="text-right">Completed</TableHead>
              <TableHead className="text-right">On time</TableHead>
              <TableHead className="text-right">Overdue</TableHead>
              <TableHead>Grade</TableHead>
              <TableHead>Incentive</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((r, idx) => (
              <TableRow key={r.staff?.id || idx}>
                <TableCell className="font-semibold">#{idx + 1}</TableCell>
                <TableCell>
                  <span className="block font-medium">{r.staff?.full_name || 'Staff'}</span>
                  <span className="block text-xs text-muted-foreground">{r.staff?.email}</span>
                </TableCell>
                <TableCell className="text-sm text-muted-foreground">{departmentLabel(r.staff?.department)}</TableCell>
                <TableCell className="text-right tabular-nums">{r.assigned_count}</TableCell>
                <TableCell className="text-right font-semibold tabular-nums text-emerald-600">{r.completed_count}</TableCell>
                <TableCell className="text-right tabular-nums">{r.sla_rate}%</TableCell>
                <TableCell className={`text-right tabular-nums ${r.overdue_count ? 'font-semibold text-destructive' : 'text-muted-foreground'}`}>
                  {r.overdue_count}
                </TableCell>
                <TableCell><Badge className={gradeBadgeClass(r.grade)}>Grade {r.grade}</Badge></TableCell>
                <TableCell className="text-sm">
                  <span className="block">{r.grade_label}</span>
                  <span className="block text-xs text-muted-foreground">{r.bonus_badge}</span>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </div>
  )
}

/** Dashboard for the STAFF role: their own work instead of the company-wide overview. */
export function StaffDashboard() {
  const user = getCurrentUser()
  const firstName = String(user.full_name || user.name || '').split(' ')[0]
  return (
    <div className="flex flex-col gap-6 w-full pb-10">
      <div>
        <h2 className="text-2xl font-bold tracking-tight">{firstName ? `Welcome, ${firstName}` : 'My Dashboard'}</h2>
        <p className="text-sm text-muted-foreground mt-1">Your orders and this month's performance</p>
      </div>
      <MyPerformance />
    </div>
  )
}

export default function Performance() {
  const canSeeTeam = isManagerOrAbove()
  const [tab, setTab] = useState('mine')
  return (
    <div className="flex flex-col gap-6 w-full pb-10">
      <div>
        <h2 className="text-2xl font-bold tracking-tight">Performance</h2>
        <p className="text-sm text-muted-foreground mt-1">Orders completed, on-time rate and incentive grades</p>
      </div>
      {canSeeTeam ? (
        <Tabs value={tab} onValueChange={setTab}>
          <TabsList>
            <TabsTrigger value="mine">My performance</TabsTrigger>
            <TabsTrigger value="team">Team incentives</TabsTrigger>
          </TabsList>
        </Tabs>
      ) : null}
      {canSeeTeam && tab === 'team' ? <TeamIncentives /> : <MyPerformance />}
    </div>
  )
}
