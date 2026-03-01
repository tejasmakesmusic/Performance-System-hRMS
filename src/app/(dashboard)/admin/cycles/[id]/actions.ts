'use server'

import { createServiceClient } from '@/lib/supabase/server'
import { requireRole } from '@/lib/auth'
import { revalidatePath } from 'next/cache'
import type { ActionResult } from '@/lib/types'

export async function sendSelfReviewReminders(cycleId: string): Promise<ActionResult<{ sent: number }>> {
  const user = await requireRole(['admin'])
  const supabase = await createServiceClient()

  const { data: allActive } = await supabase
    .from('users').select('id').eq('is_active', true).eq('role', 'employee')
  const { data: submitted } = await supabase
    .from('reviews').select('employee_id').eq('cycle_id', cycleId).eq('status', 'submitted')

  const submittedIds = new Set((submitted ?? []).map(r => r.employee_id))
  const pending = (allActive ?? []).filter(u => !submittedIds.has(u.id))

  if (pending.length === 0) return { data: { sent: 0 }, error: null }

  const notifications = pending.map(u => ({
    user_id: u.id,
    type: 'review_reminder' as const,
    payload: { cycle_id: cycleId, kind: 'self_review' },
  }))

  const { error } = await supabase.from('notifications').insert(notifications)
  if (error) return { data: null, error: error.message }

  await supabase.from('audit_logs').insert({
    changed_by: user.id,
    action: 'send_reminders',
    entity_type: 'cycle',
    entity_id: cycleId,
    new_value: { kind: 'self_review', count: pending.length },
  })

  revalidatePath(`/admin/cycles/${cycleId}`)
  return { data: { sent: pending.length }, error: null }
}

export async function sendManagerReviewReminders(cycleId: string): Promise<ActionResult<{ sent: number }>> {
  const user = await requireRole(['admin'])
  const supabase = await createServiceClient()

  const { data: appraisals } = await supabase
    .from('appraisals').select('employee_id, manager_id, manager_submitted_at').eq('cycle_id', cycleId)

  const pendingManagerIds = [...new Set(
    (appraisals ?? []).filter(a => !a.manager_submitted_at).map(a => a.manager_id)
  )]

  if (pendingManagerIds.length === 0) return { data: { sent: 0 }, error: null }

  const notifications = pendingManagerIds.map(id => ({
    user_id: id,
    type: 'review_reminder' as const,
    payload: { cycle_id: cycleId, kind: 'manager_review' },
  }))

  const { error } = await supabase.from('notifications').insert(notifications)
  if (error) return { data: null, error: error.message }

  await supabase.from('audit_logs').insert({
    changed_by: user.id,
    action: 'send_reminders',
    entity_type: 'cycle',
    entity_id: cycleId,
    new_value: { kind: 'manager_review', count: pendingManagerIds.length },
  })

  revalidatePath(`/admin/cycles/${cycleId}`)
  return { data: { sent: pendingManagerIds.length }, error: null }
}
