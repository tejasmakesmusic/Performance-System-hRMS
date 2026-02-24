import { describe, it, expect } from 'vitest'
import { transformZimyoEmployee } from '@/lib/zimyo'

describe('transformZimyoEmployee', () => {
  it('maps Zimyo API fields to user fields', () => {
    const zimyoData = {
      employee_id: 'Z001',
      email: 'alice@company.com',
      name: 'Alice Smith',
      department: 'Engineering',
      designation: 'Senior Engineer',
    }
    const result = transformZimyoEmployee(zimyoData)
    expect(result).toEqual({
      zimyo_id: 'Z001',
      email: 'alice@company.com',
      full_name: 'Alice Smith',
      department: 'Engineering',
      designation: 'Senior Engineer',
    })
  })
})
