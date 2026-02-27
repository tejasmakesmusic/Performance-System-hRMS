import { createClient } from '@/lib/supabase/server'
import { requireRole } from '@/lib/auth'
import type { Appraisal, Cycle } from '@/lib/types'

interface AppraisalWithCycle extends Appraisal {
  cycles: Cycle
}

export default async function EmployeeHistoryPage() {
  const user = await requireRole(['employee'])
  const supabase = await createClient()

  const { data: appraisals } = await supabase
    .from('appraisals')
    .select('*, cycles(*)')
    .eq('employee_id', user.id)
    .order('created_at', { ascending: false })

  const published = ((appraisals ?? []) as unknown as AppraisalWithCycle[])
    .filter(a => a.cycles?.status === 'published')
    .sort((a, b) => {
      // Sort by published_at descending
      const dateA = a.cycles.published_at ?? ''
      const dateB = b.cycles.published_at ?? ''
      return dateB.localeCompare(dateA)
    })

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">My Review History</h1>

      {published.length === 0 && (
        <p className="text-muted-foreground">No published reviews yet.</p>
      )}

      {published.length > 0 && (
        <div className="rounded-md border">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/50">
                <th className="p-3 text-left">Cycle</th>
                <th className="p-3 text-left">Quarter / Year</th>
                <th className="p-3 text-left">Self Rating</th>
                <th className="p-3 text-left">Manager Rating</th>
                <th className="p-3 text-left">Final Rating</th>
                <th className="p-3 text-left">Payout Multiplier</th>
                <th className="p-3 text-left">Payout Amount</th>
              </tr>
            </thead>
            <tbody>
              {published.map(a => (
                <tr key={a.id} className="border-b">
                  <td className="p-3 font-medium">{a.cycles.name}</td>
                  <td className="p-3">{a.cycles.quarter} / {a.cycles.year}</td>
                  <td className="p-3">{/* self_rating lives on Review, not Appraisal */}—</td>
                  <td className="p-3">{a.manager_rating ?? '—'}</td>
                  <td className="p-3 font-bold">{a.final_rating ?? '—'}</td>
                  <td className="p-3">{a.payout_multiplier !== null ? `${(a.payout_multiplier * 100).toFixed(0)}%` : '—'}</td>
                  <td className="p-3">{a.payout_amount !== null ? `₹${a.payout_amount.toLocaleString()}` : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
