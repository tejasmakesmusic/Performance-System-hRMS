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
  const base = process.env.ZIMYO_API_BASE_URL
  const key  = process.env.ZIMYO_API_KEY
  if (!base || !key) {
    throw new Error('Zimyo integration is not configured. Set ZIMYO_API_BASE_URL and ZIMYO_API_KEY in your environment.')
  }
  const res = await fetch(`${base}/employees`, {
    headers: { Authorization: `Bearer ${key}` },
  })
  if (!res.ok) throw new Error(`Zimyo API error: ${res.status}`)
  const data = await res.json()
  return data.employees
}
