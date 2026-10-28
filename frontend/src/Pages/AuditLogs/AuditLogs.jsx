import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { createColumnHelper } from '@tanstack/react-table'
import { DataTable } from '../../Layout/DataTable'
import { IconArrowsSort } from '@tabler/icons-react'
import { toast } from 'sonner'
import { apiRequest, getApiBase, toastApiEmpty } from '@/lib/api'
import { PlanLocked } from '@/components/PlanLocked'
import { isPlanLocked } from '@/lib/planLock'
import { OverflowTooltip } from '@/components/OverflowTooltip'
import { useRefreshOnReturn } from "@/lib/useRefreshOnReturn"

const columnHelper = createColumnHelper()

function formatWhen(value) {
  if (!value) return '—'
  const raw = String(value)
  const d = new Date(raw.includes('T') ? raw : raw.replace(' ', 'T') + 'Z')
  if (Number.isNaN(d.getTime())) return raw
  return d.toLocaleString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function actionBadgeClass(action) {
  const a = String(action || '').toUpperCase()
  if (/DELETE|PURGE|QUARANTINE|REVOKED/.test(a)) return 'badge-red'
  if (/CREATE|UPLOAD|LOGIN|LINKED|APPROVE|FILED|SUCCESS|IMPORTED|ADDED/.test(a)) return 'badge-green'
  if (/UPDATE|STATUS|PASSWORD|RESET|REASSIGN|CHANGE/.test(a)) return 'badge-amber'
  if (/SYNC|WEBHOOK|ORDER|DOCUMENT/.test(a)) return 'badge-sky'
  return 'bg-muted text-muted-foreground'
}

function humanizeAction(action) {
  const raw = String(action || '').trim()
  if (!raw) return '—'
  // Already human sentence (legacy free-text actions)
  if (!/^[A-Z0-9_]+$/.test(raw)) return raw
  return raw
    .split('_')
    .filter(Boolean)
    .map((w) => w.charAt(0) + w.slice(1).toLowerCase())
    .join(' ')
}

function entityLabel(type) {
  if (!type) return '—'
  return humanizeAction(type)
}

const AuditLogs = () => {
  const [logs, setLogs] = useState([])
  const [total, setTotal] = useState(0)
  const [isLoading, setIsLoading] = useState(true)
  const [loadError, setLoadError] = useState(null)
  const [planLocked, setPlanLocked] = useState(null)

  const loadLogs = useCallback(async () => {
    setIsLoading(true)
    setLoadError(null)
    setPlanLocked(null)
    try {
      // Same endpoint as legacy app.js loadAdminLogs() → GET /api/admin/activity-logs
      const res = await apiRequest('/admin/activity-logs?limit=200', {
        label: 'Audit Logs',
        silent: true,
      })
      if (!res.ok) {
        setLogs([])
        setTotal(0)
        // Not in the workspace's plan: an upgrade card instead of an error and an empty table
        if (isPlanLocked(res)) setPlanLocked(res.reason)
        else setLoadError(res.reason)
        return
      }

      const payload = res.data || {}
      const nested = payload.data || {}
      const list = Array.isArray(payload.logs)
        ? payload.logs
        : Array.isArray(nested.logs)
          ? nested.logs
          : []

      const mapped = list.map((l) => ({
        id: l.id,
        when: formatWhen(l.created_at),
        created_at: l.created_at || '',
        user: l.user_name || l.user_email || (l.user_id ? `User #${l.user_id}` : 'System'),
        email: l.user_email || l.actor_email || '',
        action: l.action || '—',
        entityType: l.entity_type || l.target_type || '',
        entityId: l.entity_id || l.target_id || '',
        details: l.details || '',
      }))

      setLogs(mapped)
      setTotal(Number(payload.total ?? nested.total ?? mapped.length) || mapped.length)
      if (mapped.length === 0) toastApiEmpty('Audit Logs', getApiBase())
    } catch (err) {
      console.error('Failed to load audit logs', err)
      setLogs([])
      setTotal(0)
      setLoadError(err?.message || 'Unexpected error')
      toast.error('Audit Logs failed to load', {
        description: err?.message || 'Unexpected error',
        duration: 8000,
      })
    } finally {
      setIsLoading(false)
    }
  }, [])
  useRefreshOnReturn(loadLogs)

  useEffect(() => {
    loadLogs()
  }, [loadLogs])

  const columns = useMemo(
    () => [
      columnHelper.accessor('when', {
        header: ({ column }) => (
          <Button
            variant="ghost"
            className="p-0 hover:bg-transparent font-semibold"
            onClick={() => column.toggleSorting(column.getIsSorted() === 'asc')}
          >
            Timestamp
            <IconArrowsSort className="ml-2 h-4 w-4" />
          </Button>
        ),
        cell: ({ row }) => (
          <span className="text-sm text-muted-foreground whitespace-nowrap">
            {row.getValue('when')}
          </span>
        ),
      }),
      columnHelper.accessor('user', {
        header: 'User',
        cell: ({ row }) => (
          <div className="flex flex-col gap-0.5 min-w-0 max-w-[200px]">
            <OverflowTooltip
              text={row.getValue('user')}
              className="text-sm font-medium text-foreground"
            />
            {row.original.email ? (
              <OverflowTooltip
                text={row.original.email}
                className="text-[11px] text-muted-foreground"
              />
            ) : null}
          </div>
        ),
      }),
      columnHelper.accessor('action', {
        header: 'Action',
        cell: ({ row }) => {
          const action = row.getValue('action')
          return (
            <Badge
              className={`${actionBadgeClass(action)} text-[11px] max-w-[220px] truncate`}
              title={action}
            >
              {humanizeAction(action)}
            </Badge>
          )
        },
      }),
      columnHelper.accessor('entityType', {
        header: 'Entity',
        cell: ({ row }) => {
          const type = row.getValue('entityType')
          const id = row.original.entityId
          if (!type && !id) {
            return <span className="text-sm text-muted-foreground">—</span>
          }
          return (
            <div className="flex flex-col gap-0.5 min-w-0">
              <Badge className="badge-sky text-[11px] w-fit capitalize">
                {entityLabel(type)}
              </Badge>
              {id ? (
                <span className="text-[11px] text-muted-foreground font-mono">#{id}</span>
              ) : null}
            </div>
          )
        },
      }),
      columnHelper.accessor('details', {
        header: 'Details',
        cell: ({ row }) => (
          <OverflowTooltip
            text={row.getValue('details') || '—'}
            className="text-sm text-muted-foreground max-w-[360px]"
          />
        ),
      }),
    ],
    []
  )

  const filterConfig = useMemo(() => {
    const actions = [...new Set(logs.map((l) => l.action).filter(Boolean))].sort((a, b) =>
      humanizeAction(a).localeCompare(humanizeAction(b))
    )
    const entities = [...new Set(logs.map((l) => l.entityType).filter(Boolean))].sort((a, b) =>
      entityLabel(a).localeCompare(entityLabel(b))
    )
    return [
      {
        columnKey: 'action',
        placeholder: 'Action',
        triggerClassName: 'w-[220px]',
        contentClassName: 'min-w-[280px]',
        options: actions.map((a) => ({ label: humanizeAction(a), value: a })),
      },
      {
        columnKey: 'entityType',
        placeholder: 'Entity',
        triggerClassName: 'w-[160px]',
        contentClassName: 'min-w-[200px]',
        options: entities.map((e) => ({ label: entityLabel(e), value: e })),
      },
    ]
  }, [logs])

  return (
    <div className="flex flex-col gap-4 w-full pb-10">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-3">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Audit Logs</h2>
          <p className="text-sm text-muted-foreground mt-1">
            Staff activity trail · {total} event{total === 1 ? '' : 's'}
          </p>
        </div>
      </div>

      {loadError && (
        <div className="rounded-md border border-destructive/30 bg-destructive/5 px-4 py-2 text-sm text-destructive">
          {loadError}
        </div>
      )}

      {planLocked ? (
        <PlanLocked message={planLocked} />
      ) : (
        <DataTable
          columns={columns}
          data={logs}
          filterConfig={filterConfig}
          isLoading={isLoading}
          searchPlaceholder="Search action, user, details…"
        />
      )}
    </div>
  )
}

export default AuditLogs
