import { createClient } from '@/lib/supabase/server'
import { requireRole } from '@/lib/auth'
import { Badge } from '@/components/ui/badge'
import { DeadlineBanner } from '@/components/deadline-banner'
import Link from 'next/link'
import type { User, Cycle } from '@/lib/types'

interface EmployeeStatus {
  employee: User
  kpiCount: number
  selfReviewStatus: 'submitted' | 'draft' | 'not_started'
  managerReviewStatus: 'submitted' | 'pending'
}

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

  const employees = (reports as User[]) ?? []

  let statuses: EmployeeStatus[] = []
  if (activeCycle && employees.length > 0) {
    const employeeIds = employees.map(e => e.id)

    const [kpisRes, reviewsRes, appraisalsRes] = await Promise.all([
      supabase.from('kpis').select('employee_id').eq('cycle_id', activeCycle.id).in('employee_id', employeeIds),
      supabase.from('reviews').select('employee_id, status').eq('cycle_id', activeCycle.id).in('employee_id', employeeIds),
      supabase.from('appraisals').select('employee_id, manager_submitted_at').eq('cycle_id', activeCycle.id).in('employee_id', employeeIds),
    ])

    const kpiCounts = new Map<string, number>()
    for (const k of kpisRes.data ?? []) {
      kpiCounts.set(k.employee_id, (kpiCounts.get(k.employee_id) ?? 0) + 1)
    }
    const reviewMap = new Map((reviewsRes.data ?? []).map(r => [r.employee_id, r.status]))
    const appraisalMap = new Map((appraisalsRes.data ?? []).map(a => [a.employee_id, a.manager_submitted_at]))

    statuses = employees.map(emp => ({
      employee: emp,
      kpiCount: kpiCounts.get(emp.id) ?? 0,
      selfReviewStatus: reviewMap.has(emp.id)
        ? (reviewMap.get(emp.id) === 'submitted' ? 'submitted' : 'draft')
        : 'not_started',
      managerReviewStatus: appraisalMap.get(emp.id) ? 'submitted' : 'pending',
    }))
  } else {
    statuses = employees.map(emp => ({
      employee: emp,
      kpiCount: 0,
      selfReviewStatus: 'not_started',
      managerReviewStatus: 'pending',
    }))
  }

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">My Team</h1>
      {!activeCycle && <p className="text-muted-foreground">No active review cycle.</p>}
      {activeCycle?.status === 'kpi_setting' && (
        <DeadlineBanner deadline={activeCycle.kpi_setting_deadline} label="KPI setting" />
      )}
      {activeCycle?.status === 'manager_review' && (
        <DeadlineBanner deadline={activeCycle.manager_review_deadline} label="Manager review" />
      )}
      {employees.length === 0 && <p className="text-muted-foreground">No direct reports found.</p>}

      {activeCycle && statuses.length > 0 && (
        <div className="rounded-md border">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/50">
                <th className="p-3 text-left">Name</th>
                <th className="p-3 text-left">Department</th>
                <th className="p-3 text-left">KPIs</th>
                <th className="p-3 text-left">Self Review</th>
                <th className="p-3 text-left">Manager Review</th>
                <th className="p-3 text-left">Actions</th>
              </tr>
            </thead>
            <tbody>
              {statuses.map(({ employee: emp, kpiCount, selfReviewStatus, managerReviewStatus }) => (
                <tr key={emp.id} className="border-b">
                  <td className="p-3 font-medium">{emp.full_name}</td>
                  <td className="p-3">{emp.department}</td>
                  <td className="p-3">
                    <Badge variant={kpiCount > 0 ? 'default' : 'secondary'}>
                      {kpiCount > 0 ? `${kpiCount} KPI${kpiCount !== 1 ? 's' : ''}` : 'Not set'}
                    </Badge>
                  </td>
                  <td className="p-3">
                    <Badge variant={
                      selfReviewStatus === 'submitted' ? 'default'
                      : selfReviewStatus === 'draft' ? 'secondary'
                      : 'outline'
                    }>
                      {selfReviewStatus === 'submitted' ? 'Submitted'
                        : selfReviewStatus === 'draft' ? 'Draft'
                        : 'Not started'}
                    </Badge>
                  </td>
                  <td className="p-3">
                    <Badge variant={managerReviewStatus === 'submitted' ? 'default' : 'outline'}>
                      {managerReviewStatus === 'submitted' ? 'Submitted' : 'Pending'}
                    </Badge>
                  </td>
                  <td className="p-3 space-x-3">
                    <Link href={`/manager/${emp.id}/kpis?cycle=${activeCycle.id}`} className="text-blue-600 hover:underline text-xs">
                      KPIs
                    </Link>
                    <Link href={`/manager/${emp.id}/review?cycle=${activeCycle.id}`} className="text-blue-600 hover:underline text-xs">
                      Review
                    </Link>
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
