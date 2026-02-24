'use server'

import { createClient } from '@/lib/supabase/server'
import { requireRole } from '@/lib/auth'
import { revalidatePath } from 'next/cache'

export async function addKpi(formData: FormData) {
  const user = await requireRole(['manager'])
  const supabase = await createClient()

  const { error } = await supabase.from('kpis').insert({
    cycle_id: formData.get('cycle_id') as string,
    employee_id: formData.get('employee_id') as string,
    manager_id: user.id,
    title: formData.get('title') as string,
    description: formData.get('description') as string || null,
    weight: Number(formData.get('weight')) || null,
  })

  if (error) throw new Error(error.message)
  revalidatePath(`/manager/${formData.get('employee_id')}/kpis`)
}

export async function deleteKpi(kpiId: string, employeeId: string) {
  await requireRole(['manager'])
  const supabase = await createClient()
  await supabase.from('kpis').delete().eq('id', kpiId)
  revalidatePath(`/manager/${employeeId}/kpis`)
}

export async function submitManagerRating(formData: FormData) {
  const user = await requireRole(['manager'])
  const supabase = await createClient()

  const cycleId = formData.get('cycle_id') as string
  const employeeId = formData.get('employee_id') as string
  const rating = formData.get('manager_rating') as string
  const comments = formData.get('manager_comments') as string

  const { error } = await supabase.from('appraisals').upsert({
    cycle_id: cycleId,
    employee_id: employeeId,
    manager_id: user.id,
    manager_rating: rating,
    manager_comments: comments,
    manager_submitted_at: new Date().toISOString(),
    final_rating: rating,
    payout_multiplier: null,
  }, { onConflict: 'cycle_id,employee_id' })

  if (error) throw new Error(error.message)
  revalidatePath('/manager')
}
