'use client'

import { Loader2, Play, ShieldCheck } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

export function HeaderBar({
  onRun,
  running,
  live,
}: {
  onRun: () => void
  running: boolean
  live: boolean
}) {
  return (
    <header className="sticky top-0 z-30 border-b border-border bg-background/80 backdrop-blur-md">
      <div className="mx-auto flex max-w-7xl flex-col gap-4 px-4 py-4 sm:px-6 md:flex-row md:items-center md:justify-between lg:px-8">
        <div className="flex items-center gap-3">
          <span className="flex size-10 items-center justify-center rounded-xl bg-primary text-primary-foreground shadow-sm">
            <ShieldCheck className="size-5" />
          </span>
          <div className="flex flex-col">
            <div className="flex items-center gap-2">
              <h1 className="text-lg font-semibold tracking-tight text-foreground">
                Revenue Rescue Agent
              </h1>
              <span
                className={cn(
                  'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium ring-1 ring-inset',
                  live
                    ? 'bg-primary/10 text-primary ring-primary/20'
                    : 'bg-muted text-muted-foreground ring-border',
                )}
              >
                <span
                  className={cn(
                    'size-1.5 rounded-full',
                    live ? 'bg-primary' : 'bg-muted-foreground/60',
                  )}
                />
                {live ? 'Live API' : 'Demo data'}
              </span>
            </div>
            <p className="text-sm text-muted-foreground">
              Autonomous Revenue Recovery &amp; Policy Gate Engine
            </p>
          </div>
        </div>

        <Button
          size="lg"
          onClick={onRun}
          disabled={running}
          className="w-full md:w-auto"
        >
          {running ? (
            <Loader2 className="size-4 animate-spin" />
          ) : (
            <Play className="size-4" />
          )}
          {running ? 'Running simulation…' : 'Run Batch Simulation (100 Events)'}
        </Button>
      </div>
    </header>
  )
}
