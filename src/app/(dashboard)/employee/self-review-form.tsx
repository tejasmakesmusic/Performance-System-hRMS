'use client'

import { useActionState } from 'react'
import { submitSelfReview, saveDraftReview } from './actions'
import { SubmitButton } from '@/components/submit-button'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { RATING_TIERS } from '@/lib/constants'
import type { ActionResult, Review } from '@/lib/types'

const INITIAL: ActionResult = { data: null, error: null }

interface SelfReviewFormProps {
  cycleId: string
  review: Review | null
}

export function SelfReviewForm({ cycleId, review }: SelfReviewFormProps) {
  const [submitState, submitAction] = useActionState(submitSelfReview, INITIAL)
  const [draftState, draftAction] = useActionState(saveDraftReview, INITIAL)

  const error = submitState.error ?? draftState.error

  return (
    <section className="space-y-4 rounded border p-4">
      <h2 className="text-lg font-semibold">Self Assessment</h2>
      <form className="space-y-4">
        <input type="hidden" name="cycle_id" value={cycleId} />

        {error && (
          <p className="rounded bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</p>
        )}

        <div className="space-y-2">
          <Label htmlFor="self_rating">Self Rating</Label>
          <select
            id="self_rating"
            name="self_rating"
            className="w-full rounded border p-2"
            defaultValue={review?.self_rating ?? ''}
          >
            <option value="">Select...</option>
            {RATING_TIERS.map(t => <option key={t.code} value={t.code}>{t.name}</option>)}
          </select>
        </div>

        <div className="space-y-2">
          <Label htmlFor="self_comments">Comments</Label>
          <Textarea
            id="self_comments"
            name="self_comments"
            rows={5}
            defaultValue={review?.self_comments ?? ''}
            required
          />
        </div>

        <div className="flex gap-2">
          <SubmitButton formAction={draftAction} variant="outline" pendingLabel="Saving...">
            Save Draft
          </SubmitButton>
          <SubmitButton formAction={submitAction} pendingLabel="Submitting...">
            Submit
          </SubmitButton>
        </div>
      </form>
    </section>
  )
}
