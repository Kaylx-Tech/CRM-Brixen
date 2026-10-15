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
import { IconRefresh, IconLoader2, IconPlayerPlay, IconCircleCheck, IconBolt } from '@tabler/icons-react'
import { toast } from 'sonner'
import { apiRequest } from '@/lib/api'
import { getCurrentUser, isManagerOrAbove } from '@/lib/permissions'

function gradeBadgeClass(grade) {
  if (grade === 'A+' || grade === 'A') return 'badge-green'
  if (grade === 'B') return 'badge-sky'
  if (grade === 'C') return 'badge-amber'
  return 'badge-red'
}

function priorityBadgeClass(priority) {
  if (priority === 'Urgent') return 'badge-red'
  if (priority === 'High') return 'badge-amber'
  if (priority === 'Low') return 'bg-muted text-muted-foreground'
  return 'badge-purple'
}

function isOverdue(task) {
  if (!task.due_date || task.status === 'Completed') return false
  const due = new Date(String(task.due_date).slice(0, 10) + 'T23:59:59')
  return !Number.isNaN(due.getTime()) && due < new Date()
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

/** The signed-in member's own work: grade, task counts and active tasks (old portal "Performance"). */
export function MyPerformance() {
  const navigate = useNavigate()
  const [data, setData] = useState(null)
  const [isLoading, setIsLoading] = useState(true)
  const [updatingId, setUpdatingId] = useState(null)

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

  const setStatus = async (task, status) => {
    setUpdatingId(task.id)
    try {
      const res = await apiRequest(`/tasks/${task.id}`, {
        method: 'PATCH',
        body: { status },
        label: 'Update task',
        silent: true,
      })
      if (!res.ok) {
        toast.error(res.reason || 'Could not update the task')
        return
      }
      toast.success(status === 'Completed' ? 'Task completed' : 'Task started')
      load()
    } finally {
      setUpdatingId(null)
    }
  }

  const m = data?.metrics || {}
  const tasks = data?.my_tasks || []
  const stats = [
    { title: 'Incentive grade', hero: true, value: m.grade ? `Grade ${m.grade}` : '—', footerSubText: m.grade_label || 'This month' },
    { title: 'Open', value: String(m.open_count ?? 0), footerSubText: 'Waiting to start' },
    { title: 'In progress', value: String(m.in_progress_count ?? 0), footerSubText: 'Active work' },
    {
      title: 'Completed this month',
      value: String(m.completed_count ?? 0),
      footerSubText: `${m.sla_rate ?? 100}% on time`,
    },
  ]

  return (
    <div className="flex flex-col gap-4">
      <SectionCards stats={stats} isLoading={isLoading && !data} />

      {m.bonus_badge ? (
        <div className="flex items-start gap-3 rounded-2xl border bg-card px-4 py-3">
          <IconBolt className="mt-0.5 size-4 shrink-0 text-amber-500" />
          <div className="text-sm">
            <p className="font-medium">{m.bonus_badge}</p>
            <p className="text-muted-foreground">
              {m.completion_rate ?? 0}% of this month's tasks completed · {m.sla_rate ?? 100}% on time
              {m.overdue_count ? ` · ${m.overdue_count} overdue` : ''}
            </p>
          </div>
        </div>
      ) : null}

      <div className="rounded-2xl border bg-card">
        <div className="flex items-center justify-between gap-3 border-b px-4 py-3">
          <div>
            <h3 className="font-semibold">My tasks</h3>
            <p className="text-sm text-muted-foreground">Open and in-progress work assigned to you</p>
          </div>
          <Button variant="outline" size="sm" onClick={load} disabled={isLoading}>
            <IconRefresh className={`size-4 ${isLoading ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
        </div>
        {isLoading && !data ? (
          <div className="flex items-center justify-center gap-2 py-12 text-sm text-muted-foreground">
            <IconLoader2 className="size-4 animate-spin" /> Loading your tasks…
          </div>
        ) : tasks.length === 0 ? (
          <p className="py-12 text-center text-sm font-medium text-emerald-600">All caught up, no open tasks.</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Task</TableHead>
                <TableHead>Priority</TableHead>
                <TableHead>Department</TableHead>
                <TableHead>Due</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Action</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {tasks.map((t) => (
                <TableRow key={t.id}>
                  <TableCell className="max-w-72">
                    <button
                      type="button"
                      className="block max-w-full cursor-pointer truncate text-left font-medium hover:underline"
                      onClick={() => navigate('/admin/tasks')}
                      title={t.title}
                    >
                      {t.title}
                    </button>
                    {t.company_name ? <span className="block truncate text-xs text-muted-foreground">{t.company_name}</span> : null}
                  </TableCell>
                  <TableCell><Badge className={priorityBadgeClass(t.priority)}>{t.priority || 'Medium'}</Badge></TableCell>
                  <TableCell className="text-sm text-muted-foreground">{t.department || 'General'}</TableCell>
                  <TableCell className={`text-sm ${isOverdue(t) ? 'font-semibold text-destructive' : 'text-muted-foreground'}`}>
                    {t.due_date ? String(t.due_date).slice(0, 10) : '—'}
                    {isOverdue(t) ? ' · overdue' : ''}
                  </TableCell>
                  <TableCell>
                    <Badge className={t.status === 'In Progress' ? 'badge-sky' : 'badge-amber'}>{t.status}</Badge>
                  </TableCell>
                  <TableCell>
                    <div className="flex justify-end gap-1.5">
                      {t.status !== 'In Progress' ? (
                        <Button variant="outline" size="sm" disabled={updatingId === t.id} onClick={() => setStatus(t, 'In Progress')}>
                          <IconPlayerPlay className="size-3.5" /> Start
                        </Button>
                      ) : null}
                      <Button size="sm" disabled={updatingId === t.id} onClick={() => setStatus(t, 'Completed')}>
                        {updatingId === t.id ? <IconLoader2 className="size-3.5 animate-spin" /> : <IconCircleCheck className="size-3.5" />}
                        Complete
                      </Button>
                    </div>
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
              <TableHead className="text-right">Assigned</TableHead>
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
        <p className="text-sm text-muted-foreground mt-1">Your tasks and this month's performance</p>
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
        <p className="text-sm text-muted-foreground mt-1">Task progress, on-time rate and incentive grades</p>
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
