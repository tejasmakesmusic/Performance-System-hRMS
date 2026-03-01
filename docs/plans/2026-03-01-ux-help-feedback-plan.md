# UX Help & Feedback System Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add three interconnected systems — action feedback (toasts + confirm dialogs + descriptive loading), in-app help panel with search, and spotlight walkthroughs — to all four roles without any new dependencies.

**Architecture:** Three React context systems (`ToastContext`, `ConfirmContext`, `TourContext`) mounted globally in a client-side providers wrapper inside the existing server-component dashboard layout. Help content and tour steps are static typed config objects. Components use existing shadcn Sheet/Dialog primitives.

**Tech Stack:** Next.js 16 App Router, React context + hooks, shadcn Dialog/Sheet, Tailwind v4, Vitest, localStorage for tour state.

---

## Task 1: Toast system

**Files:**
- Create: `src/lib/toast.tsx`
- Create: `src/components/toaster.tsx`
- Create: `src/lib/__tests__/toast.test.ts`

**Step 1: Write the failing test**

```ts
// src/lib/__tests__/toast.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest'

// We'll test the reducer logic directly, extracted from the context
// Import after implementation
import { toastReducer, type ToastState, type ToastAction } from '../toast'

describe('toastReducer', () => {
  const initialState: ToastState = { toasts: [] }

  it('adds a toast', () => {
    const action: ToastAction = { type: 'ADD', toast: { id: '1', variant: 'success', message: 'Done' } }
    const state = toastReducer(initialState, action)
    expect(state.toasts).toHaveLength(1)
    expect(state.toasts[0].message).toBe('Done')
  })

  it('dismisses a toast by id', () => {
    const withToast: ToastState = { toasts: [{ id: '1', variant: 'success', message: 'Done' }] }
    const state = toastReducer(withToast, { type: 'DISMISS', id: '1' })
    expect(state.toasts).toHaveLength(0)
  })

  it('caps at 3 toasts, removing oldest', () => {
    const full: ToastState = {
      toasts: [
        { id: '1', variant: 'success', message: 'A' },
        { id: '2', variant: 'info', message: 'B' },
        { id: '3', variant: 'warning', message: 'C' },
      ]
    }
    const state = toastReducer(full, { type: 'ADD', toast: { id: '4', variant: 'error', message: 'D' } })
    expect(state.toasts).toHaveLength(3)
    expect(state.toasts[0].id).toBe('2') // oldest removed
    expect(state.toasts[2].id).toBe('4') // newest added
  })
})
```

**Step 2: Run to confirm it fails**

```bash
npx vitest run src/lib/__tests__/toast.test.ts
```
Expected: FAIL — `Cannot find module '../toast'`

**Step 3: Implement `src/lib/toast.tsx`**

```tsx
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
```

**Step 4: Implement `src/components/toaster.tsx`**

```tsx
'use client'

import { useToast } from '@/lib/toast'
import { cn } from '@/lib/utils'

const ICONS: Record<string, string> = {
  success: '✓',
  error:   '✕',
  info:    'ℹ',
  warning: '⚠',
}

const COLOURS: Record<string, string> = {
  success: 'border-green-500 bg-green-50 text-green-900',
  error:   'border-red-500 bg-red-50 text-red-900',
  info:    'border-blue-500 bg-blue-50 text-blue-900',
  warning: 'border-yellow-500 bg-yellow-50 text-yellow-900',
}

export function Toaster() {
  const { toasts, dismiss } = useToast()
  if (toasts.length === 0) return null
  return (
    <div className="fixed bottom-6 right-6 z-[100] flex flex-col gap-2 w-80">
      {toasts.map(t => (
        <div
          key={t.id}
          className={cn(
            'flex items-start gap-3 rounded-lg border px-4 py-3 shadow-md text-sm',
            'animate-in slide-in-from-bottom-2 duration-200',
            COLOURS[t.variant]
          )}
        >
          <span className="font-bold text-base leading-none mt-0.5">{ICONS[t.variant]}</span>
          <span className="flex-1">{t.message}</span>
          <button onClick={() => dismiss(t.id)} className="opacity-50 hover:opacity-100 text-xs ml-1">✕</button>
        </div>
      ))}
    </div>
  )
}
```

**Step 5: Run tests to confirm they pass**

```bash
npx vitest run src/lib/__tests__/toast.test.ts
```
Expected: 3 PASS

**Step 6: Commit**

```bash
git add src/lib/toast.tsx src/components/toaster.tsx src/lib/__tests__/toast.test.ts
git commit -m "feat: toast context + toaster component"
```

---

## Task 2: Confirm dialog system

**Files:**
- Create: `src/lib/confirm.tsx`
- Create: `src/components/confirm-dialog.tsx`
- Create: `src/lib/__tests__/confirm.test.ts`

**Step 1: Write the failing test**

```ts
// src/lib/__tests__/confirm.test.ts
import { describe, it, expect } from 'vitest'
import { buildConfirmState, type ConfirmOptions } from '../confirm'

describe('buildConfirmState', () => {
  it('sets all fields from options', () => {
    const opts: ConfirmOptions = {
      title: 'Delete?',
      description: 'This cannot be undone.',
      confirmLabel: 'Delete',
      variant: 'destructive',
    }
    const state = buildConfirmState(opts)
    expect(state.title).toBe('Delete?')
    expect(state.variant).toBe('destructive')
    expect(state.confirmLabel).toBe('Delete')
  })

  it('defaults confirmLabel to "Confirm" and variant to "default"', () => {
    const state = buildConfirmState({ title: 'Do it?', description: 'OK?' })
    expect(state.confirmLabel).toBe('Confirm')
    expect(state.variant).toBe('default')
  })
})
```

**Step 2: Run to confirm it fails**

```bash
npx vitest run src/lib/__tests__/confirm.test.ts
```
Expected: FAIL — `Cannot find module '../confirm'`

**Step 3: Implement `src/lib/confirm.tsx`**

```tsx
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
```

**Step 4: Implement `src/components/confirm-dialog.tsx`**

```tsx
'use client'

import { useConfirmState } from '@/lib/confirm'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
  DialogDescription, DialogFooter
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'

export function ConfirmDialog() {
  const { state, settle } = useConfirmState()
  return (
    <Dialog open={!!state} onOpenChange={open => { if (!open) settle(false) }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{state?.title}</DialogTitle>
          <DialogDescription>{state?.description}</DialogDescription>
        </DialogHeader>
        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={() => settle(false)}>Cancel</Button>
          <Button
            variant={state?.variant === 'destructive' ? 'destructive' : 'default'}
            onClick={() => settle(true)}
          >
            {state?.confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
```

**Step 5: Run tests**

```bash
npx vitest run src/lib/__tests__/confirm.test.ts
```
Expected: 2 PASS

**Step 6: Commit**

```bash
git add src/lib/confirm.tsx src/components/confirm-dialog.tsx src/lib/__tests__/confirm.test.ts
git commit -m "feat: confirm dialog context + component"
```

---

## Task 3: Help content data

**Files:**
- Create: `src/lib/help-content.ts`

**Step 1: Create the file** (no test needed — pure static data)

```ts
// src/lib/help-content.ts

export interface HelpArticle {
  id: string
  title: string
  body: string
  route: string  // for search result context label
}

export interface PageHelp {
  summary: string[]   // 3-5 bullet points shown at top of panel
  articles: HelpArticle[]
}

export const HELP_CONTENT: Record<string, PageHelp> = {
  '/employee': {
    summary: [
      'This is your self-review page — complete it before the deadline shown above.',
      'Your KPIs are the goals you agreed on at the start of the cycle.',
      'Rate yourself honestly — your manager will see your rating alongside their own.',
      'Once submitted, your review is locked. Double-check before clicking Submit.',
      'After your manager reviews you, results appear in My History once published.',
    ],
    articles: [
      { id: 'emp-ratings', title: 'What do the rating labels mean?', body: 'FEE = Far Exceeds Expectations, EE = Exceeds Expectations, ME = Meets Expectations, SME = Sometimes Meets Expectations, BE = Below Expectations.', route: '/employee' },
      { id: 'emp-deadline', title: 'What happens if I miss the deadline?', body: 'Your manager may still be able to review you, but your self-review will be marked as missing. Contact your manager or HRBP if you have missed the deadline.', route: '/employee' },
    ],
  },
  '/employee/history': {
    summary: [
      'This page shows all your past published review cycles.',
      'Click any cycle to see your full appraisal including KPI scores and payout.',
      'Ratings are final once published — contact your HRBP if you have concerns.',
    ],
    articles: [],
  },
  '/manager': {
    summary: [
      'This is your team overview — each card shows an employee\'s current review status.',
      'Red badges mean a review is overdue — act on those first.',
      'Click "KPIs" to add or edit an employee\'s goals before the KPI Setting deadline.',
      'Click "Review" to submit your rating after the employee has completed their self-review.',
      'Your own review is under My Review in the sidebar.',
    ],
    articles: [
      { id: 'mgr-kpi-weights', title: 'How do KPI weights work?', body: 'Each KPI has a weight (percentage). All weights must sum to 100. A KPI with weight 40 contributes 40% of the total score.', route: '/manager' },
      { id: 'mgr-rating-scale', title: 'What rating should I give?', body: 'Compare against the role\'s expected output: FEE for exceptional, ME for solid delivery, BE for below standard. Calibration may adjust final ratings.', route: '/manager' },
    ],
  },
  '/manager/my-review': {
    summary: [
      'This shows your own self-review and final appraisal once published.',
      'Your manager will submit a rating for you separately.',
      'You cannot edit this page — it is read-only.',
    ],
    articles: [],
  },
  '/admin': {
    summary: [
      'The dashboard shows the health of your active review cycle at a glance.',
      'Cycle Health shows how many employees have completed each stage.',
      'People shows team size, role breakdown, and last sync date.',
      'Click into Cycles to advance the current cycle or view per-employee status.',
    ],
    articles: [],
  },
  '/admin/cycles': {
    summary: [
      'Cycles move through 7 stages: Draft → KPI Setting → Self Review → Manager Review → Calibrating → Locked → Published.',
      'You advance stages manually using the Advance button on each cycle.',
      'Advancing notifies the right people automatically.',
      'Click a cycle name to see per-employee status and send targeted reminders.',
    ],
    articles: [
      { id: 'adm-advance', title: 'When should I advance the cycle?', body: 'Advance when the majority of users have completed the current stage, or when the deadline has passed. Check the per-employee table before advancing.', route: '/admin/cycles' },
    ],
  },
  '/admin/users': {
    summary: [
      'Search and filter users by name, role, department, or status.',
      'Click a role badge to change it inline.',
      'Click the active/inactive status to toggle a user.',
      'Use Upload CSV to bulk-import users from a spreadsheet.',
      'Sync from Zimyo pulls the latest employee list from your HRMS.',
    ],
    articles: [],
  },
  '/admin/kpi-templates': {
    summary: [
      'Templates are reusable KPI definitions managers can add to employees.',
      'Set a template as Inactive to hide it from managers without deleting it.',
      'Category and role_slug help managers find relevant templates quickly.',
      'Weight on templates is a suggestion — managers can adjust per employee.',
    ],
    articles: [],
  },
  '/admin/notifications': {
    summary: [
      'Send a message to an individual, a role, a department, or everyone.',
      'Messages appear in the notification bell for recipients.',
      'You can optionally include a link to direct users to a specific page.',
      'Sent history shows the last 20 manual notifications.',
    ],
    articles: [],
  },
  '/admin/feature-flags': {
    summary: [
      'Feature flags toggle functionality on or off globally for all users.',
      'Changes take effect immediately — no redeploy needed.',
      'Use with care: disabling a module hides it from all users.',
    ],
    articles: [],
  },
  '/hrbp': {
    summary: [
      'This shows all active and published cycles.',
      'Click Calibrate on a cycle in the Calibrating stage to review and adjust ratings.',
      'You can only calibrate cycles that have reached the Calibrating stage.',
    ],
    articles: [],
  },
  '/hrbp/calibration': {
    summary: [
      'The bell curve shows the distribution of manager ratings across the team.',
      'Override a final rating by entering a new value in the Override column.',
      'Lock the cycle when calibration is complete — this freezes all ratings.',
      'Publish releases results to employees. This cannot be undone.',
    ],
    articles: [
      { id: 'hrbp-lock', title: 'What is the difference between Lock and Publish?', body: 'Locking freezes ratings so no more overrides are possible. Publishing makes results visible to employees. You must lock before you can publish.', route: '/hrbp/calibration' },
      { id: 'hrbp-override', title: 'When should I override a rating?', body: 'Override when calibration reveals outliers, bias, or inconsistency across managers. Document your reasoning in the manager review comments if possible.', route: '/hrbp/calibration' },
    ],
  },
  '/hrbp/audit-log': {
    summary: [
      'The audit log records every significant action taken in the system.',
      'Use it to investigate disputes or verify when actions were taken.',
    ],
    articles: [],
  },
}

/** Flat list of all articles for search */
export const ALL_ARTICLES: HelpArticle[] = Object.values(HELP_CONTENT).flatMap(p => p.articles)

/** Get help for the current pathname, falling back to closest parent */
export function getPageHelp(pathname: string): PageHelp | null {
  if (HELP_CONTENT[pathname]) return HELP_CONTENT[pathname]
  // strip dynamic segments: /admin/cycles/abc123 → /admin/cycles
  const parent = pathname.replace(/\/[^/]+$/, '')
  if (parent && parent !== pathname) return getPageHelp(parent)
  return null
}
```

**Step 2: Commit**

```bash
git add src/lib/help-content.ts
git commit -m "feat: help content data for all routes"
```

---

## Task 4: Tour content + Tour context

**Files:**
- Create: `src/lib/tour-content.ts`
- Create: `src/lib/tour.tsx`
- Create: `src/lib/__tests__/tour.test.ts`

**Step 1: Create `src/lib/tour-content.ts`**

```ts
export interface TourStep {
  id: string        // matches data-tour="id" on DOM element
  title: string
  body: string
}

export interface Tour {
  id: string
  routePattern: RegExp
  steps: TourStep[]
}

export const TOURS: Tour[] = [
  {
    id: 'employee-review',
    routePattern: /^\/employee$/,
    steps: [
      { id: 'action-inbox',    title: 'Your action items',     body: 'This card tells you exactly what to do right now. It updates as the cycle progresses.' },
      { id: 'kpi-list',        title: 'Your KPIs',             body: 'These are the goals you\'ll be rated against. They were set by your manager at the start of the cycle.' },
      { id: 'self-review-form',title: 'Rate yourself',         body: 'Rate yourself honestly — your manager will see your rating alongside their own assessment.' },
      { id: 'submit-review',   title: 'Submit when ready',     body: 'Once submitted, your self-review is locked. Make sure you\'re happy with your answers first.' },
    ],
  },
  {
    id: 'manager-team',
    routePattern: /^\/manager$/,
    steps: [
      { id: 'team-table',     title: 'Your team at a glance', body: 'Each row shows an employee\'s review status. Red means overdue — act on those first.' },
      { id: 'kpi-button',     title: 'Set KPIs first',        body: 'During KPI Setting stage, click here to add or edit goals for each employee.' },
      { id: 'review-button',  title: 'Submit your rating',    body: 'Once an employee has submitted their self-review, click here to add your own rating and comments.' },
    ],
  },
  {
    id: 'manager-kpis',
    routePattern: /^\/manager\/[^/]+\/kpis/,
    steps: [
      { id: 'template-picker', title: 'Start from a template', body: 'Templates are pre-approved KPIs for this role. Pick one to save time.' },
      { id: 'weight-field',    title: 'Set the weight',        body: 'Weights must sum to 100 across all KPIs. A weight of 40 means this KPI contributes 40% of the final score.' },
      { id: 'add-kpi-btn',     title: 'Add the KPI',           body: 'Click to save this KPI. Add as many as needed, then check the weights sum to 100.' },
    ],
  },
  {
    id: 'admin-cycles',
    routePattern: /^\/admin\/cycles$/,
    steps: [
      { id: 'create-cycle',   title: 'Create a cycle',       body: 'A cycle covers one review period (usually a quarter). Set the deadlines for each stage here.' },
      { id: 'cycle-status',   title: 'Cycle stages',         body: 'Cycles move through 7 stages. Each stage unlocks different actions for employees, managers, and HRBP.' },
      { id: 'advance-btn',    title: 'Advance when ready',   body: 'Click Advance to move to the next stage. This notifies the right people automatically.' },
    ],
  },
  {
    id: 'hrbp-calibrate',
    routePattern: /^\/hrbp\/calibration/,
    steps: [
      { id: 'bell-curve',     title: 'Rating distribution',  body: 'This shows how manager ratings are spread. Look for unexpected clustering or outliers.' },
      { id: 'override-form',  title: 'Override a rating',    body: 'Enter a final rating here if calibration suggests an adjustment. The employee won\'t see this until you publish.' },
      { id: 'lock-btn',       title: 'Lock when done',       body: 'Locking freezes all ratings — no more overrides after this point.' },
      { id: 'publish-btn',    title: 'Publish to employees', body: 'Publishing makes results visible to all employees. This cannot be undone.' },
    ],
  },
]

export function getTourForPath(pathname: string): Tour | null {
  return TOURS.find(t => t.routePattern.test(pathname)) ?? null
}
```

**Step 2: Write the failing test**

```ts
// src/lib/__tests__/tour.test.ts
import { describe, it, expect, beforeEach } from 'vitest'
import { getTourForPath } from '../tour-content'
import { tourReducer, type TourState, type TourAction } from '../tour'

describe('getTourForPath', () => {
  it('matches employee route', () => {
    expect(getTourForPath('/employee')?.id).toBe('employee-review')
  })
  it('matches manager kpis route with dynamic segment', () => {
    expect(getTourForPath('/manager/abc123/kpis')?.id).toBe('manager-kpis')
  })
  it('returns null for unknown route', () => {
    expect(getTourForPath('/admin/audit-log')).toBeNull()
  })
})

describe('tourReducer', () => {
  const idle: TourState = { status: 'idle', tourId: null, stepIndex: 0 }

  it('starts a tour', () => {
    const state = tourReducer(idle, { type: 'START', tourId: 'employee-review' })
    expect(state.status).toBe('active')
    expect(state.tourId).toBe('employee-review')
    expect(state.stepIndex).toBe(0)
  })

  it('advances to next step', () => {
    const active: TourState = { status: 'active', tourId: 'employee-review', stepIndex: 0 }
    const state = tourReducer(active, { type: 'NEXT' })
    expect(state.stepIndex).toBe(1)
  })

  it('finishes the tour', () => {
    const state = tourReducer({ status: 'active', tourId: 'employee-review', stepIndex: 3 }, { type: 'FINISH' })
    expect(state.status).toBe('idle')
  })
})
```

**Step 3: Run to confirm it fails**

```bash
npx vitest run src/lib/__tests__/tour.test.ts
```
Expected: FAIL

**Step 4: Implement `src/lib/tour.tsx`**

```tsx
'use client'

import { createContext, useContext, useReducer, useCallback, type ReactNode } from 'react'

export interface TourState {
  status: 'idle' | 'active'
  tourId: string | null
  stepIndex: number
}

export type TourAction =
  | { type: 'START'; tourId: string }
  | { type: 'NEXT' }
  | { type: 'FINISH' }

export function tourReducer(state: TourState, action: TourAction): TourState {
  switch (action.type) {
    case 'START':  return { status: 'active', tourId: action.tourId, stepIndex: 0 }
    case 'NEXT':   return { ...state, stepIndex: state.stepIndex + 1 }
    case 'FINISH': return { status: 'idle', tourId: null, stepIndex: 0 }
  }
}

const STORAGE_KEY = (tourId: string) => `pms:tour:${tourId}:done`

interface TourContextValue {
  tourState: TourState
  startTour: (tourId: string) => void
  nextStep: () => void
  finishTour: () => void
  replayTour: (tourId: string) => void
  isDone: (tourId: string) => boolean
}

const TourContext = createContext<TourContextValue | null>(null)

export function TourProvider({ children }: { children: ReactNode }) {
  const [tourState, dispatch] = useReducer(tourReducer, { status: 'idle', tourId: null, stepIndex: 0 })

  const isDone = useCallback((tourId: string) => {
    if (typeof window === 'undefined') return false
    return localStorage.getItem(STORAGE_KEY(tourId)) === '1'
  }, [])

  const startTour = useCallback((tourId: string) => {
    dispatch({ type: 'START', tourId })
  }, [])

  const nextStep = useCallback(() => dispatch({ type: 'NEXT' }), [])

  const finishTour = useCallback(() => {
    if (tourState.tourId) localStorage.setItem(STORAGE_KEY(tourState.tourId), '1')
    dispatch({ type: 'FINISH' })
  }, [tourState.tourId])

  const replayTour = useCallback((tourId: string) => {
    localStorage.removeItem(STORAGE_KEY(tourId))
    dispatch({ type: 'START', tourId })
  }, [])

  return (
    <TourContext.Provider value={{ tourState, startTour, nextStep, finishTour, replayTour, isDone }}>
      {children}
    </TourContext.Provider>
  )
}

export function useTour() {
  const ctx = useContext(TourContext)
  if (!ctx) throw new Error('useTour must be used within TourProvider')
  return ctx
}
```

**Step 5: Run tests**

```bash
npx vitest run src/lib/__tests__/tour.test.ts
```
Expected: 6 PASS

**Step 6: Commit**

```bash
git add src/lib/tour-content.ts src/lib/tour.tsx src/lib/__tests__/tour.test.ts
git commit -m "feat: tour content + tour context with localStorage persistence"
```

---

## Task 5: Tour Engine component

**Files:**
- Create: `src/components/tour-engine.tsx`

**Step 1: Implement**

The engine uses `getBoundingClientRect()` on the element with `data-tour={step.id}` to position the spotlight cutout and popover.

```tsx
'use client'

import { useEffect, useState, useRef } from 'react'
import { usePathname } from 'next/navigation'
import { useTour } from '@/lib/tour'
import { getTourForPath } from '@/lib/tour-content'
import { Button } from '@/components/ui/button'

interface Rect { top: number; left: number; width: number; height: number }

const PAD = 8 // spotlight padding

export function TourEngine() {
  const pathname = usePathname()
  const { tourState, startTour, nextStep, finishTour, isDone } = useTour()
  const [rect, setRect] = useState<Rect | null>(null)
  const autoStarted = useRef<Set<string>>(new Set())

  const tour = getTourForPath(pathname)
  const step = tourState.status === 'active' && tour
    ? tour.steps[tourState.stepIndex] ?? null
    : null
  const isLast = tour ? tourState.stepIndex === tour.steps.length - 1 : false

  // auto-start on first visit
  useEffect(() => {
    if (!tour || isDone(tour.id) || autoStarted.current.has(tour.id)) return
    autoStarted.current.add(tour.id)
    const timer = setTimeout(() => startTour(tour.id), 800)
    return () => clearTimeout(timer)
  }, [pathname, tour, isDone, startTour])

  // track target element rect
  useEffect(() => {
    if (!step) { setRect(null); return }
    const el = document.querySelector(`[data-tour="${step.id}"]`)
    if (!el) { setRect(null); return }
    el.scrollIntoView({ behavior: 'smooth', block: 'center' })
    const r = el.getBoundingClientRect()
    setRect({ top: r.top, left: r.left, width: r.width, height: r.height })
  }, [step])

  if (!step || !rect) return null

  const spotTop  = rect.top  - PAD
  const spotLeft = rect.left - PAD
  const spotW    = rect.width  + PAD * 2
  const spotH    = rect.height + PAD * 2

  // position popover below or above target
  const popoverTop = spotTop + spotH + 12 < window.innerHeight - 180
    ? spotTop + spotH + 12
    : spotTop - 180

  return (
    <>
      {/* Overlay with cutout via box-shadow */}
      <div
        className="fixed inset-0 z-[200] pointer-events-none"
        style={{
          boxShadow: `0 0 0 9999px rgba(0,0,0,0.55)`,
          top: spotTop, left: spotLeft,
          width: spotW, height: spotH,
          borderRadius: 8,
        }}
      />
      {/* Click-blocker overlay (full screen, lets cutout area through) */}
      <div
        className="fixed inset-0 z-[199]"
        onClick={() => finishTour()}
        aria-label="Close tour"
      />
      {/* Popover card */}
      <div
        className="fixed z-[201] w-80 rounded-xl border bg-white shadow-xl p-5"
        style={{ top: popoverTop, left: Math.min(spotLeft, window.innerWidth - 340) }}
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-1">
          <span className="text-xs text-muted-foreground font-medium">
            Step {tourState.stepIndex + 1} of {tour!.steps.length}
          </span>
          <button onClick={finishTour} className="text-xs text-muted-foreground hover:text-foreground">Skip tour</button>
        </div>
        <h3 className="font-semibold text-sm mb-1">{step.title}</h3>
        <p className="text-sm text-muted-foreground mb-4">{step.body}</p>
        <div className="flex justify-end gap-2">
          <Button size="sm" onClick={isLast ? finishTour : nextStep}>
            {isLast ? 'Finish' : 'Next →'}
          </Button>
        </div>
      </div>
    </>
  )
}
```

**Step 2: Commit**

```bash
git add src/components/tour-engine.tsx
git commit -m "feat: tour engine spotlight overlay component"
```

---

## Task 6: Help Panel + Help Button

**Files:**
- Create: `src/components/help-panel.tsx`
- Create: `src/components/help-button.tsx`

**Step 1: Implement `src/components/help-panel.tsx`**

```tsx
'use client'

import { useState, useMemo } from 'react'
import { usePathname } from 'next/navigation'
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { getPageHelp, ALL_ARTICLES, type HelpArticle } from '@/lib/help-content'
import { getTourForPath } from '@/lib/tour-content'
import { useTour } from '@/lib/tour'
import { Button } from '@/components/ui/button'

interface HelpPanelProps {
  open: boolean
  onClose: () => void
}

export function HelpPanel({ open, onClose }: HelpPanelProps) {
  const pathname = usePathname()
  const [search, setSearch] = useState('')
  const { replayTour } = useTour()

  const pageHelp = getPageHelp(pathname)
  const tour = getTourForPath(pathname)

  const searchResults = useMemo<HelpArticle[]>(() => {
    if (!search.trim()) return []
    const q = search.toLowerCase()
    return ALL_ARTICLES.filter(a =>
      a.title.toLowerCase().includes(q) || a.body.toLowerCase().includes(q)
    ).slice(0, 8)
  }, [search])

  function handleTour() {
    onClose()
    if (tour) replayTour(tour.id)
  }

  return (
    <Sheet open={open} onOpenChange={open => { if (!open) onClose() }}>
      <SheetContent side="right" className="w-[400px] flex flex-col gap-0 p-0">
        <SheetHeader className="px-6 pt-6 pb-4 border-b">
          <SheetTitle className="flex items-center justify-between">
            Help
            {tour && (
              <Button size="sm" variant="outline" onClick={handleTour} className="text-xs">
                ▶ Take a tour
              </Button>
            )}
          </SheetTitle>
        </SheetHeader>

        <div className="flex-1 overflow-y-auto">
          {/* Search */}
          <div className="px-6 py-4 border-b">
            <input
              type="search"
              placeholder="Search help articles…"
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="w-full rounded-md border px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
            />
          </div>

          {search.trim() ? (
            /* Search results */
            <div className="px-6 py-4 space-y-4">
              {searchResults.length === 0 && (
                <p className="text-sm text-muted-foreground">No articles found for "{search}".</p>
              )}
              {searchResults.map(a => (
                <div key={a.id}>
                  <h4 className="text-sm font-medium mb-1">{a.title}</h4>
                  <p className="text-sm text-muted-foreground">{a.body}</p>
                  <span className="text-xs text-muted-foreground/60 mt-1 block">{a.route}</span>
                </div>
              ))}
            </div>
          ) : (
            /* Page context */
            <div className="px-6 py-4">
              {pageHelp ? (
                <>
                  <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-3">
                    On this page
                  </h3>
                  <ul className="space-y-2">
                    {pageHelp.summary.map((bullet, i) => (
                      <li key={i} className="flex gap-2 text-sm text-muted-foreground">
                        <span className="mt-1 text-xs">•</span>
                        <span>{bullet}</span>
                      </li>
                    ))}
                  </ul>
                  {pageHelp.articles.length > 0 && (
                    <>
                      <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mt-6 mb-3">
                        Related articles
                      </h3>
                      <div className="space-y-4">
                        {pageHelp.articles.map(a => (
                          <div key={a.id}>
                            <h4 className="text-sm font-medium mb-1">{a.title}</h4>
                            <p className="text-sm text-muted-foreground">{a.body}</p>
                          </div>
                        ))}
                      </div>
                    </>
                  )}
                </>
              ) : (
                <p className="text-sm text-muted-foreground">No help content for this page yet.</p>
              )}
            </div>
          )}
        </div>
      </SheetContent>
    </Sheet>
  )
}
```

**Step 2: Implement `src/components/help-button.tsx`**

```tsx
'use client'

import { useState } from 'react'
import { HelpPanel } from './help-panel'

export function HelpButton() {
  const [open, setOpen] = useState(false)
  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="fixed bottom-6 right-6 z-50 w-10 h-10 rounded-full bg-foreground text-background shadow-lg flex items-center justify-center text-sm font-semibold hover:opacity-90 transition-opacity"
        aria-label="Open help"
      >
        ?
      </button>
      <HelpPanel open={open} onClose={() => setOpen(false)} />
    </>
  )
}
```

**Step 3: Commit**

```bash
git add src/components/help-panel.tsx src/components/help-button.tsx
git commit -m "feat: help panel with search + floating help button"
```

---

## Task 7: Wire providers into layout

**Files:**
- Create: `src/components/client-providers.tsx`
- Modify: `src/app/(dashboard)/layout.tsx`

**Step 1: Create `src/components/client-providers.tsx`**

The dashboard layout is a server component. Providers must be in a client boundary wrapper:

```tsx
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
```

**Step 2: Modify `src/app/(dashboard)/layout.tsx`**

Wrap the existing `CommandPaletteProvider` with `ClientProviders`:

```tsx
import { getCurrentUser } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import { Sidebar } from '@/components/sidebar'
import { CommandPaletteProvider } from '@/components/command-palette'
import { NotificationBell } from '@/components/notification-bell'
import { ClientProviders } from '@/components/client-providers'

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const user = await getCurrentUser()
  const supabase = await createClient()

  const { data: notifications } = await supabase
    .from('notifications')
    .select('id, type, message, link, is_read, created_at, snoozed_until, dismissed_at')
    .eq('user_id', user.id)
    .is('dismissed_at', null)
    .order('created_at', { ascending: false })
    .limit(50)

  return (
    <ClientProviders>
      <CommandPaletteProvider role={user.role}>
        <div className="flex h-screen">
          <Sidebar role={user.role} userName={user.full_name} />
          <div className="flex flex-1 flex-col overflow-hidden">
            <header className="flex items-center justify-end border-b px-6 py-2">
              <NotificationBell notifications={notifications ?? []} />
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
```

**Step 3: Verify app compiles**

```bash
npx tsc --noEmit
```
Expected: 0 errors

**Step 4: Commit**

```bash
git add src/components/client-providers.tsx src/app/(dashboard)/layout.tsx
git commit -m "feat: wire toast/confirm/tour providers into dashboard layout"
```

---

## Task 8: Update sidebar — Help link opens panel

**Files:**
- Modify: `src/components/sidebar.tsx`

The sidebar currently links Help to `/help`. Change it to a button that opens the `HelpPanel` directly. Also add Help to admin nav.

**Step 1: Modify `src/components/sidebar.tsx`**

Key changes:
1. Remove `{ label: 'Help', href: '/help' }` entries and add `{ label: 'Help', href: '#help' }` as a marker
2. Add Help to admin nav
3. Render Help as a `<button>` that opens `HelpPanel` state instead of a `<Link>`

```tsx
'use client'

import Link from 'next/link'
import { useState } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import type { UserRole } from '@/lib/types'
import { cn } from '@/lib/utils'
import { CommandPaletteTrigger } from '@/components/command-palette-trigger'
import { DensityToggle } from '@/components/density-toggle'
import { HelpPanel } from '@/components/help-panel'
import { createClient } from '@/lib/supabase/client'

interface NavItem { label: string; href: string }

const NAV_ITEMS: Record<UserRole, NavItem[]> = {
  employee: [
    { label: 'My Review', href: '/employee' },
    { label: 'My History', href: '/employee/history' },
    { label: 'Help', href: '#help' },
  ],
  manager: [
    { label: 'My Team', href: '/manager' },
    { label: 'My Review', href: '/manager/my-review' },
    { label: 'Help', href: '#help' },
  ],
  hrbp: [
    { label: 'Cycles', href: '/hrbp' },
    { label: 'Calibration', href: '/hrbp/calibration' },
    { label: 'Audit Log', href: '/hrbp/audit-log' },
    { label: 'Help', href: '#help' },
  ],
  admin: [
    { label: 'Dashboard',     href: '/admin' },
    { label: 'Cycles',        href: '/admin/cycles' },
    { label: 'Users',         href: '/admin/users' },
    { label: 'KPI Templates', href: '/admin/kpi-templates' },
    { label: 'Notifications', href: '/admin/notifications' },
    { label: 'Feature Flags', href: '/admin/feature-flags' },
    { label: 'Audit Log',     href: '/admin/audit-log' },
    { label: 'Help',          href: '#help' },
  ],
}

export function Sidebar({ role, userName }: { role: UserRole; userName: string }) {
  const pathname = usePathname()
  const router = useRouter()
  const [helpOpen, setHelpOpen] = useState(false)
  const items = NAV_ITEMS[role]

  async function handleSignOut() {
    const supabase = createClient()
    await supabase.auth.signOut()
    router.push('/login')
  }

  return (
    <aside className="flex w-64 flex-col border-r bg-muted/40 p-4">
      <div className="mb-6">
        <h2 className="text-lg font-semibold">PMS</h2>
        <p className="text-sm text-muted-foreground">{userName}</p>
      </div>
      <div className="mb-3">
        <CommandPaletteTrigger />
      </div>
      <nav className="flex flex-col gap-1">
        {items.map(item =>
          item.href === '#help' ? (
            <button
              key="help"
              onClick={() => setHelpOpen(true)}
              className="rounded-md px-3 py-2 text-sm text-left transition-colors hover:bg-accent"
            >
              {item.label}
            </button>
          ) : (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "rounded-md px-3 py-2 text-sm transition-colors hover:bg-accent",
                (pathname === item.href || (item.href !== '/admin' && pathname.startsWith(item.href))) && "bg-accent font-medium"
              )}
            >
              {item.label}
            </Link>
          )
        )}
      </nav>
      <div className="mt-auto pt-4 border-t space-y-1">
        <DensityToggle />
        <button
          onClick={handleSignOut}
          className="w-full rounded-md px-3 py-2 text-sm text-left text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
        >
          Sign out
        </button>
      </div>
      <HelpPanel open={helpOpen} onClose={() => setHelpOpen(false)} />
    </aside>
  )
}
```

**Step 2: Verify TypeScript**

```bash
npx tsc --noEmit
```

**Step 3: Commit**

```bash
git add src/components/sidebar.tsx
git commit -m "feat: sidebar Help link opens in-app panel for all roles"
```

---

## Task 9: Apply pendingLabel to all SubmitButtons

`SubmitButton` already supports `pendingLabel`. This task adds meaningful labels to every button across all pages.

**Files to modify** (add `pendingLabel` prop):

| File | Button | pendingLabel |
|------|--------|--------------|
| `src/app/(dashboard)/employee/self-review-form.tsx` | Submit Self-Review | `"Saving your review…"` |
| `src/app/(dashboard)/manager/[employeeId]/review/review-form.tsx` | Submit | `"Submitting your rating…"` |
| `src/app/(dashboard)/admin/cycles/new/cycle-form.tsx` | Create Cycle | `"Creating cycle…"` |
| `src/app/(dashboard)/admin/cycles/[id]/page.tsx` | Remind self-reviews | `"Notifying employees…"` |
| `src/app/(dashboard)/admin/cycles/[id]/page.tsx` | Remind manager reviews | `"Notifying managers…"` |
| `src/app/(dashboard)/admin/users/upload/page.tsx` | Import | `"Importing users…"` |
| `src/app/(dashboard)/admin/kpi-templates/template-form.tsx` | Save Template | `"Saving template…"` |
| `src/app/(dashboard)/admin/notifications/notification-form.tsx` | Send Notification | `"Sending message…"` |
| `src/app/(dashboard)/hrbp/calibration/override-form.tsx` | Save Override | `"Saving override…"` |

**Step 1: Read and edit each file** — find `<SubmitButton` and add `pendingLabel="…"` prop. Each is a small one-line change per button.

**Step 2: Verify TypeScript**

```bash
npx tsc --noEmit
```

**Step 3: Commit**

```bash
git add -A
git commit -m "feat: descriptive pendingLabel on all submit buttons"
```

---

## Task 10: Apply confirm + toast to admin cycle actions

**Files:**
- Modify: `src/app/(dashboard)/admin/cycles/[id]/page.tsx`
- Modify: `src/app/(dashboard)/admin/cycles/page.tsx` (Advance button)

These pages currently use server action forms. To use `useConfirm` and `useToast`, the buttons calling destructive actions need to become client components.

**Step 1: Create `src/app/(dashboard)/admin/cycles/[id]/cycle-actions-client.tsx`**

Extract the three action buttons (Advance, Remind Self-Review, Remind Manager Review) into a `'use client'` component that uses `useConfirm` and `useToast`:

```tsx
'use client'

import { useConfirm } from '@/lib/confirm'
import { useToast } from '@/lib/toast'
import { Button } from '@/components/ui/button'
import { advanceCycleStatus, sendSelfReviewReminders, sendManagerReviewReminders } from '../actions'
import type { CycleStatus } from '@/lib/types'
import { useState } from 'react'

interface Props {
  cycleId: string
  nextStatus: CycleStatus | null
  pendingSelfCount: number
  pendingManagerCount: number
}

export function CycleActionsClient({ cycleId, nextStatus, pendingSelfCount, pendingManagerCount }: Props) {
  const confirm = useConfirm()
  const { toast } = useToast()
  const [loading, setLoading] = useState<string | null>(null)

  async function handleAdvance() {
    const ok = await confirm({
      title: `Advance to ${nextStatus?.replace(/_/g, ' ')}?`,
      description: 'This will move the cycle to the next stage and notify the relevant users. This cannot be undone.',
      confirmLabel: 'Advance',
      variant: 'destructive',
    })
    if (!ok) return
    setLoading('advance')
    const result = await advanceCycleStatus(cycleId)
    setLoading(null)
    if (result.error) toast.error(result.error)
    else toast.success(`Cycle advanced to ${nextStatus?.replace(/_/g, ' ')}.`)
  }

  async function handleSelfReminders() {
    const ok = await confirm({
      title: `Send self-review reminders?`,
      description: `This will send a reminder notification to ${pendingSelfCount} employee${pendingSelfCount !== 1 ? 's' : ''} who haven't submitted their self-review yet.`,
      confirmLabel: 'Send reminders',
    })
    if (!ok) return
    setLoading('self')
    const result = await sendSelfReviewReminders(cycleId)
    setLoading(null)
    if (result.error) toast.error(result.error)
    else toast.success(`Reminders sent to ${pendingSelfCount} employee${pendingSelfCount !== 1 ? 's' : ''}.`)
  }

  async function handleManagerReminders() {
    const ok = await confirm({
      title: 'Send manager review reminders?',
      description: `This will send a reminder to ${pendingManagerCount} manager${pendingManagerCount !== 1 ? 's' : ''} who have outstanding reviews.`,
      confirmLabel: 'Send reminders',
    })
    if (!ok) return
    setLoading('mgr')
    const result = await sendManagerReviewReminders(cycleId)
    setLoading(null)
    if (result.error) toast.error(result.error)
    else toast.success(`Reminders sent to ${pendingManagerCount} manager${pendingManagerCount !== 1 ? 's' : ''}.`)
  }

  return (
    <div className="flex flex-wrap gap-3">
      {nextStatus && (
        <Button onClick={handleAdvance} disabled={!!loading} variant="destructive">
          {loading === 'advance' ? 'Advancing…' : `Advance to ${nextStatus.replace(/_/g, ' ')}`}
        </Button>
      )}
      {pendingSelfCount > 0 && (
        <Button variant="outline" onClick={handleSelfReminders} disabled={!!loading}>
          {loading === 'self' ? 'Sending…' : `Remind ${pendingSelfCount} pending self-reviews`}
        </Button>
      )}
      {pendingManagerCount > 0 && (
        <Button variant="outline" onClick={handleManagerReminders} disabled={!!loading}>
          {loading === 'mgr' ? 'Sending…' : `Remind ${pendingManagerCount} pending manager reviews`}
        </Button>
      )}
    </div>
  )
}
```

**Step 2: Import `CycleActionsClient` into the cycle detail page** replacing the existing form-based buttons.

**Step 3: Add `data-tour` attributes to the cycle list page** for the admin-cycles tour:

```tsx
// On the Create Cycle button:
<Button data-tour="create-cycle" asChild><Link href="/admin/cycles/new">Create Cycle</Link></Button>

// On a cycle's status badge:
<span data-tour="cycle-status">...</span>

// On the Advance button:
<div data-tour="advance-btn">...</div>
```

**Step 4: Verify TypeScript, run tests**

```bash
npx tsc --noEmit && npx vitest run
```

**Step 5: Commit**

```bash
git add src/app/(dashboard)/admin/cycles/
git commit -m "feat: confirm + toast + tour attributes on admin cycle pages"
```

---

## Task 11: Apply confirm + toast to HRBP calibration

**Files:**
- Modify: `src/app/(dashboard)/hrbp/calibration/` (override form, lock/publish buttons)

**Step 1: Create `src/app/(dashboard)/hrbp/calibration/calibration-actions-client.tsx`**

Extract Lock Cycle and Publish Cycle buttons as a `'use client'` component using `useConfirm` + `useToast`. Same pattern as Task 10.

Lock confirm message: *"Locking freezes all ratings — no more overrides will be possible after this."*
Publish confirm message: *"Publishing makes results visible to all employees. This cannot be undone."*

**Step 2: Add `data-tour` attributes to calibration page:**

```tsx
<div data-tour="bell-curve">   {/* BellCurveChart */}
<div data-tour="override-form">{/* override table row */}
<button data-tour="lock-btn">  {/* Lock Cycle */}
<button data-tour="publish-btn">{/* Publish Cycle */}
```

**Step 3: Verify and commit**

```bash
npx tsc --noEmit && npx vitest run
git add src/app/(dashboard)/hrbp/
git commit -m "feat: confirm + toast + tour attributes on HRBP calibration"
```

---

## Task 12: Apply confirm + toast to admin feature flags

**Files:**
- Modify: `src/app/(dashboard)/admin/feature-flags/feature-flag-toggle.tsx`

Make the toggle fire a confirm dialog for any flag in the `modules` category (most impactful):

```tsx
// In feature-flag-toggle.tsx — add useConfirm + useToast
const confirm = useConfirm()
const { toast } = useToast()

async function handleToggle() {
  if (category === 'modules') {
    const ok = await confirm({
      title: `${enabled ? 'Disable' : 'Enable'} ${name}?`,
      description: `This affects all users immediately. ${enabled ? 'Disabling' : 'Enabling'} a module changes what everyone can see.`,
      confirmLabel: enabled ? 'Disable' : 'Enable',
      variant: 'destructive',
    })
    if (!ok) return
  }
  // existing toggle logic
  const result = await toggleFlag(id, !enabled)
  if (result.error) toast.error(result.error)
  else toast.success(`${name} ${!enabled ? 'enabled' : 'disabled'}.`)
}
```

**Commit:**

```bash
git add src/app/(dashboard)/admin/feature-flags/
git commit -m "feat: confirm dialog on module feature flag toggles"
```

---

## Task 13: Apply toast to employee + manager forms

**Files:**
- Modify: `src/app/(dashboard)/employee/self-review-form.tsx`
- Modify: `src/app/(dashboard)/manager/[employeeId]/review/review-form.tsx`

Both use `useActionState`. After the server action returns, show a toast based on `ActionResult`:

```tsx
// After useActionState returns a result:
useEffect(() => {
  if (!state) return
  if (state.error) toast.error(state.error)
  else if (state.data) toast.success('Your review has been submitted.')
}, [state])
```

Add `data-tour` attributes for employee and manager tours:

```tsx
// Employee page (src/app/(dashboard)/employee/page.tsx):
<div data-tour="action-inbox">  {/* ActionInbox */}
<div data-tour="kpi-list">      {/* KPI list section */}
<div data-tour="self-review-form"> {/* SelfReviewForm */}
<button data-tour="submit-review"> {/* Submit button */}

// Manager page (src/app/(dashboard)/manager/page.tsx):
<table data-tour="team-table">
// Per employee row:
<Link data-tour="kpi-button" ...>KPIs</Link>
<Link data-tour="review-button" ...>Review</Link>
```

**Commit:**

```bash
git add src/app/(dashboard)/employee/ src/app/(dashboard)/manager/
git commit -m "feat: toast feedback + tour attributes on employee and manager pages"
```

---

## Task 14: Apply data-tour attributes to manager KPI page

**Files:**
- Modify: `src/app/(dashboard)/manager/[employeeId]/kpis/page.tsx`

```tsx
<div data-tour="template-picker">  {/* KpiTemplatePicker */}
<input data-tour="weight-field" /> {/* Weight input in add form */}
<button data-tour="add-kpi-btn">   {/* Add KPI submit button */}
```

**Commit:**

```bash
git add src/app/(dashboard)/manager/
git commit -m "feat: tour data-tour attributes on manager KPI page"
```

---

## Task 15: Final test run + cleanup

**Step 1: Run all tests**

```bash
npx vitest run
```
Expected: All pass (existing 55 + new ~9 = ~64 passing)

**Step 2: TypeScript check**

```bash
npx tsc --noEmit
```
Expected: 0 errors

**Step 3: Smoke test in browser**

Start the dev server and manually verify:
- [ ] Toast appears after submitting self-review
- [ ] Confirm dialog appears when clicking Advance Cycle
- [ ] Help button opens panel with bullets for current page
- [ ] Sidebar Help link opens same panel
- [ ] Search in panel filters articles
- [ ] Tour auto-starts on `/employee` first visit
- [ ] Tour can be replayed from Help panel
- [ ] Tour can be skipped
- [ ] Cursor on login left panel is hidden

**Step 4: Final commit**

```bash
git add -A
git commit -m "feat: complete UX help & feedback system — toasts, confirm dialogs, help panel, spotlight tours"
```
