import { requireRole } from '@/lib/auth'
import { uploadUsersCsv } from './actions'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

export default async function UploadUsersPage() {
  await requireRole(['admin'])

  return (
    <div className="max-w-lg space-y-6">
      <h1 className="text-2xl font-bold">Upload Users CSV</h1>
      <p className="text-sm text-muted-foreground">
        CSV columns: zimyo_id, email, full_name, department, designation, manager_email
      </p>
      <form action={async (fd: FormData) => { await uploadUsersCsv(fd) }} className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="file">CSV File</Label>
          <Input id="file" name="file" type="file" accept=".csv" required />
        </div>
        <Button type="submit">Upload & Import</Button>
      </form>
    </div>
  )
}
