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
