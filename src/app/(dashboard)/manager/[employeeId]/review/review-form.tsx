'use client'

import { useActionState } from 'react'
import { submitManagerRating } from '../../actions'
import { SubmitButton } from '@/components/submit-button'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { RATING_TIERS } from '@/lib/constants'
import type { ActionResult } from '@/lib/types'

const INITIAL: ActionResult = { data: null, error: null }

interface ReviewFormProps {
  cycleId: string
  employeeId: string
  defaultRating?: string
  defaultComments?: string
}

export function ReviewForm({ cycleId, employeeId, defaultRating, defaultComments }: ReviewFormProps) {
  const [state, action] = useActionState(submitManagerRating, INITIAL)

  return (
    <form action={action} className="space-y-4 rounded border p-4">
      <h2 className="text-lg font-semibold">Your Rating</h2>
      <input type="hidden" name="cycle_id" value={cycleId} />
      <input type="hidden" name="employee_id" value={employeeId} />

      {state.error && (
        <p className="rounded bg-destructive/10 px-3 py-2 text-sm text-destructive">{state.error}</p>
      )}

      <div className="space-y-2">
        <Label htmlFor="manager_rating">Rating</Label>
        <select
          id="manager_rating"
          name="manager_rating"
          className="w-full rounded border p-2"
          defaultValue={defaultRating ?? ''}
          required
        >
          <option value="">Select...</option>
          {RATING_TIERS.map(t => <option key={t.code} value={t.code}>{t.name}</option>)}
        </select>
      </div>

      <div className="space-y-2">
        <Label htmlFor="manager_comments">Comments</Label>
        <Textarea
          id="manager_comments"
          name="manager_comments"
          rows={5}
          defaultValue={defaultComments ?? ''}
          required
        />
      </div>

      <SubmitButton pendingLabel="Submitting...">Submit Rating</SubmitButton>
    </form>
  )
}
