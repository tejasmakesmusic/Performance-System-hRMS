import { createClient } from '@/lib/supabase/server'
import { requireRole } from '@/lib/auth'
import { CycleStatusBadge } from '@/components/cycle-status-badge'
import Link from 'next/link'
import type { Cycle } from '@/lib/types'

export default async function HrbpPage() {
  await requireRole(['hrbp'])
  const supabase = await createClient()
  const { data: cycles } = await supabase.from('cycles').select('*').order('created_at', { ascending: false })

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Review Cycles</h1>
      <div className="grid gap-4">
        {(cycles as Cycle[] ?? []).map(cycle => (
          <div key={cycle.id} className="flex items-center justify-between rounded border p-4">
            <div>
              <p className="font-medium">{cycle.name}</p>
              <CycleStatusBadge status={cycle.status} />
            </div>
            {['calibrating', 'locked'].includes(cycle.status) && (
              <Link href={`/hrbp/calibration?cycle=${cycle.id}`} className="text-blue-600 hover:underline">
                Calibrate
              </Link>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}
