'use client'

import { useFormStatus } from 'react-dom'
import { Button } from '@/components/ui/button'
import type { ComponentProps } from 'react'

type ButtonProps = ComponentProps<typeof Button>

interface SubmitButtonProps extends Omit<ButtonProps, 'formAction'> {
  pendingLabel?: string
  formAction?: (formData: FormData) => void | Promise<void>
}

export function SubmitButton({ pendingLabel, children, formAction, disabled, ...props }: SubmitButtonProps) {
  const { pending } = useFormStatus()
  return (
    <Button
      {...props}
      type="submit"
      formAction={formAction}
      disabled={disabled || pending}
      aria-disabled={disabled || pending}
    >
      {pending && pendingLabel ? pendingLabel : children}
    </Button>
  )
}
