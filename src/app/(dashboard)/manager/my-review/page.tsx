import { createClient } from '@/lib/supabase/server'
import { requireRole } from '@/lib/auth'
import { CycleStatusBadge } from '@/components/cycle-status-badge'
import type { Cycle, Kpi, Review, Appraisal } from '@/lib/types'

export default async function ManagerMyReviewPage() {
  const user = await requireRole(['manager'])
  const supabase = await createClient()

  // Managers are also employees — show their own review status
  const { data: cycles } = await supabase
    .from('cycles')
    .select('*')
    .neq('status', 'draft')
    .order('created_at', { ascending: false })
    .limit(1)

  const cycle = (cycles as Cycle[])?.[0]

  if (!cycle) return <p className="text-muted-foreground">No active review cycle.</p>

  const [kpiRes, reviewRes, appraisalRes] = await Promise.all([
    supabase.from('kpis').select('*').eq('cycle_id', cycle.id).eq('employee_id', user.id),
    supabase.from('reviews').select('*').eq('cycle_id', cycle.id).eq('employee_id', user.id).single(),
    supabase.from('appraisals').select('*').eq('cycle_id', cycle.id).eq('employee_id', user.id).single(),
  ])

  const kpis = kpiRes.data as Kpi[] ?? []
  const review = reviewRes.data as Review | null
  const appraisal = appraisalRes.data as Appraisal | null
  const isPublished = cycle.status === 'published'

  return (
    <div className="max-w-2xl space-y-6">
      <div className="flex items-center gap-3">
        <h1 className="text-2xl font-bold">My Review — {cycle.name}</h1>
        <CycleStatusBadge status={cycle.status} />
      </div>

      <section className="space-y-2">
        <h2 className="text-lg font-semibold">My KPIs</h2>
        {kpis.length === 0 && <p className="text-muted-foreground">No KPIs assigned yet.</p>}
        {kpis.map(kpi => (
          <div key={kpi.id} className="rounded border p-3">
            <p className="font-medium">{kpi.title}</p>
            {kpi.description && <p className="text-sm text-muted-foreground">{kpi.description}</p>}
            <p className="text-sm">Weight: {kpi.weight}%</p>
          </div>
        ))}
      </section>

      <section className="space-y-2">
        <h2 className="text-lg font-semibold">Self Assessment</h2>
        {!review && <p className="text-muted-foreground">Not started.</p>}
        {review && review.status === 'draft' && (
          <p className="text-yellow-600">Draft — not yet submitted.</p>
        )}
        {review && review.status === 'submitted' && (
          <div className="rounded border bg-muted/30 p-3 space-y-1">
            <p>Rating: <span className="font-bold">{review.self_rating}</span></p>
            <p className="whitespace-pre-wrap text-sm">{review.self_comments}</p>
          </div>
        )}
      </section>

      {isPublished && appraisal && (
        <section className="rounded border bg-muted/30 p-4 space-y-2">
          <h2 className="text-lg font-semibold">Final Result</h2>
          <p>Final Rating: <span className="font-bold">{appraisal.final_rating}</span></p>
          <p>Payout Multiplier: <span className="font-bold">{appraisal.payout_multiplier ? `${(appraisal.payout_multiplier * 100).toFixed(0)}%` : 'N/A'}</span></p>
          {appraisal.payout_amount !== null && (
            <p>Payout Amount: <span className="font-bold">₹{appraisal.payout_amount.toLocaleString()}</span></p>
          )}
        </section>
      )}
    </div>
  )
}
