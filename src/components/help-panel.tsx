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
            <div className="px-6 py-4 space-y-4">
              {searchResults.length === 0 && (
                <p className="text-sm text-muted-foreground">No articles found for &quot;{search}&quot;.</p>
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
