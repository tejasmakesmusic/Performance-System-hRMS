import { createClient } from '@/lib/supabase/server'
import { requireRole, requireManagerOwnership } from '@/lib/auth'
import { ReviewForm } from './review-form'
import type { User, Kpi, Review, Appraisal } from '@/lib/types'

export default async function ManagerReviewPage({
  params, searchParams,
}: {
  params: Promise<{ employeeId: string }>
  searchParams: Promise<{ cycle?: string }>
}) {
  const user = await requireRole(['manager'])
  const { employeeId } = await params
  const { cycle: cycleId } = await searchParams

  await requireManagerOwnership(employeeId, user.id)

  const supabase = await createClient()

  // Validate cycleId against DB
  if (cycleId) {
    const { data: cycle } = await supabase.from('cycles').select('id').eq('id', cycleId).single()
    if (!cycle) return <p className="text-muted-foreground">Cycle not found.</p>
  }

  const [empRes, kpiRes, reviewRes, appraisalRes] = await Promise.all([
    supabase.from('users').select('*').eq('id', employeeId).single(),
    supabase.from('kpis').select('*').eq('cycle_id', cycleId ?? '').eq('employee_id', employeeId),
    supabase.from('reviews').select('*').eq('cycle_id', cycleId ?? '').eq('employee_id', employeeId).single(),
    supabase.from('appraisals').select('*').eq('cycle_id', cycleId ?? '').eq('employee_id', employeeId).single(),
  ])

  const employee = empRes.data as User
  const kpis = kpiRes.data as Kpi[] ?? []
  const review = reviewRes.data as Review | null
  const appraisal = appraisalRes.data as Appraisal | null

  return (
    <div className="max-w-2xl space-y-6">
      <h1 className="text-2xl font-bold">Review: {employee?.full_name}</h1>

      <section className="space-y-2">
        <h2 className="text-lg font-semibold">KPIs</h2>
        {kpis.length === 0 && <p className="text-muted-foreground">No KPIs set.</p>}
        {kpis.map(kpi => (
          <div key={kpi.id} className="rounded border p-3">
            <p className="font-medium">{kpi.title} ({kpi.weight}%)</p>
            {kpi.description && <p className="text-sm text-muted-foreground">{kpi.description}</p>}
          </div>
        ))}
      </section>

      {review && (
        <section className="rounded border bg-muted/30 p-4 space-y-2">
          <h2 className="text-lg font-semibold">Employee Self Assessment</h2>
          <p>Rating: <span className="font-bold">{review.self_rating}</span></p>
          <p className="whitespace-pre-wrap">{review.self_comments}</p>
        </section>
      )}

      {!appraisal?.manager_submitted_at && cycleId && (
        <ReviewForm
          cycleId={cycleId}
          employeeId={employeeId}
          defaultRating={appraisal?.manager_rating ?? undefined}
          defaultComments={appraisal?.manager_comments ?? undefined}
        />
      )}

      {appraisal?.manager_submitted_at && (
        <p className="text-green-600 font-medium">Rating submitted: {appraisal.manager_rating}</p>
      )}
    </div>
  )
}
