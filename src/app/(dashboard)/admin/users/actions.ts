'use server'

import { createServiceClient } from '@/lib/supabase/server'
import { requireRole } from '@/lib/auth'
import { fetchZimyoEmployees, transformZimyoEmployee } from '@/lib/zimyo'
import { revalidatePath } from 'next/cache'

export async function triggerZimyoSync() {
  const user = await requireRole(['admin'])
  const supabase = await createServiceClient()

  const zimyoEmployees = await fetchZimyoEmployees()
  let added = 0, updated = 0, deactivated = 0

  const emailToId = new Map<string, string>()

  for (const emp of zimyoEmployees) {
    const transformed = transformZimyoEmployee(emp)
    const { data: existing } = await supabase
      .from('users')
      .select('id')
      .eq('zimyo_id', transformed.zimyo_id)
      .single()

    if (existing) {
      await supabase.from('users').update({ ...transformed, is_active: true, synced_at: new Date().toISOString() }).eq('zimyo_id', transformed.zimyo_id)
      emailToId.set(transformed.email, existing.id)
      updated++
    } else {
      const { data: newUser } = await supabase.from('users').insert({ ...transformed, synced_at: new Date().toISOString() }).select('id').single()
      if (newUser) emailToId.set(transformed.email, newUser.id)
      added++
    }
  }

  for (const emp of zimyoEmployees) {
    if (emp.reporting_manager_email) {
      const managerId = emailToId.get(emp.reporting_manager_email)
      if (managerId) {
        await supabase.from('users').update({ manager_id: managerId }).eq('zimyo_id', emp.employee_id)
      }
    }
  }

  const activeZimyoIds = zimyoEmployees.map(e => e.employee_id)
  const { data: allUsers } = await supabase.from('users').select('zimyo_id').eq('is_active', true)
  for (const u of allUsers ?? []) {
    if (!activeZimyoIds.includes(u.zimyo_id)) {
      await supabase.from('users').update({ is_active: false }).eq('zimyo_id', u.zimyo_id)
      deactivated++
    }
  }

  await supabase.from('audit_logs').insert({
    changed_by: user.id,
    action: 'zimyo_sync',
    entity_type: 'user',
    new_value: { added, updated, deactivated },
  })

  revalidatePath('/admin/users')
  return { added, updated, deactivated }
}

export async function updateUserRole(userId: string, role: string) {
  const user = await requireRole(['admin'])
  const supabase = await createServiceClient()

  const { data: target } = await supabase.from('users').select('role').eq('id', userId).single()

  await supabase.from('users').update({ role }).eq('id', userId)

  await supabase.from('audit_logs').insert({
    changed_by: user.id,
    action: 'role_change',
    entity_type: 'user',
    entity_id: userId,
    old_value: { role: target?.role },
    new_value: { role },
  })

  revalidatePath('/admin/users')
}
