import { escapeCsvField } from '@/lib/csv'

interface PayrollRow {
  zimyo_id: string
  full_name: string
  department: string
  final_rating: string
  payout_multiplier: number
  payout_amount: number
}

export function generatePayrollCsv(data: PayrollRow[]): string {
  const header = 'zimyo_employee_id,employee_name,department,final_rating,payout_multiplier,payout_amount'
  const rows = data.map(r =>
    [
      escapeCsvField(r.zimyo_id),
      escapeCsvField(r.full_name),
      escapeCsvField(r.department),
      escapeCsvField(r.final_rating),
      String(r.payout_multiplier),
      String(r.payout_amount),
    ].join(',')
  )
  return [header, ...rows].join('\n')
}
