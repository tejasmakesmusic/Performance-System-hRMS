'use server'

import { createClient } from '@/lib/supabase/server'
import { requireRole } from '@/lib/auth'
import { getPayoutMultiplier } from '@/lib/constants'
import type { RatingTier } from '@/lib/types'
import { revalidatePath } from 'next/cache'

export async function overrideRating(formData: FormData) {
  const user = await requireRole(['hrbp'])
  const supabase = await createClient()

  const appraisalId = formData.get('appraisal_id') as string
  const newRating = formData.get('final_rating') as RatingTier
  const justification = formData.get('justification') as string

  if (!justification?.trim()) throw new Error('Justification is required for rating overrides')

  const { data: appraisal } = await supabase
    .from('appraisals').select('*, cycles(sme_multiplier)').eq('id', appraisalId).single()

  if (!appraisal) throw new Error('Appraisal not found')

  const smeMultiplier = (appraisal as any).cycles?.sme_multiplier ?? 0
  const multiplier = getPayoutMultiplier(newRating, smeMultiplier)

  const { data: employee } = await supabase
    .from('users').select('variable_pay').eq('id', appraisal.employee_id).single()

  const payoutAmount = (employee?.variable_pay ?? 0) * multiplier

  await supabase.from('appraisals').update({
    final_rating: newRating,
    final_rating_set_by: user.id,
    payout_multiplier: multiplier,
    payout_amount: payoutAmount,
  }).eq('id', appraisalId)

  await supabase.from('audit_logs').insert({
    cycle_id: appraisal.cycle_id,
    changed_by: user.id,
    action: 'rating_override',
    entity_type: 'appraisal',
    entity_id: appraisalId,
    old_value: { final_rating: appraisal.final_rating },
    new_value: { final_rating: newRating },
    justification,
  })

  revalidatePath('/hrbp/calibration')
}

export async function lockCycle(cycleId: string) {
  const user = await requireRole(['hrbp'])
  const supabase = await createClient()

  const { data: cycle } = await supabase.from('cycles').select('sme_multiplier').eq('id', cycleId).single()
  const { data: appraisals } = await supabase.from('appraisals').select('id, employee_id, final_rating, manager_rating').eq('cycle_id', cycleId)

  for (const a of appraisals ?? []) {
    const rating = (a.final_rating ?? a.manager_rating) as RatingTier
    if (!rating) continue
    const multiplier = getPayoutMultiplier(rating, cycle?.sme_multiplier ?? 0)
    const { data: emp } = await supabase.from('users').select('variable_pay').eq('id', a.employee_id).single()
    await supabase.from('appraisals').update({
      final_rating: rating,
      payout_multiplier: multiplier,
      payout_amount: (emp?.variable_pay ?? 0) * multiplier,
      locked_at: new Date().toISOString(),
    }).eq('id', a.id)
  }

  await supabase.from('cycles').update({ status: 'locked', updated_at: new Date().toISOString() }).eq('id', cycleId)

  await supabase.from('audit_logs').insert({
    cycle_id: cycleId, changed_by: user.id, action: 'cycle_locked', entity_type: 'cycle', entity_id: cycleId, new_value: { status: 'locked' },
  })

  revalidatePath('/hrbp')
}

export async function publishCycle(cycleId: string) {
  const user = await requireRole(['hrbp'])
  const supabase = await createClient()

  await supabase.from('cycles').update({ status: 'published', published_at: new Date().toISOString(), updated_at: new Date().toISOString() }).eq('id', cycleId)

  const { data: employees } = await supabase.from('users').select('id').eq('is_active', true)
  const notifications = (employees ?? []).map(e => ({
    recipient_id: e.id,
    type: 'cycle_published' as const,
    payload: { cycle_id: cycleId },
  }))
  if (notifications.length) await supabase.from('notifications').insert(notifications)

  await supabase.from('audit_logs').insert({
    cycle_id: cycleId, changed_by: user.id, action: 'cycle_published', entity_type: 'cycle', entity_id: cycleId, new_value: { status: 'published' },
  })

  revalidatePath('/hrbp')
}
