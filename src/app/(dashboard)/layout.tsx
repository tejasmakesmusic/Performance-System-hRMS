import { getCurrentUser } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { Sidebar } from '@/components/sidebar'
import { CommandPaletteProvider } from '@/components/command-palette'
import { NotificationBell } from '@/components/notification-bell'
import { ClientProviders } from '@/components/client-providers'

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const user = await getCurrentUser()

  const notifications = await prisma.notification.findMany({
    where: { recipient_id: user.id, dismissed_at: null },
    orderBy: { created_at: 'desc' },
    take: 50,
    select: {
      id: true,
      type: true,
      payload: true,
      snoozed_until: true,
      dismissed_at: true,
      created_at: true,
    },
  })

  return (
    <ClientProviders>
      <CommandPaletteProvider role={user.role}>
        <div className="flex h-screen">
          <Sidebar
            role={user.role}
            userName={user.full_name}
            isAlsoEmployee={user.is_also_employee ?? false}
          />
          <div className="flex flex-1 flex-col overflow-hidden">
            <header className="flex items-center justify-end border-b px-6 py-2">
              <NotificationBell notifications={notifications as Parameters<typeof NotificationBell>[0]['notifications']} />
            </header>
            <main className="flex-1 overflow-y-auto p-6">
              {children}
            </main>
          </div>
        </div>
      </CommandPaletteProvider>
    </ClientProviders>
  )
}
