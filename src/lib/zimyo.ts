interface ZimyoEmployee {
  employee_id: string
  email: string
  name: string
  department: string
  designation: string
  reporting_manager_email?: string
}

export function transformZimyoEmployee(data: ZimyoEmployee) {
  return {
    zimyo_id: data.employee_id,
    email: data.email,
    full_name: data.name,
    department: data.department,
    designation: data.designation,
  }
}

export async function fetchZimyoEmployees(): Promise<ZimyoEmployee[]> {
  const res = await fetch(`${process.env.ZIMYO_API_BASE_URL}/employees`, {
    headers: { Authorization: `Bearer ${process.env.ZIMYO_API_KEY}` },
  })
  if (!res.ok) throw new Error(`Zimyo API error: ${res.status}`)
  const data = await res.json()
  return data.employees
}
