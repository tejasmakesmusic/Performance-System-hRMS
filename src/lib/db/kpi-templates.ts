import { prisma } from '@/lib/prisma'

/**
 * Creates KPIs for an employee from a role template.
 * Replaces the apply_kpi_template() PL/pgSQL RPC.
 */
export async function applyKpiTemplate(
  roleSlug: string,
  cycleId: string,
  employeeId: string
): Promise<void> {
  const employee = await prisma.user.findUnique({ where: { id: employeeId } })
  if (!employee?.manager_id) {
    throw new Error(`Employee ${employeeId} has no manager assigned`)
  }

  const templates = await prisma.kpiTemplate.findMany({
    where: { role_slug: roleSlug, is_active: true },
    orderBy: { sort_order: 'asc' },
  })

  for (const t of templates) {
    const existing = await prisma.kpi.findFirst({
      where: { cycle_id: cycleId, employee_id: employeeId, title: t.title },
    })
    if (existing) continue

    await prisma.kpi.create({
      data: {
        cycle_id:    cycleId,
        employee_id: employeeId,
        manager_id:  employee.manager_id,
        title:       t.title,
        description: t.description,
        weight:      t.weight,
      },
    })
  }
}
