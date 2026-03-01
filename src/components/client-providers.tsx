'use client'

import { ToastProvider } from '@/lib/toast'
import { ConfirmProvider } from '@/lib/confirm'
import { TourProvider } from '@/lib/tour'
import { Toaster } from '@/components/toaster'
import { ConfirmDialog } from '@/components/confirm-dialog'
import { TourEngine } from '@/components/tour-engine'
import { HelpButton } from '@/components/help-button'
import type { ReactNode } from 'react'

export function ClientProviders({ children }: { children: ReactNode }) {
  return (
    <ToastProvider>
      <ConfirmProvider>
        <TourProvider>
          {children}
          <Toaster />
          <ConfirmDialog />
          <TourEngine />
          <HelpButton />
        </TourProvider>
      </ConfirmProvider>
    </ToastProvider>
  )
}
