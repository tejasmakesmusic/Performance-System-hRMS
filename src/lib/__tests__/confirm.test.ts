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
