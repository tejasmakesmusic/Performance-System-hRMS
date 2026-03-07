'use server'

import { prisma } from '@/lib/prisma'
import { requireRole } from '@/lib/auth'
import type { ActionResult } from '@/lib/types'

export async function saveDraft(
  entityType: string,
  entityId: string | null,
  formData: Record<string, unknown>
): Promise<ActionResult> {
  try {
    const user = await requireRole(['employee', 'manager', 'hrbp', 'admin'])

    const existing = await prisma.draft.findFirst({
      where: {
        user_id: user.id,
        entity_type: entityType,
        entity_id: entityId ?? null,
      },
    })

    if (existing) {
      await prisma.draft.update({
        where: { id: existing.id },
        data: { form_data: formData as Parameters<typeof prisma.draft.update>[0]['data']['form_data'], updated_at: new Date() },
      })
    } else {
      await prisma.draft.create({
        data: {
          user_id: user.id,
          entity_type: entityType,
          entity_id: entityId ?? null,
          form_data: formData as Parameters<typeof prisma.draft.create>[0]['data']['form_data'],
        },
      })
    }

    return { data: null, error: null }
  } catch (e) {
    return { data: null, error: e instanceof Error ? e.message : 'Save failed' }
  }
}

export async function loadDraft(
  entityType: string,
  entityId: string | null
): Promise<ActionResult<Record<string, unknown> | null>> {
  try {
    const user = await requireRole(['employee', 'manager', 'hrbp', 'admin'])

    const draft = await prisma.draft.findFirst({
      where: {
        user_id: user.id,
        entity_type: entityType,
        entity_id: entityId ?? null,
      },
    })
    return { data: draft ? (draft.form_data as Record<string, unknown>) : null, error: null }
  } catch (e) {
    return { data: null, error: e instanceof Error ? e.message : 'Load failed' }
  }
}

export async function clearDraft(
  entityType: string,
  entityId: string | null
): Promise<ActionResult> {
  try {
    const user = await requireRole(['employee', 'manager', 'hrbp', 'admin'])

    await prisma.draft.deleteMany({
      where: {
        user_id: user.id,
        entity_type: entityType,
        entity_id: entityId ?? null,
      },
    })

    return { data: null, error: null }
  } catch (e) {
    return { data: null, error: e instanceof Error ? e.message : 'Clear failed' }
  }
}
