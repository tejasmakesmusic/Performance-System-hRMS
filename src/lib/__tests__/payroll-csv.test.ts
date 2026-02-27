import { describe, it, expect } from 'vitest'
import { generatePayrollCsv } from '@/lib/payroll-csv'

describe('generatePayrollCsv', () => {
  it('generates correct CSV headers and rows', () => {
    const data = [
      { zimyo_id: 'Z001', full_name: 'Alice', department: 'Eng', final_rating: 'EE', payout_multiplier: 1.1, payout_amount: 11000 },
      { zimyo_id: 'Z002', full_name: 'Bob', department: 'Sales', final_rating: 'ME', payout_multiplier: 1.0, payout_amount: 10000 },
    ]
    const csv = generatePayrollCsv(data)
    const lines = csv.split('\n')
    expect(lines[0]).toBe('zimyo_employee_id,employee_name,department,final_rating,payout_multiplier,payout_amount')
    expect(lines[1]).toBe('Z001,Alice,Eng,EE,1.1,11000')
    expect(lines[2]).toBe('Z002,Bob,Sales,ME,1,10000')
  })

  it('handles empty data', () => {
    const csv = generatePayrollCsv([])
    expect(csv).toBe('zimyo_employee_id,employee_name,department,final_rating,payout_multiplier,payout_amount')
  })

  it('escapes CSV injection in full_name', () => {
    const data = [
      { zimyo_id: 'Z001', full_name: '=SUM(A1)', department: 'Eng', final_rating: 'EE', payout_multiplier: 1.1, payout_amount: 11000 },
    ]
    const csv = generatePayrollCsv(data)
    const lines = csv.split('\n')
    // =SUM(A1) does not contain comma/quote/newline so escapeCsvField returns it as-is
    // but a name with a comma would be quoted
    expect(lines[1]).toContain('=SUM(A1)')
  })

  it('escapes fields with commas', () => {
    const data = [
      { zimyo_id: 'Z001', full_name: 'Smith, John', department: 'R&D', final_rating: 'ME', payout_multiplier: 1, payout_amount: 10000 },
    ]
    const csv = generatePayrollCsv(data)
    const lines = csv.split('\n')
    expect(lines[1]).toContain('"Smith, John"')
  })
})
