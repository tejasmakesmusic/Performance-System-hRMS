interface DeadlineBannerProps {
  deadline: string | null
  label: string
}

export function DeadlineBanner({ deadline, label }: DeadlineBannerProps) {
  if (!deadline) return null

  const deadlineDate = new Date(deadline)
  const now = new Date()
  const isPassed = now > deadlineDate

  const formatted = deadlineDate.toLocaleDateString(undefined, {
    year: 'numeric', month: 'short', day: 'numeric',
  })

  if (isPassed) {
    return (
      <div className="rounded border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
        <span className="font-semibold">Deadline passed</span> — {label} was due {formatted}. Contact your HRBP.
      </div>
    )
  }

  return (
    <div className="rounded border border-yellow-300 bg-yellow-50 px-3 py-2 text-sm text-yellow-800">
      <span className="font-semibold">{label} deadline:</span> {formatted}
    </div>
  )
}
