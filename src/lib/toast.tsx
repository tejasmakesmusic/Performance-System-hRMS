'use client'

import { createContext, useContext, useReducer, useCallback, type ReactNode } from 'react'

export type ToastVariant = 'success' | 'error' | 'info' | 'warning'

export interface Toast {
  id: string
  variant: ToastVariant
  message: string
}

export interface ToastState { toasts: Toast[] }

export type ToastAction =
  | { type: 'ADD'; toast: Toast }
  | { type: 'DISMISS'; id: string }

export function toastReducer(state: ToastState, action: ToastAction): ToastState {
  switch (action.type) {
    case 'ADD': {
      const toasts = [...state.toasts, action.toast]
      return { toasts: toasts.length > 3 ? toasts.slice(toasts.length - 3) : toasts }
    }
    case 'DISMISS':
      return { toasts: state.toasts.filter(t => t.id !== action.id) }
  }
}

interface ToastContextValue {
  toast: {
    success: (message: string) => void
    error:   (message: string) => void
    info:    (message: string) => void
    warning: (message: string) => void
  }
  toasts: Toast[]
  dismiss: (id: string) => void
}

const ToastContext = createContext<ToastContextValue | null>(null)

export function ToastProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(toastReducer, { toasts: [] })

  const add = useCallback((variant: ToastVariant, message: string) => {
    const id = crypto.randomUUID()
    dispatch({ type: 'ADD', toast: { id, variant, message } })
    setTimeout(() => dispatch({ type: 'DISMISS', id }), 4000)
  }, [])

  const toast = {
    success: (m: string) => add('success', m),
    error:   (m: string) => add('error', m),
    info:    (m: string) => add('info', m),
    warning: (m: string) => add('warning', m),
  }

  return (
    <ToastContext.Provider value={{ toast, toasts: state.toasts, dismiss: (id) => dispatch({ type: 'DISMISS', id }) }}>
      {children}
    </ToastContext.Provider>
  )
}

export function useToast() {
  const ctx = useContext(ToastContext)
  if (!ctx) throw new Error('useToast must be used within ToastProvider')
  return ctx
}
