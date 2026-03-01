import { createClient } from '@/lib/supabase/server'
import { requireRole } from '@/lib/auth'
import { notFound } from 'next/navigation'
import { CycleStatusBadge } from '@/components/cycle-status-badge'
import { Badge } from '@/components/ui/badge'
import Link from 'next/link'
import { getNextStatus } from '@/lib/cycle-machine'
import type { Cycle, User, Review, Appraisal } from '@/lib/types'
import { CycleActionsClient } from './cycle-actions-client'

type PayoutRow = {
  employee_id: string
  final_rating: string | null
  payout_multiplier: number | null
  payout_amount: number | null
  users: { full_name: string; base_salary: number; department: { name: string } | null } | null
}

function daysUntil(d: string | null) {
  if (!d) return null
  return Math.ceil((new Date(d).getTime() - Date.now()) / 86400000)
}

export default async function CycleDetailPage({ params }: { params: Promise<{ id: string }> }) {
  await requireRole(['admin'])
  const { id } = await params
  const supabase = await createClient()

  const { data: cycle } = await supabase.from('cycles').select('*').eq('id', id).single()
  if (!cycle) notFound()

  const isLockedOrPublished = (cycle as Cycle).status === 'locked' || (cycle as Cycle).status === 'published'

  const [usersRes, reviewsRes, appraisalsRes] = await Promise.all([
    supabase.from('users').select('id, full_name, department:departments(name), manager_id, role').eq('is_active', true).neq('role', 'admin').neq('role', 'hrbp'),
    supabase.from('reviews').select('employee_id, status').eq('cycle_id', id),
    supabase.from('appraisals').select('employee_id, manager_id, manager_submitted_at, final_rating').eq('cycle_id', id),
  ])

  const payouts = isLockedOrPublished ? await supabase
    .from('appraisals')
    .select(`
      employee_id,
      final_rating,
      payout_multiplier,
      payout_amount,
      users!appraisals_employee_id_fkey(full_name, department:departments(name))
    `)
    .eq('cycle_id', id)
    .not('locked_at', 'is', null)
    .order('payout_amount', { ascending: false })
    .then(r => r.data as PayoutRow[] | null) : null

  const users = (usersRes.data ?? []) as unknown as Pick<User, 'id' | 'full_name' | 'department' | 'manager_id' | 'role'>[]
  const reviews = (reviewsRes.data ?? []) as Pick<Review, 'employee_id' | 'status'>[]
  const appraisals = (appraisalsRes.data ?? []) as Pick<Appraisal, 'employee_id' | 'manager_id' | 'manager_submitted_at' | 'final_rating'>[]

  const reviewMap = new Map(reviews.map(r => [r.employee_id, r]))
  const appraisalMap = new Map(appraisals.map(a => [a.employee_id, a]))
  const userMap = new Map(users.map(u => [u.id, u]))

  const employees = users.filter(u => u.role === 'employee')
  const deadlineDays = daysUntil((cycle as Cycle).manager_review_deadline)
  const isOverdue = deadlineDays !== null && deadlineDays < 0

  const pendingSelfReviews = employees.filter(e => reviewMap.get(e.id)?.status !== 'submitted').length
  const pendingManagerReviews = employees.filter(e => !appraisalMap.get(e.id)?.manager_submitted_at).length

  const next = getNextStatus((cycle as Cycle).status)

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div className="space-y-1">
          <Link href="/admin/cycles" className="text-muted-foreground hover:underline text-sm">← Cycles</Link>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold">{(cycle as Cycle).name}</h1>
            <CycleStatusBadge status={(cycle as Cycle).status} />
          </div>
          <p className="text-sm text-muted-foreground">
            {(cycle as Cycle).quarter} {(cycle as Cycle).year}
            {(cycle as Cycle).manager_review_deadline && (
              <> · Manager deadline: {new Date((cycle as Cycle).manager_review_deadline!).toLocaleDateString()}
                {isOverdue && <span className="ml-1 text-destructive font-medium">(overdue)</span>}
              </>
            )}
          </p>
        </div>
        <CycleActionsClient
          cycleId={id}
          currentStatus={(cycle as Cycle).status}
          nextStatus={next}
          pendingSelfCount={pendingSelfReviews}
          pendingManagerCount={pendingManagerReviews}
        />
      </div>

      {/* Per-cycle multiplier overrides */}
      {((cycle as Cycle).fee_multiplier != null || (cycle as Cycle).ee_multiplier != null || (cycle as Cycle).me_multiplier != null) && (
        <div className="text-sm">
          <p className="text-xs font-semibold text-muted-foreground mb-1">Per-cycle multiplier overrides:</p>
          <div className="flex gap-4">
            {(cycle as Cycle).fee_multiplier != null && <span>FEE: ×{(cycle as Cycle).fee_multiplier}</span>}
            {(cycle as Cycle).ee_multiplier != null && <span>EE: ×{(cycle as Cycle).ee_multiplier}</span>}
            {(cycle as Cycle).me_multiplier != null && <span>ME: ×{(cycle as Cycle).me_multiplier}</span>}
          </div>
        </div>
      )}

      {/* Per-employee table */}
      <div className="rounded-md border">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b bg-muted/50">
              <th className="p-3 text-left">Employee</th>
              <th className="p-3 text-left">Department</th>
              <th className="p-3 text-left">Manager</th>
              <th className="p-3 text-left">Self Review</th>
              <th className="p-3 text-left">Manager Review</th>
              <th className="p-3 text-left">Rating</th>
            </tr>
          </thead>
          <tbody>
            {employees.map(emp => {
              const review = reviewMap.get(emp.id)
              const appraisal = appraisalMap.get(emp.id)
              const manager = emp.manager_id ? userMap.get(emp.manager_id) : null
              const selfDone = review?.status === 'submitted'
              const managerDone = !!appraisal?.manager_submitted_at
              const managerOverdue = isOverdue && !managerDone

              return (
                <tr key={emp.id} className="border-t">
                  <td className="p-3 font-medium">{emp.full_name}</td>
                  <td className="p-3 text-muted-foreground">{emp.department?.name ?? '—'}</td>
                  <td className="p-3 text-muted-foreground">{manager?.full_name ?? '—'}</td>
                  <td className="p-3">
                    <Badge variant={selfDone ? 'default' : 'secondary'}
                      className={selfDone ? 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400' : ''}>
                      {selfDone ? 'Submitted' : 'Pending'}
                    </Badge>
                  </td>
                  <td className="p-3">
                    <Badge variant={managerDone ? 'default' : 'secondary'}
                      className={managerDone ? 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400' : managerOverdue ? 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400' : ''}>
                      {managerDone ? 'Done' : managerOverdue ? 'Overdue' : 'Pending'}
                    </Badge>
                  </td>
                  <td className="p-3 text-muted-foreground">{appraisal?.final_rating ?? '—'}</td>
                </tr>
              )
            })}
            {employees.length === 0 && (
              <tr><td colSpan={6} className="p-6 text-center text-muted-foreground">No employees in scope</td></tr>
            )}
          </tbody>
        </table>
      </div>
      {/* Payout summary table */}
      {isLockedOrPublished && payouts && payouts.length > 0 && (
        <div className="rounded-lg border p-5 space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="font-semibold">Payout Summary</h2>
            {(() => {
              const totalPayout = payouts.reduce((s, p) => s + (p.payout_amount ?? 0), 0)
              return (
                <span className="text-sm text-muted-foreground">
                  Total Payout: ₹{totalPayout.toLocaleString('en-IN')}
                  {(cycle as Cycle).total_budget ? ` / ₹${(cycle as Cycle).total_budget!.toLocaleString('en-IN')} budget` : ''}
                </span>
              )
            })()}
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b">
                  <th className="text-left pb-2 text-xs font-semibold text-muted-foreground">Employee</th>
                  <th className="text-left pb-2 text-xs font-semibold text-muted-foreground">Dept</th>
                  <th className="text-left pb-2 text-xs font-semibold text-muted-foreground">Rating</th>
                  <th className="text-right pb-2 text-xs font-semibold text-muted-foreground">Multiplier</th>
                  <th className="text-right pb-2 text-xs font-semibold text-muted-foreground">Payout</th>
                </tr>
              </thead>
              <tbody>
                {payouts.map(p => (
                  <tr key={p.employee_id} className="border-b last:border-0">
                    <td className="py-2">{p.users?.full_name}</td>
                    <td className="py-2 text-muted-foreground">{p.users?.department?.name ?? '—'}</td>
                    <td className="py-2">{p.final_rating ?? '—'}</td>
                    <td className="py-2 text-right">×{p.payout_multiplier?.toFixed(3) ?? '—'}</td>
                    <td className="py-2 text-right font-medium">₹{(p.payout_amount ?? 0).toLocaleString('en-IN')}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}
