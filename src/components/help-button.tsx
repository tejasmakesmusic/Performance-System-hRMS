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
