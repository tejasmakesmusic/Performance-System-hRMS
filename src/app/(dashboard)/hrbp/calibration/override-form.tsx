'use client'

import { useActionState } from 'react'
import { overrideRating } from '../actions'
import { SubmitButton } from '@/components/submit-button'
import { Input } from '@/components/ui/input'
import { RATING_TIERS } from '@/lib/constants'
import type { ActionResult } from '@/lib/types'

const INITIAL: ActionResult = { data: null, error: null }

interface OverrideFormProps {
  appraisalId: string
  cycleId: string
  currentRating: string | null
}

export function OverrideForm({ appraisalId, cycleId, currentRating }: OverrideFormProps) {
  const [state, action] = useActionState(overrideRating, INITIAL)

  return (
    <div className="space-y-1">
      <form action={action} className="flex gap-2">
        <input type="hidden" name="appraisal_id" value={appraisalId} />
        <input type="hidden" name="cycle_id" value={cycleId} />
        <select
          name="final_rating"
          className="rounded border px-2 py-1 text-sm"
          defaultValue={currentRating ?? ''}
        >
          {RATING_TIERS.map(t => <option key={t.code} value={t.code}>{t.code}</option>)}
        </select>
        <Input name="justification" placeholder="Justification" className="text-sm" required />
        <SubmitButton size="sm" pendingLabel="Saving...">Save</SubmitButton>
      </form>
      {state.error && (
        <p className="text-xs text-destructive">{state.error}</p>
      )}
    </div>
  )
}
