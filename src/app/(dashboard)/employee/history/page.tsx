import { createClient } from '@/lib/supabase/server'
import { requireRole } from '@/lib/auth'
import { CycleStatusBadge } from '@/components/cycle-status-badge'

export default async function EmployeeHistoryPage() {
  const user = await requireRole(['employee'])
  const supabase = await createClient()

  const { data: appraisals } = await supabase
    .from('appraisals')
    .select('*, cycles(*)')
    .eq('employee_id', user.id)

  const published = (appraisals ?? []).filter((a: any) => a.cycles?.status === 'published')

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">My History</h1>
      {published.length === 0 && <p className="text-muted-foreground">No published reviews yet.</p>}
      <div className="grid gap-4">
        {published.map((a: any) => (
          <div key={a.id} className="rounded border p-4 space-y-2">
            <div className="flex items-center justify-between">
              <p className="font-medium">{a.cycles?.name}</p>
              <CycleStatusBadge status="published" />
            </div>
            <p>Final Rating: <span className="font-bold">{a.final_rating}</span></p>
            <p>Payout: <span className="font-bold">{a.payout_multiplier ? `${(a.payout_multiplier * 100).toFixed(0)}%` : 'N/A'}</span></p>
          </div>
        ))}
      </div>
    </div>
  )
}
