'use client'

import { RATING_TIERS } from '@/lib/constants'
import type { RatingTier } from '@/lib/types'

interface Props {
  distribution: Record<RatingTier, number>
  total: number
}

export function BellCurveChart({ distribution, total }: Props) {
  const maxCount = Math.max(...Object.values(distribution), 1)

  return (
    <div className="space-y-2">
      <h3 className="font-semibold">Rating Distribution</h3>
      <div className="flex items-end gap-4 h-48">
        {RATING_TIERS.map(tier => {
          const count = distribution[tier.code] ?? 0
          const pct = total > 0 ? ((count / total) * 100).toFixed(1) : '0'
          const height = maxCount > 0 ? (count / maxCount) * 100 : 0
          return (
            <div key={tier.code} className="flex flex-1 flex-col items-center gap-1">
              <span className="text-xs">{count} ({pct}%)</span>
              <div className="w-full bg-primary/20 rounded-t" style={{ height: `${height}%` }}>
                <div className="w-full h-full bg-primary rounded-t" />
              </div>
              <span className="text-xs font-medium">{tier.code}</span>
            </div>
          )
        })}
      </div>
    </div>
  )
}
