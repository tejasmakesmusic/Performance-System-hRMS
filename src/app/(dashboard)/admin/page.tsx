import { createClient } from '@/lib/supabase/server'
import { requireRole } from '@/lib/auth'
import { CycleStatusBadge } from '@/components/cycle-status-badge'
import { Button } from '@/components/ui/button'
import Link from 'next/link'
import { advanceCycleStatus } from './actions'
import { getNextStatus } from '@/lib/cycle-machine'
import { CYCLE_STATUS_LABELS } from '@/lib/constants'
import type { Cycle } from '@/lib/types'

export default async function AdminCyclesPage() {
  await requireRole(['admin'])
  const supabase = await createClient()

  const { data: cycles } = await supabase
    .from('cycles')
    .select('*')
    .order('created_at', { ascending: false })

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Cycle Management</h1>
        <Link href="/admin/cycles/new">
          <Button>Create Cycle</Button>
        </Link>
      </div>
      <div className="rounded-md border">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b bg-muted/50">
              <th className="p-3 text-left">Name</th>
              <th className="p-3 text-left">Status</th>
              <th className="p-3 text-left">Year</th>
              <th className="p-3 text-left">Actions</th>
            </tr>
          </thead>
          <tbody>
            {(cycles as Cycle[] ?? []).map(cycle => {
              const next = getNextStatus(cycle.status)
              return (
                <tr key={cycle.id} className="border-b">
                  <td className="p-3">{cycle.name}</td>
                  <td className="p-3"><CycleStatusBadge status={cycle.status} /></td>
                  <td className="p-3">{cycle.year}</td>
                  <td className="p-3">
                    {next && (
                      <form action={advanceCycleStatus.bind(null, cycle.id, cycle.status)}>
                        <Button variant="outline" size="sm" type="submit">
                          Advance to {CYCLE_STATUS_LABELS[next]}
                        </Button>
                      </form>
                    )}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}
