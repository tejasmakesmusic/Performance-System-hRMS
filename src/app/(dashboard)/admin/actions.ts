'use server'

import { createClient } from '@/lib/supabase/server'
import { requireRole } from '@/lib/auth'
import { canTransition, getTransitionRequirements } from '@/lib/cycle-machine'
import type { CycleStatus } from '@/lib/types'
import { revalidatePath } from 'next/cache'

export async function createCycle(formData: FormData) {
  const user = await requireRole(['admin', 'hrbp'])
  const supabase = await createClient()

  const { error } = await supabase.from('cycles').insert({
    name: formData.get('name') as string,
    quarter: formData.get('quarter') as string,
    year: Number(formData.get('year')),
    sme_multiplier: Number(formData.get('sme_multiplier')),
    kpi_setting_deadline: formData.get('kpi_setting_deadline') as string || null,
    self_review_deadline: formData.get('self_review_deadline') as string || null,
    manager_review_deadline: formData.get('manager_review_deadline') as string || null,
    calibration_deadline: formData.get('calibration_deadline') as string || null,
    created_by: user.id,
  })

  if (error) throw new Error(error.message)
  revalidatePath('/admin')
}

export async function advanceCycleStatus(cycleId: string, currentStatus: CycleStatus) {
  const user = await requireRole(['admin', 'hrbp'])
  const supabase = await createClient()

  const nextMap: Record<string, CycleStatus> = {
    draft: 'kpi_setting',
    kpi_setting: 'self_review',
    self_review: 'manager_review',
    manager_review: 'calibrating',
    calibrating: 'locked',
    locked: 'published',
  }
  const nextStatus = nextMap[currentStatus]
  if (!nextStatus || !canTransition(currentStatus, nextStatus)) {
    throw new Error(`Cannot advance from ${currentStatus}`)
  }

  const req = getTransitionRequirements(currentStatus, nextStatus)
  if (!req?.allowedRoles.includes(user.role)) {
    throw new Error('Not authorized for this transition')
  }

  const updateData: Record<string, unknown> = {
    status: nextStatus,
    updated_at: new Date().toISOString(),
  }
  if (nextStatus === 'published') {
    updateData.published_at = new Date().toISOString()
  }

  const { error } = await supabase
    .from('cycles')
    .update(updateData)
    .eq('id', cycleId)

  if (error) throw new Error(error.message)

  await supabase.from('audit_logs').insert({
    cycle_id: cycleId,
    changed_by: user.id,
    action: 'cycle_status_change',
    entity_type: 'cycle',
    entity_id: cycleId,
    old_value: { status: currentStatus },
    new_value: { status: nextStatus },
  })

  revalidatePath('/admin')
  revalidatePath('/hrbp')
}
