import { Badge } from '@/components/ui/badge'
import { CYCLE_STATUS_LABELS } from '@/lib/constants'
import type { CycleStatus } from '@/lib/types'

const STATUS_COLORS: Record<CycleStatus, string> = {
  draft: 'bg-gray-100 text-gray-800',
  kpi_setting: 'bg-blue-100 text-blue-800',
  self_review: 'bg-yellow-100 text-yellow-800',
  manager_review: 'bg-orange-100 text-orange-800',
  calibrating: 'bg-purple-100 text-purple-800',
  locked: 'bg-red-100 text-red-800',
  published: 'bg-green-100 text-green-800',
}

export function CycleStatusBadge({ status }: { status: CycleStatus }) {
  return (
    <Badge className={STATUS_COLORS[status]} variant="outline">
      {CYCLE_STATUS_LABELS[status]}
    </Badge>
  )
}
