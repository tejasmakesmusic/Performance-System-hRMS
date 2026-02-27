import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import type { User, UserRole } from './types'

export async function getCurrentUser(): Promise<User> {
  const supabase = await createClient()
  const { data: { user: authUser } } = await supabase.auth.getUser()
  if (!authUser) redirect('/login')

  const { data: dbUser, error } = await supabase
    .from('users')
    .select('*')
    .eq('email', authUser.email)
    .single()

  if (error || !dbUser) redirect('/login')
  return dbUser as User
}

export async function requireRole(allowedRoles: UserRole[]): Promise<User> {
  const user = await getCurrentUser()
  if (!allowedRoles.includes(user.role)) {
    redirect('/unauthorized')
  }
  return user
}

/** Pure testable check — returns true if user is the manager of the given employee. */
export function checkManagerOwnership(user: User, managerId: string): boolean {
  return user.id === managerId
}

/**
 * DB-backed ownership check. Fetches the employee and verifies the current manager
 * owns that record. Redirects to /unauthorized on failure.
 */
export async function requireManagerOwnership(employeeId: string, managerId: string): Promise<void> {
  const supabase = await createClient()
  const { data: employee } = await supabase
    .from('users')
    .select('manager_id')
    .eq('id', employeeId)
    .single()

  if (!employee || employee.manager_id !== managerId) {
    redirect('/unauthorized')
  }
}

export function getRoleDashboardPath(role: UserRole): string {
  switch (role) {
    case 'employee': return '/employee'
    case 'manager': return '/manager'
    case 'hrbp': return '/hrbp'
    case 'admin': return '/admin'
  }
}
