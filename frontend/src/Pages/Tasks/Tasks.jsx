import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Checkbox } from '@/components/ui/checkbox'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { createColumnHelper } from '@tanstack/react-table'
import { DataTable } from '../../Layout/DataTable'
import DeleteConfirmation from '../../components/DeleteConfirmation'
import { OverflowTooltip } from '@/components/OverflowTooltip'
import {
  IconPlus,
  IconRefresh,
  IconDotsVertical,
  IconPlayerPlay,
  IconCircleCheck,
  IconTrash,
  IconEdit,
  IconUserPlus,
  IconLoader2,
  IconAlertCircle,
  IconCircleDot,
} from '@tabler/icons-react'
import { SectionCards } from '../../Layout/StatsCard'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { toast } from 'sonner'
import { apiRequest, getApiBase, toastApiEmpty } from '@/lib/api'
import { getCurrentUser, isAdminRole, isManagerOrAbove } from '@/lib/permissions'
import {
  toastUndoableDelete,
  toastProcessing,
  toastDone,
  toastFail,
} from '@/lib/toastActions'

const columnHelper = createColumnHelper()

const STATUSES = ['Open', 'In Progress', 'Completed', 'Cancelled']
const PRIORITIES = ['Low', 'Medium', 'High', 'Urgent']
// Same list as the backend STAFF_DEPARTMENTS: staff access and task routing both use it
const DEPARTMENTS = ['New Signups', 'Orders', 'Documents', 'Support', 'Compliance', 'Accounts', 'Accountancy', 'General']

function parseDepartments(value) {
  if (Array.isArray(value)) return value
  const text = String(value || '').trim()
  if (!text) return []
  try {
    const parsed = JSON.parse(text)
    return Array.isArray(parsed) ? parsed : [text]
  } catch {
    return text.split(',').map((d) => d.trim()).filter(Boolean)
  }
}
const STAFF_ROLES = ['STAFF', 'MANAGER', 'ADMIN']

const emptyTaskForm = {
  title: '',
  description: '',
  priority: 'Medium',
  status: 'Open',
  due_date: '',
  department: 'General',
  assigned_staff_id: '',
}

const emptyStaffForm = {
  full_name: '',
  email: '',
  phone: '',
  role: 'STAFF',
  password: '',
  departments: [...DEPARTMENTS],
}

/** Checkboxes for the areas a staff member may work in (Customers = New Signups, Payments = Accounts, …). */
function DepartmentPicker({ value, onChange, disabled }) {
  const toggle = (dept, on) =>
    onChange(on ? [...new Set([...value, dept])] : value.filter((d) => d !== dept))
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <Label>Departments</Label>
        <button
          type="button"
          className="cursor-pointer text-xs text-primary hover:underline"
          onClick={() => onChange(value.length === DEPARTMENTS.length ? [] : [...DEPARTMENTS])}
          disabled={disabled}
        >
          {value.length === DEPARTMENTS.length ? 'Clear all' : 'Select all'}
        </button>
      </div>
      <div className="grid grid-cols-2 gap-2 rounded-xl border p-3">
        {DEPARTMENTS.map((dept) => (
          <Label key={dept} className="flex cursor-pointer items-center gap-2 text-sm font-normal">
            <Checkbox
              checked={value.includes(dept)}
              onCheckedChange={(on) => toggle(dept, !!on)}
              disabled={disabled}
            />
            {dept}
          </Label>
        ))}
      </div>
      <p className="text-xs text-muted-foreground">
        Staff only open the pages for their departments. Admins and managers can open everything. None ticked gives all.
      </p>
    </div>
  )
}

function formatWhen(value) {
  if (!value) return '—'
  const raw = String(value)
  const d = new Date(raw.includes('T') ? raw : raw.replace(' ', 'T') + 'Z')
  if (Number.isNaN(d.getTime())) return raw
  return d.toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  })
}

function statusBadgeClass(status) {
  const s = String(status || '')
  if (s === 'Completed') return 'badge-green'
  if (s === 'In Progress') return 'badge-sky'
  if (s === 'Cancelled') return 'badge-red'
  return 'badge-amber'
}

function priorityBadgeClass(priority) {
  const p = String(priority || '')
  if (p === 'Urgent') return 'badge-red'
  if (p === 'High') return 'badge-amber'
  if (p === 'Low') return 'bg-muted text-muted-foreground'
  return 'badge-purple'
}

function roleBadgeClass(role) {
  const r = String(role || '')
  if (r === 'SUPER_ADMIN' || r === 'ADMIN') return 'badge-purple'
  if (r === 'MANAGER') return 'badge-sky'
  return 'badge-amber'
}

function humanRole(role) {
  return String(role || '')
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase())
}

function extractList(payload, keys = []) {
  if (!payload) return []
  if (Array.isArray(payload)) return payload
  const nested = payload.data
  if (Array.isArray(nested)) return nested
  for (const key of keys) {
    if (Array.isArray(payload[key])) return payload[key]
    if (nested && Array.isArray(nested[key])) return nested[key]
  }
  return []
}

const Tasks = () => {
  const [activeTab, setActiveTab] = useState('Tasks')
  const [statusFilter, setStatusFilter] = useState('All')
  const [tasks, setTasks] = useState([])
  const [staff, setStaff] = useState([])
  const [isLoading, setIsLoading] = useState(true)
  const [staffLoading, setStaffLoading] = useState(true)
  const [loadError, setLoadError] = useState(null)

  const [taskDialogOpen, setTaskDialogOpen] = useState(false)
  const [editingTask, setEditingTask] = useState(null)
  const [taskForm, setTaskForm] = useState(emptyTaskForm)
  const [taskSaving, setTaskSaving] = useState(false)
  const [taskError, setTaskError] = useState('')

  const [staffDialogOpen, setStaffDialogOpen] = useState(false)
  const [staffForm, setStaffForm] = useState(emptyStaffForm)
  const [staffSaving, setStaffSaving] = useState(false)
  const [staffError, setStaffError] = useState('')

  const [taskToDelete, setTaskToDelete] = useState(null)
  const [isDeleting, setIsDeleting] = useState(false)

  // Only admins add or remove team members (the backend enforces the same rule)
  const currentUser = useMemo(() => getCurrentUser(), [])
  const canManageTeam = isAdminRole(currentUser)
  // Admins and managers create, assign and delete tasks; staff work on the tasks they are given
  const canManageTasks = isManagerOrAbove(currentUser)
  const isSuperAdmin = String(currentUser?.role || '').toUpperCase() === 'SUPER_ADMIN'
  const [memberToRemove, setMemberToRemove] = useState(null)
  const [accessMember, setAccessMember] = useState(null)
  const [accessSaving, setAccessSaving] = useState(false)
  const [isRemovingMember, setIsRemovingMember] = useState(false)

  const loadTasks = useCallback(async () => {
    setIsLoading(true)
    setLoadError(null)
    try {
      const res = await apiRequest('/tasks', { label: 'Tasks' })
      if (!res.ok) {
        setTasks([])
        setLoadError(res.reason)
        return
      }
      const list = extractList(res.data, ['tasks'])
      const mapped = list.map((t) => ({
        id: t.id,
        title: t.title || 'Untitled',
        description: t.description || '',
        status: t.status || 'Open',
        priority: t.priority || 'Medium',
        due_date: t.due_date || '',
        dueLabel: formatWhen(t.due_date),
        department: t.department || 'General',
        assignee: t.assignee_name || 'Unassigned',
        assigned_staff_id: t.assigned_staff_id || '',
        company: t.company_name || '—',
        creator: t.creator_name || '—',
        created_at: t.created_at || '',
        createdLabel: formatWhen(t.created_at),
        raw: t,
      }))
      setTasks(mapped)
      if (mapped.length === 0) toastApiEmpty('Tasks', getApiBase())
    } catch (err) {
      console.error('Failed to load tasks', err)
      setTasks([])
      setLoadError(err?.message || 'Unexpected error')
      toast.error('Tasks failed to load', {
        description: err?.message || 'Unexpected error',
        duration: 8000,
      })
    } finally {
      setIsLoading(false)
    }
  }, [])

  const loadStaff = useCallback(async () => {
    setStaffLoading(true)
    try {
      const res = await apiRequest('/admin/staff', { label: 'Team' })
      if (!res.ok) {
        setStaff([])
        return
      }
      const list = extractList(res.data, ['staff'])
      const mapped = list.map((s) => ({
        id: s.id,
        name: s.full_name || 'Staff',
        email: s.email || '',
        phone: s.phone || '',
        role: s.role || 'STAFF',
        status: s.status || 'Active',
        departments: parseDepartments(s.department),
        openTasks: Number(s.open_tasks) || 0,
        totalTasks: Number(s.total_tasks) || 0,
        joined: formatWhen(s.created_at),
        raw: s,
      }))
      setStaff(mapped)
      if (mapped.length === 0) toastApiEmpty('Team', getApiBase())
    } catch (err) {
      console.error('Failed to load staff', err)
      setStaff([])
    } finally {
      setStaffLoading(false)
    }
  }, [])

  useEffect(() => {
    loadTasks()
  }, [loadTasks])

  useEffect(() => {
    loadStaff()
  }, [loadStaff])

  const openCreateTask = () => {
    setEditingTask(null)
    setTaskError('')
    setTaskForm({
      ...emptyTaskForm,
      assigned_staff_id: staff[0]?.id ? String(staff[0].id) : '',
    })
    setTaskDialogOpen(true)
  }

  const openEditTask = (task) => {
    setEditingTask(task)
    setTaskError('')
    setTaskForm({
      title: task.title || '',
      description: task.description || '',
      priority: task.priority || 'Medium',
      status: task.status || 'Open',
      due_date: task.due_date ? String(task.due_date).slice(0, 10) : '',
      department: task.department || 'General',
      assigned_staff_id: task.assigned_staff_id
        ? String(task.assigned_staff_id)
        : '',
    })
    setTaskDialogOpen(true)
  }

  const saveTask = async (e) => {
    e?.preventDefault?.()
    setTaskError('')
    if (!taskForm.title.trim()) {
      setTaskError('Task title is required.')
      return
    }
    setTaskSaving(true)
    const toastId = toastProcessing(
      editingTask ? 'Updating task…' : 'Creating task…',
    )
    try {
      const payload = {
        title: taskForm.title.trim(),
        description: taskForm.description.trim(),
        priority: taskForm.priority,
        status: taskForm.status,
        due_date: taskForm.due_date || null,
        department: taskForm.department || null,
        assigned_staff_id: taskForm.assigned_staff_id
          ? Number(taskForm.assigned_staff_id)
          : null,
      }
      const res = editingTask
        ? await apiRequest(`/tasks/${editingTask.id}`, {
            method: 'PATCH',
            body: JSON.stringify(payload),
            label: 'Update task',
            silent: true,
          })
        : await apiRequest('/tasks', {
            method: 'POST',
            body: JSON.stringify(payload),
            label: 'Create task',
            silent: true,
          })
      if (!res.ok) {
        setTaskError(res.reason || 'Failed to save task.')
        toastFail(toastId, res.reason || 'Failed to save task.')
        return
      }
      toastDone(toastId, editingTask ? 'Task updated' : 'Task created')
      setTaskDialogOpen(false)
      setEditingTask(null)
      await Promise.all([loadTasks(), loadStaff()])
    } catch (err) {
      setTaskError(err?.message || 'Failed to save task.')
      toastFail(toastId, err?.message || 'Failed to save task.')
    } finally {
      setTaskSaving(false)
    }
  }

  const patchTask = async (taskId, patch, label = 'Update task') => {
    const toastId = toastProcessing(
      label === 'Update task' ? 'Updating task…' : `${label}…`,
    )
    const res = await apiRequest(`/tasks/${taskId}`, {
      method: 'PATCH',
      body: JSON.stringify(patch),
      label,
      silent: true,
    })
    if (!res.ok) {
      toastFail(toastId, res.reason || 'Failed to update task')
      return
    }
    toastDone(toastId, label === 'Update task' ? 'Task updated' : label)
    await Promise.all([loadTasks(), loadStaff()])
  }

  const confirmDeleteTask = () => {
    if (!taskToDelete?.id) return
    const victim = taskToDelete
    const snapshot = tasks
    setTaskToDelete(null)
    setIsDeleting(false)
    setTasks((prev) => prev.filter((t) => t.id !== victim.id))

    toastUndoableDelete({
      message: `Task "${victim.title}" deleted`,
      description: 'Undo available for a few seconds',
      onUndo: () => setTasks(snapshot),
      onCommit: async () => {
        const res = await apiRequest(`/tasks/${victim.id}`, {
          method: 'DELETE',
          label: 'Delete task',
          silent: true,
        })
        if (!res.ok) throw new Error(res.reason || 'Failed to delete task')
        loadStaff()
      },
    })
  }

  const saveStaff = async (e) => {
    e?.preventDefault?.()
    setStaffError('')
    if (!staffForm.full_name.trim() || !staffForm.email.trim()) {
      setStaffError('Full name and email are required.')
      return
    }
    if (!staffForm.password || staffForm.password.length < 10) {
      setStaffError('Password must be at least 10 characters.')
      return
    }
    setStaffSaving(true)
    const toastId = toastProcessing('Adding team member…')
    try {
      const res = await apiRequest('/admin/staff', {
        method: 'POST',
        body: JSON.stringify({
          full_name: staffForm.full_name.trim(),
          email: staffForm.email.trim().toLowerCase(),
          phone: staffForm.phone.trim() || undefined,
          role: staffForm.role,
          password: staffForm.password,
          departments: staffForm.departments,
        }),
        label: 'Add team member',
        silent: true,
      })
      if (!res.ok) {
        setStaffError(res.reason || 'Failed to create team member.')
        toastFail(toastId, res.reason || 'Failed to create team member.')
        return
      }
      toastDone(toastId, 'Team member added')
      setStaffDialogOpen(false)
      setStaffForm(emptyStaffForm)
      await loadStaff()
    } catch (err) {
      setStaffError(err?.message || 'Failed to create team member.')
      toastFail(toastId, err?.message || 'Failed to create team member.')
    } finally {
      setStaffSaving(false)
    }
  }

  const saveAccess = async (e) => {
    e?.preventDefault?.()
    if (!accessMember) return
    setAccessSaving(true)
    const toastId = toastProcessing('Saving access…')
    try {
      const res = await apiRequest(`/admin/staff/${accessMember.id}`, {
        method: 'PATCH',
        body: { role: accessMember.role, departments: accessMember.departments },
        label: 'Team access',
        silent: true,
      })
      if (!res.ok) {
        toastFail(toastId, res.reason || 'Failed to save access.')
        return
      }
      toastDone(toastId, res.data?.message || 'Access updated')
      setAccessMember(null)
      await loadStaff()
    } finally {
      setAccessSaving(false)
    }
  }

  const confirmRemoveMember = async () => {
    if (!memberToRemove) return
    setIsRemovingMember(true)
    const toastId = toastProcessing('Removing team member…')
    try {
      const res = await apiRequest(`/admin/staff/${memberToRemove.id}`, {
        method: 'DELETE',
        label: 'Remove team member',
        silent: true,
      })
      if (!res.ok) {
        toastFail(toastId, res.reason || 'Failed to remove team member.')
        return
      }
      toastDone(toastId, res.data?.message || 'Team member removed')
      setMemberToRemove(null)
      await loadStaff()
    } finally {
      setIsRemovingMember(false)
    }
  }

  const canRemoveMember = (m) =>
    canManageTeam &&
    String(m.id) !== String(currentUser?.id) &&
    (m.role !== 'SUPER_ADMIN' || isSuperAdmin)

  const counts = useMemo(() => {
    const all = tasks.length
    const by = Object.fromEntries(STATUSES.map((s) => [s, 0]))
    tasks.forEach((t) => {
      if (by[t.status] !== undefined) by[t.status] += 1
    })
    return { All: all, ...by }
  }, [tasks])

  // Headline numbers; status cards switch the filter below
  const taskStats = useMemo(() => {
    const today = new Date().toISOString().slice(0, 10)
    const overdue = tasks.filter(
      (t) => t.due_date && String(t.due_date).slice(0, 10) < today && !['Completed', 'Cancelled'].includes(t.status)
    ).length
    const filter = (value) => ({ onClick: () => setStatusFilter(value), active: statusFilter === value })
    const doneRate = counts.All ? Math.round((counts.Completed / counts.All) * 100) : 0
    return [
      { title: 'All Tasks', hero: true, value: String(counts.All), footerSubText: `${doneRate}% completed`, ...filter('All') },
      { title: 'Open', tone: 'blue', icon: IconCircleDot, value: String(counts.Open), footerSubText: 'Not started yet', ...filter('Open') },
      { title: 'In Progress', tone: 'amber', value: String(counts['In Progress']), footerSubText: 'Being worked on', ...filter('In Progress') },
      { title: 'Completed', tone: 'emerald', value: String(counts.Completed), footerSubText: `${counts.Cancelled} cancelled`, ...filter('Completed') },
      { title: 'Overdue', tone: 'rose', value: String(overdue), footerSubText: 'Past the due date' },
    ]
  }, [tasks, counts, statusFilter])

  const filteredTasks = useMemo(() => {
    if (statusFilter === 'All') return tasks
    return tasks.filter((t) => t.status === statusFilter)
  }, [tasks, statusFilter])

  const taskColumns = useMemo(
    () => [
      columnHelper.accessor('title', {
        header: 'Task',
      cell: ({ row }) => (
          <div className="flex flex-col gap-0.5 min-w-0 max-w-[280px]">
            <OverflowTooltip
              text={row.original.title}
              className="font-medium text-foreground"
            />
            {row.original.description ? (
              <OverflowTooltip
                text={row.original.description}
                className="text-sm text-muted-foreground"
              />
            ) : null}
        </div>
      ),
    }),
      columnHelper.accessor('status', {
        header: 'Status',
        cell: ({ getValue }) => (
          <Badge className={statusBadgeClass(getValue())}>{getValue()}</Badge>
        ),
      }),
      columnHelper.accessor('priority', {
        header: 'Priority',
        cell: ({ getValue }) => (
          <Badge className={priorityBadgeClass(getValue())}>{getValue()}</Badge>
        ),
      }),
      columnHelper.accessor('assignee', {
        header: 'Assignee',
        cell: ({ getValue }) => (
          <span className="text-sm text-foreground">{getValue()}</span>
        ),
      }),
      columnHelper.accessor('department', {
        header: 'Dept',
        cell: ({ getValue }) => (
          <span className="text-sm text-muted-foreground">{getValue() || '—'}</span>
        ),
      }),
      columnHelper.accessor('dueLabel', {
        header: 'Due',
        cell: ({ getValue }) => (
          <span className="text-sm text-muted-foreground">{getValue()}</span>
        ),
    }),
    columnHelper.display({
        id: 'actions',
        header: '',
        cell: ({ row }) => {
          const task = row.original
          return (
            <DropdownMenu>
              <DropdownMenuTrigger
                render={<Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground" aria-label="Task actions" />}
              >
                <IconDotsVertical className="size-4" />
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-48">
                <DropdownMenuItem onClick={() => openEditTask(task)}>
                  Edit
                </DropdownMenuItem>
                {task.status === 'Open' && (
                  <DropdownMenuItem
                    onClick={() =>
                      patchTask(task.id, { status: 'In Progress' }, 'Started task')
                    }
                  >
                    Start
                  </DropdownMenuItem>
                )}
                {task.status !== 'Completed' && (
                  <DropdownMenuItem
                    onClick={() =>
                      patchTask(task.id, { status: 'Completed' }, 'Task completed')
                    }
                  >
                    Mark complete
                  </DropdownMenuItem>
                )}
                {canManageTasks && (
                  <>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem
                      variant="destructive"
                      onClick={() => setTaskToDelete(task)}
                    >
                      Delete
                    </DropdownMenuItem>
                  </>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          )
        },
      }),
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [staff, canManageTasks]
  )

  const staffColumns = useMemo(
    () => [
      columnHelper.accessor('name', {
        header: 'Member',
        cell: ({ row }) => (
          <div className="flex flex-col min-w-0">
            <span className="font-medium text-foreground">{row.original.name}</span>
            <span className="text-sm text-muted-foreground">{row.original.email}</span>
          </div>
        ),
      }),
      columnHelper.accessor('role', {
        header: 'Role',
        cell: ({ getValue }) => (
          <Badge className={roleBadgeClass(getValue())}>{humanRole(getValue())}</Badge>
        ),
      }),
      columnHelper.accessor('status', {
        header: 'Status',
        cell: ({ getValue }) => (
          <Badge className={getValue() === 'Active' ? 'badge-green' : 'badge-red'}>
            {getValue()}
          </Badge>
        ),
      }),
      columnHelper.accessor('departments', {
        header: 'Departments',
        cell: ({ row }) => {
          const m = row.original
          if (m.role !== 'STAFF') return <span className="text-sm text-muted-foreground">All (by role)</span>
          const list = m.departments || []
          if (!list.length) return <Badge className="badge-red">None</Badge>
          if (list.length === DEPARTMENTS.length) return <span className="text-sm">All</span>
          return (
            <span className="block max-w-56 truncate text-sm" title={list.join(', ')}>
              {list.join(', ')}
            </span>
          )
        },
      }),
      columnHelper.accessor('openTasks', {
        header: 'Open tasks',
      cell: ({ row }) => (
          <span className="text-sm">
            {row.original.openTasks}
            <span className="text-muted-foreground"> / {row.original.totalTasks}</span>
          </span>
        ),
      }),
      columnHelper.accessor('joined', {
        header: 'Joined',
        cell: ({ getValue }) => (
          <span className="text-sm text-muted-foreground">{getValue()}</span>
        ),
      }),
      columnHelper.accessor('phone', {
        header: 'Phone',
        cell: ({ getValue }) => (
          <span className="text-sm text-muted-foreground">{getValue() || '—'}</span>
      ),
    }),
      ...(canManageTeam
        ? [
            columnHelper.display({
              id: 'actions',
              header: '',
              cell: ({ row }) =>
                canRemoveMember(row.original) ? (
                  <div className="flex justify-end gap-1">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() =>
                        setAccessMember({
                          id: row.original.id,
                          name: row.original.name,
                          role: row.original.role,
                          departments: row.original.departments.length ? row.original.departments : [...DEPARTMENTS],
                        })
                      }
                    >
                      <IconEdit className="size-4" />
                      Access
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-destructive hover:text-destructive"
                      onClick={() => setMemberToRemove(row.original)}
                    >
                      <IconTrash className="size-4" />
                      Remove
                    </Button>
                  </div>
                ) : null,
            }),
          ]
        : []),
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [canManageTeam, isSuperAdmin]
  )

  return (
    <div className="flex flex-col gap-6 w-full pb-10">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Tasks & Team</h2>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            onClick={() =>
              activeTab === 'Tasks' ? loadTasks() : loadStaff()
            }
            disabled={activeTab === 'Tasks' ? isLoading : staffLoading}
          >
            <IconRefresh
              className={`size-4 ${
                (activeTab === 'Tasks' ? isLoading : staffLoading)
                  ? 'animate-spin'
                  : ''
              }`}
            />
            Refresh
          </Button>
          {activeTab === 'Tasks' ? (
            canManageTasks ? (
              <Button onClick={openCreateTask}>
                <IconPlus className="size-4" />
                New task
              </Button>
            ) : null
          ) : canManageTeam ? (
            <Button
              onClick={() => {
                setStaffError('')
                setStaffForm(emptyStaffForm)
                setStaffDialogOpen(true)
              }}
            >
              <IconUserPlus className="size-4" />
              Add member
            </Button>
          ) : null}
        </div>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList>
          <TabsTrigger value="Tasks">Tasks</TabsTrigger>
          {canManageTasks && <TabsTrigger value="Team">Team</TabsTrigger>}
        </TabsList>
      </Tabs>

      {activeTab === 'Tasks' ? (
        <div className="flex flex-col gap-4">
          <SectionCards stats={taskStats} isLoading={isLoading} compact />
          <Tabs value={statusFilter} onValueChange={setStatusFilter}>
            <TabsList>
              {['All', ...STATUSES].map((s) => (
                <TabsTrigger key={s} value={s}>
                  {s}
                  <span className="ml-1.5 text-sm text-muted-foreground">
                    {counts[s] ?? 0}
                  </span>
                </TabsTrigger>
              ))}
            </TabsList>
          </Tabs>

          {loadError ? (
            <Alert variant="destructive">
              <IconAlertCircle className="size-4" />
              <AlertDescription>{loadError}</AlertDescription>
            </Alert>
          ) : null}

          <DataTable
            columns={taskColumns}
            data={filteredTasks}
            isLoading={isLoading}
          />
        </div>
      ) : (
        <DataTable
          columns={staffColumns}
          data={staff}
          isLoading={staffLoading}
        />
      )}

      {/* Create / Edit Task */}
      <Dialog
        open={taskDialogOpen}
        onOpenChange={(open) => {
          if (!taskSaving) setTaskDialogOpen(open)
        }}
      >
        <DialogContent className="sm:max-w-[560px]">
          <DialogHeader>
            <DialogTitle>{editingTask ? 'Edit task' : 'New task'}</DialogTitle>
            <DialogDescription>
              {editingTask
                ? 'Update assignment, priority, or status.'
                : 'Create an internal task and assign it to a team member.'}
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={saveTask} className="space-y-4">
            {taskError ? (
              <Alert variant="destructive">
                <IconAlertCircle className="size-4" />
                <AlertDescription>{taskError}</AlertDescription>
              </Alert>
            ) : null}

            <div className="space-y-2">
              <Label htmlFor="task-title">
                Title <span className="text-destructive">*</span>
              </Label>
              <Input
                id="task-title"
                value={taskForm.title}
                onChange={(e) =>
                  setTaskForm((p) => ({ ...p, title: e.target.value }))
                }
                placeholder="e.g. File confirmation statement for ACME Ltd"
                required
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="task-desc">Description</Label>
              <Textarea
                id="task-desc"
                value={taskForm.description}
                onChange={(e) =>
                  setTaskForm((p) => ({ ...p, description: e.target.value }))
                }
                placeholder="Optional notes for the assignee…"
                rows={3}
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Status</Label>
                <Select
                  value={taskForm.status}
                  onValueChange={(val) =>
                    setTaskForm((p) => ({ ...p, status: val }))
                  }
                >
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Status" />
                  </SelectTrigger>
                  <SelectContent>
                    {STATUSES.map((s) => (
                      <SelectItem key={s} value={s}>
                        {s}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Priority</Label>
                <Select
                  value={taskForm.priority}
                  onValueChange={(val) =>
                    setTaskForm((p) => ({ ...p, priority: val }))
                  }
                >
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Priority" />
                  </SelectTrigger>
                  <SelectContent>
                    {PRIORITIES.map((p) => (
                      <SelectItem key={p} value={p}>
                        {p}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Department</Label>
                <Select
                  value={taskForm.department}
                  onValueChange={(val) =>
                    setTaskForm((p) => ({ ...p, department: val }))
                  }
                  disabled={!canManageTasks}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Department" />
                  </SelectTrigger>
                  <SelectContent>
                    {DEPARTMENTS.map((d) => (
                      <SelectItem key={d} value={d}>
                        {d}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="task-due">Due date</Label>
                <Input
                  id="task-due"
                  type="date"
                  value={taskForm.due_date}
                  onChange={(e) =>
                    setTaskForm((p) => ({ ...p, due_date: e.target.value }))
                  }
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label>Assignee</Label>
              <Select
                value={taskForm.assigned_staff_id || undefined}
                onValueChange={(val) =>
                  setTaskForm((p) => ({ ...p, assigned_staff_id: val }))
                }
                disabled={!canManageTasks}
              >
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Assign to…" />
                </SelectTrigger>
                <SelectContent>
                  {staff.map((s) => (
                    <SelectItem key={s.id} value={String(s.id)}>
                      {s.name} ({humanRole(s.role)})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => setTaskDialogOpen(false)}
                disabled={taskSaving}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={taskSaving}>
                {taskSaving ? (
                  <IconLoader2 className="size-4 animate-spin" />
                ) : null}
                {editingTask ? 'Save changes' : 'Create task'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Add Team Member */}
      <Dialog
        open={staffDialogOpen}
        onOpenChange={(open) => {
          if (!staffSaving) setStaffDialogOpen(open)
        }}
      >
        <DialogContent className="sm:max-w-[480px]">
          <DialogHeader>
            <DialogTitle>Add team member</DialogTitle>
            <DialogDescription>
              Create a staff account that can be assigned to tasks.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={saveStaff} className="space-y-4">
            {staffError ? (
              <Alert variant="destructive">
                <IconAlertCircle className="size-4" />
                <AlertDescription>{staffError}</AlertDescription>
              </Alert>
            ) : null}

            <div className="space-y-2">
              <Label htmlFor="staff-name">
                Full name <span className="text-destructive">*</span>
              </Label>
              <Input
                id="staff-name"
                value={staffForm.full_name}
                onChange={(e) =>
                  setStaffForm((p) => ({ ...p, full_name: e.target.value }))
                }
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="staff-email">
                Email <span className="text-destructive">*</span>
              </Label>
              <Input
                id="staff-email"
                type="email"
                value={staffForm.email}
                onChange={(e) =>
                  setStaffForm((p) => ({ ...p, email: e.target.value }))
                }
                required
              />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="staff-phone">Phone</Label>
                <Input
                  id="staff-phone"
                  value={staffForm.phone}
                  onChange={(e) =>
                    setStaffForm((p) => ({ ...p, phone: e.target.value }))
                  }
                />
              </div>
              <div className="space-y-2">
                <Label>Role</Label>
                <Select
                  value={staffForm.role}
                  onValueChange={(val) =>
                    setStaffForm((p) => ({ ...p, role: val }))
                  }
                >
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Role" />
                  </SelectTrigger>
                  <SelectContent>
                    {STAFF_ROLES.map((r) => (
                      <SelectItem key={r} value={r}>
                        {humanRole(r)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="staff-password">
                Temporary password <span className="text-destructive">*</span>
              </Label>
              <Input
                id="staff-password"
                type="password"
                value={staffForm.password}
                onChange={(e) =>
                  setStaffForm((p) => ({ ...p, password: e.target.value }))
                }
                placeholder="Min. 10 characters"
                required
              />
            </div>
            {staffForm.role === 'STAFF' && (
              <DepartmentPicker
                value={staffForm.departments}
                onChange={(departments) => setStaffForm((p) => ({ ...p, departments }))}
                disabled={staffSaving}
              />
            )}

            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => setStaffDialogOpen(false)}
                disabled={staffSaving}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={staffSaving}>
                {staffSaving ? (
                  <IconLoader2 className="size-4 animate-spin" />
                ) : null}
                Add member
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Change a member's role and departments */}
      <Dialog open={!!accessMember} onOpenChange={(open) => !open && !accessSaving && setAccessMember(null)}>
        <DialogContent className="sm:max-w-md">
          <form onSubmit={saveAccess} className="space-y-4">
            <DialogHeader>
              <DialogTitle>Access for {accessMember?.name}</DialogTitle>
              <DialogDescription>Choose what this team member can open in the CRM.</DialogDescription>
            </DialogHeader>
            <div className="space-y-2">
              <Label>Role</Label>
              <Select
                value={accessMember?.role}
                onValueChange={(val) => setAccessMember((m) => ({ ...m, role: val || m.role }))}
              >
                <SelectTrigger className="w-full">
                  <SelectValue>{humanRole(accessMember?.role)}</SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {STAFF_ROLES.map((r) => (
                    <SelectItem key={r} value={r}>{humanRole(r)}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {accessMember?.role === 'STAFF' && (
              <DepartmentPicker
                value={accessMember.departments}
                onChange={(departments) => setAccessMember((m) => ({ ...m, departments }))}
                disabled={accessSaving}
              />
            )}
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setAccessMember(null)} disabled={accessSaving}>
                Cancel
              </Button>
              <Button type="submit" disabled={accessSaving}>
                {accessSaving ? <IconLoader2 className="size-4 animate-spin" /> : null}
                Save access
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <DeleteConfirmation
        isOpen={!!taskToDelete}
        onClose={() => !isDeleting && setTaskToDelete(null)}
        onConfirm={confirmDeleteTask}
        isLoading={isDeleting}
        title="Delete task?"
        description={
          taskToDelete
            ? `“${taskToDelete.title}” will be permanently removed.`
            : ''
        }
      />

      <DeleteConfirmation
        isOpen={!!memberToRemove}
        onClose={() => !isRemovingMember && setMemberToRemove(null)}
        onConfirm={confirmRemoveMember}
        isLoading={isRemovingMember}
        title="Remove team member?"
        description={
          memberToRemove
            ? `${memberToRemove.name} (${memberToRemove.email}) will be signed out and can no longer log in. Their tasks and history are kept. You can add them back later with the same email.`
            : ''
        }
        confirmText="Remove"
      />
    </div>
  )
}

export default Tasks
