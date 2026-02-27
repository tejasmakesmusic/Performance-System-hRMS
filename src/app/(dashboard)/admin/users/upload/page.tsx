import { requireRole } from '@/lib/auth'
import { uploadUsersCsv, type UploadSummary } from './actions'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import type { ActionResult } from '@/lib/types'

const INITIAL: ActionResult<UploadSummary> = { data: { added: 0, updated: 0, skipped: 0, skippedReasons: [] }, error: null }

export default async function UploadUsersPage() {
  await requireRole(['admin'])

  return (
    <div className="max-w-lg space-y-6">
      <h1 className="text-2xl font-bold">Upload Users CSV</h1>
      <p className="text-sm text-muted-foreground">
        CSV columns: zimyo_id, email, full_name, department, designation, manager_email
      </p>
      <form action={async (fd: FormData) => { await uploadUsersCsv(INITIAL, fd) }} className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="file">CSV File</Label>
          <Input id="file" name="file" type="file" accept=".csv" required />
        </div>
        <Button type="submit">Upload & Import</Button>
      </form>
    </div>
  )
}
