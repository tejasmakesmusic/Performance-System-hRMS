'use server'

import { createServiceClient } from '@/lib/supabase/server'
import { requireRole } from '@/lib/auth'
import { parseCsv } from '@/lib/csv'
import { validateEmail } from '@/lib/validate'
import { revalidatePath } from 'next/cache'
import type { ActionResult } from '@/lib/types'

export interface UploadSummary {
  added: number
  updated: number
  skipped: number
  skippedReasons: string[]
}

export async function uploadUsersCsv(_prev: ActionResult<UploadSummary>, formData: FormData): Promise<ActionResult<UploadSummary>> {
  const user = await requireRole(['admin'])
  const file = formData.get('file') as File
  if (!file) return { data: null, error: 'No file provided' }

  const text = await file.text()
  let rows: Record<string, string>[]
  try {
    rows = parseCsv(text, ['zimyo_id', 'email', 'full_name'])
  } catch (err) {
    return { data: null, error: (err as Error).message }
  }

  const supabase = await createServiceClient()
  let added = 0, updated = 0, skipped = 0
  const skippedReasons: string[] = []
  const emailToId = new Map<string, string>()
  const validRows: Record<string, string>[] = []

  // Validate and classify rows, then batch insert/update
  const toInsert: object[] = []
  const toUpdate: { zimyo_id: string; data: object }[] = []

  for (const row of rows) {
    if (!validateEmail(row.email)) {
      skipped++
      skippedReasons.push(`Row ${row.zimyo_id || '?'}: invalid email "${row.email}"`)
      continue
    }
    if (!row.zimyo_id) {
      skipped++
      skippedReasons.push(`Row skipped: missing zimyo_id`)
      continue
    }

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
      emailToId.set(row.email, existing.id)
      toUpdate.push({ zimyo_id: row.zimyo_id, data: userData })
    } else {
      toInsert.push(userData)
    }
    validRows.push(row)
  }

  // Batch insert all new users
  if (toInsert.length > 0) {
    const { data: inserted, error } = await supabase.from('users').insert(toInsert).select('id, email')
    if (error) return { data: null, error: error.message }
    added = inserted?.length ?? 0
    for (const u of inserted ?? []) {
      emailToId.set(u.email, u.id)
    }
  }

  // Update existing users (no better bulk API without RPC for mixed updates)
  for (const { zimyo_id, data } of toUpdate) {
    await supabase.from('users').update(data).eq('zimyo_id', zimyo_id)
    updated++
  }

  // Link managers via zimyo_id lookup
  for (const row of validRows) {
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
    new_value: { added, updated, skipped },
  })

  revalidatePath('/admin/users')
  return { data: { added, updated, skipped, skippedReasons }, error: null }
}
