import { createClient } from '@/lib/supabase/server'
import { requireRole } from '@/lib/auth'

export default async function HrbpAuditLogPage() {
  await requireRole(['hrbp'])
  const supabase = await createClient()

  const { data: logs } = await supabase
    .from('audit_logs')
    .select('*, users!audit_logs_changed_by_fkey(full_name)')
    .order('created_at', { ascending: false })
    .limit(200)

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Audit Log</h1>
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
            {(logs ?? []).map((log: any) => (
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
    </div>
  )
}
