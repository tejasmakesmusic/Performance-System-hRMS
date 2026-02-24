import { requireRole } from '@/lib/auth'
import { createCycle } from '../../actions'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

export default async function NewCyclePage() {
  await requireRole(['admin', 'hrbp'])

  return (
    <div className="max-w-lg space-y-6">
      <h1 className="text-2xl font-bold">Create New Cycle</h1>
      <form action={createCycle} className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="name">Cycle Name</Label>
          <Input id="name" name="name" placeholder="Q1 2026" required />
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label htmlFor="quarter">Quarter</Label>
            <Input id="quarter" name="quarter" placeholder="Q1" required />
          </div>
          <div className="space-y-2">
            <Label htmlFor="year">Year</Label>
            <Input id="year" name="year" type="number" defaultValue={2026} required />
          </div>
        </div>
        <div className="space-y-2">
          <Label htmlFor="sme_multiplier">SME Payout Multiplier</Label>
          <Input id="sme_multiplier" name="sme_multiplier" type="number" step="0.01" placeholder="0.50" required />
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label htmlFor="kpi_setting_deadline">KPI Setting Deadline</Label>
            <Input id="kpi_setting_deadline" name="kpi_setting_deadline" type="date" />
          </div>
          <div className="space-y-2">
            <Label htmlFor="self_review_deadline">Self Review Deadline</Label>
            <Input id="self_review_deadline" name="self_review_deadline" type="date" />
          </div>
          <div className="space-y-2">
            <Label htmlFor="manager_review_deadline">Manager Review Deadline</Label>
            <Input id="manager_review_deadline" name="manager_review_deadline" type="date" />
          </div>
          <div className="space-y-2">
            <Label htmlFor="calibration_deadline">Calibration Deadline</Label>
            <Input id="calibration_deadline" name="calibration_deadline" type="date" />
          </div>
        </div>
        <Button type="submit">Create Cycle</Button>
      </form>
    </div>
  )
}
