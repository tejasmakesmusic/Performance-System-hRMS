'use server'

import { createServiceClient } from '@/lib/supabase/server'
import { requireRole } from '@/lib/auth'
import { revalidatePath } from 'next/cache'

export async function uploadUsersCsv(formData: FormData) {
  const user = await requireRole(['admin'])
  const file = formData.get('file') as File
  if (!file) throw new Error('No file provided')

  const text = await file.text()
  const lines = text.trim().split('\n')
  const headers = lines[0].split(',').map(h => h.trim().toLowerCase())

  const requiredCols = ['zimyo_id', 'email', 'full_name']
  for (const col of requiredCols) {
    if (!headers.includes(col)) throw new Error(`Missing required column: ${col}`)
  }

  const supabase = await createServiceClient()
  let added = 0, updated = 0

  const emailToId = new Map<string, string>()
  const rows: Record<string, string>[] = []

  for (let i = 1; i < lines.length; i++) {
    const values = lines[i].split(',').map(v => v.trim())
    const row: Record<string, string> = {}
    headers.forEach((h, idx) => { row[h] = values[idx] ?? '' })
    rows.push(row)

    const userData = {
      zimyo_id: row.zimyo_id,
      email: row.email,
      full_name: row.full_name,
      department: row.department || null,
      designation: row.designation || null,
      synced_at: new Date().toISOString(),
    }

    const { data: existing } = await supabase.from('users').select('id').eq('zimyo_id', row.zimyo_id).single()

    if (existing) {
      await supabase.from('users').update(userData).eq('zimyo_id', row.zimyo_id)
      emailToId.set(row.email, existing.id)
      updated++
    } else {
      const { data: newUser } = await supabase.from('users').insert(userData).select('id').single()
      if (newUser) emailToId.set(row.email, newUser.id)
      added++
    }
  }

  for (const row of rows) {
    if (row.manager_email) {
      const managerId = emailToId.get(row.manager_email)
      if (managerId) {
        await supabase.from('users').update({ manager_id: managerId }).eq('zimyo_id', row.zimyo_id)
      }
    }
  }

  await supabase.from('audit_logs').insert({
    changed_by: user.id,
    action: 'csv_upload',
    entity_type: 'user',
    new_value: { added, updated },
  })

  revalidatePath('/admin/users')
  return { added, updated }
}
