'use client'

import { createContext, useContext, useRef, useState, useCallback, type ReactNode } from 'react'

export interface ConfirmOptions {
  title: string
  description: string
  confirmLabel?: string
  variant?: 'default' | 'destructive'
}

export interface ConfirmState extends Required<ConfirmOptions> {
  resolve: (value: boolean) => void
}

export function buildConfirmState(opts: ConfirmOptions): Omit<ConfirmState, 'resolve'> {
  return {
    title: opts.title,
    description: opts.description,
    confirmLabel: opts.confirmLabel ?? 'Confirm',
    variant: opts.variant ?? 'default',
  }
}

interface ConfirmContextValue {
  confirm: (opts: ConfirmOptions) => Promise<boolean>
  state: ConfirmState | null
  settle: (value: boolean) => void
}

const ConfirmContext = createContext<ConfirmContextValue | null>(null)

export function ConfirmProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<ConfirmState | null>(null)
  const resolveRef = useRef<((v: boolean) => void) | null>(null)

  const confirm = useCallback((opts: ConfirmOptions): Promise<boolean> => {
    return new Promise(resolve => {
      resolveRef.current = resolve
      setState({ ...buildConfirmState(opts), resolve })
    })
  }, [])

  const settle = useCallback((value: boolean) => {
    resolveRef.current?.(value)
    setState(null)
  }, [])

  return (
    <ConfirmContext.Provider value={{ confirm, state, settle }}>
      {children}
    </ConfirmContext.Provider>
  )
}

export function useConfirm() {
  const ctx = useContext(ConfirmContext)
  if (!ctx) throw new Error('useConfirm must be used within ConfirmProvider')
  return ctx.confirm
}

export function useConfirmState() {
  const ctx = useContext(ConfirmContext)
  if (!ctx) throw new Error('useConfirmState must be used within ConfirmProvider')
  return { state: ctx.state, settle: ctx.settle }
}
