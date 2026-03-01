'use client'

import { useState } from 'react'
import Link from 'next/link'
import type { AuditLog } from '@/lib/types'
import { cn } from '@/lib/utils'

interface AuditLogRow extends AuditLog {
  users?: { full_name: string } | null
}

interface AuditLogTableProps {
  logs: AuditLogRow[]
  page: number
  hasMore: boolean
  baseUrl: string
}

const ACTION_GROUPS: Record<string, string[] | null> = {
  'All':        null,
  'User Mgmt':  ['user_created','user_updated','role_change','status_change','magic_link_sent','magic_link_generated','password_reset_sent','zimyo_sync','csv_upload'],
  'Cycle':      ['cycle_status_changed','cycle_locked','cycle_published','lock_cycle','publish_cycle'],
  'Reviews':    ['review_submitted','kpi_added','kpi_deleted','manager_review_submitted'],
  'Config':     ['payout_config_updated','department_created','hrbp_departments_updated','override_rating','rating_override'],
}

export function AuditLogTable({ logs, page, hasMore, baseUrl }: AuditLogTableProps) {
  const [filter, setFilter] = useState<string>('All')

  const prevUrl = page > 1 ? `${baseUrl}?page=${page - 1}` : null
  const nextUrl = hasMore ? `${baseUrl}?page=${page + 1}` : null

  const filteredLogs = filter === 'All'
    ? logs
    : logs.filter(l => ACTION_GROUPS[filter]?.includes(l.action) ?? false)

  return (
    <div className="space-y-4">
      <div className="flex gap-2 flex-wrap mb-4">
        {Object.keys(ACTION_GROUPS).map(g => (
          <button
            key={g}
            onClick={() => setFilter(g)}
            className={cn(
              'rounded-full px-3 py-1 text-xs font-medium transition-colors',
              filter === g ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground hover:bg-muted/80'
            )}
          >
            {g}
          </button>
        ))}
      </div>

      <div className="rounded-md border">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b bg-muted/50">
              <th className="p-3 text-left">Timestamp</th>
              <th className="p-3 text-left">User</th>
              <th className="p-3 text-left">Action</th>
              <th className="p-3 text-left">Entity</th>
              <th className="p-3 text-left">Justification</th>
            </tr>
          </thead>
          <tbody>
            {filteredLogs.length === 0 && (
              <tr>
                <td colSpan={5} className="p-3 text-center text-muted-foreground">No audit log entries.</td>
              </tr>
            )}
            {filteredLogs.map(log => (
              <tr key={log.id} className="border-b">
                <td className="p-3 text-xs">{new Date(log.created_at).toLocaleString()}</td>
                <td className="p-3">{log.users?.full_name ?? 'System'}</td>
                <td className="p-3 font-mono text-xs">{log.action}</td>
                <td className="p-3 text-xs">{log.entity_type}</td>
                <td className="p-3 text-xs">{log.justification ?? '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="flex items-center justify-between text-sm">
        <span className="text-muted-foreground">Page {page}</span>
        <div className="flex gap-2">
          {prevUrl ? (
            <Link href={prevUrl} className="rounded border px-3 py-1 hover:bg-muted">Previous</Link>
          ) : (
            <span className="rounded border px-3 py-1 text-muted-foreground cursor-not-allowed">Previous</span>
          )}
          {nextUrl ? (
            <Link href={nextUrl} className="rounded border px-3 py-1 hover:bg-muted">Next</Link>
          ) : (
            <span className="rounded border px-3 py-1 text-muted-foreground cursor-not-allowed">Next</span>
          )}
        </div>
      </div>
    </div>
  )
}
