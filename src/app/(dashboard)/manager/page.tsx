import { createClient } from '@/lib/supabase/server'
import { requireRole } from '@/lib/auth'
import Link from 'next/link'
import type { User, Cycle } from '@/lib/types'

export default async function ManagerTeamPage() {
  const user = await requireRole(['manager'])
  const supabase = await createClient()

  const { data: cycles } = await supabase
    .from('cycles')
    .select('*')
    .neq('status', 'draft')
    .neq('status', 'published')
    .order('created_at', { ascending: false })
    .limit(1)

  const activeCycle = (cycles as Cycle[])?.[0]

  const { data: reports } = await supabase
    .from('users')
    .select('*')
    .eq('manager_id', user.id)
    .eq('is_active', true)

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">My Team</h1>
      {!activeCycle && <p className="text-muted-foreground">No active review cycle.</p>}
      {activeCycle && (
        <div className="rounded-md border">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/50">
                <th className="p-3 text-left">Name</th>
                <th className="p-3 text-left">Department</th>
                <th className="p-3 text-left">Actions</th>
              </tr>
            </thead>
            <tbody>
              {(reports as User[] ?? []).map(emp => (
                <tr key={emp.id} className="border-b">
                  <td className="p-3">{emp.full_name}</td>
                  <td className="p-3">{emp.department}</td>
                  <td className="p-3">
                    {activeCycle.status === 'kpi_setting' && (
                      <Link href={`/manager/${emp.id}/kpis?cycle=${activeCycle.id}`} className="text-blue-600 hover:underline">
                        Set KPIs
                      </Link>
                    )}
                    {activeCycle.status === 'manager_review' && (
                      <Link href={`/manager/${emp.id}/review?cycle=${activeCycle.id}`} className="text-blue-600 hover:underline">
                        Submit Review
                      </Link>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
