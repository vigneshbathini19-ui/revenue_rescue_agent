'use client'

import { useEffect } from 'react'
import {
  Braces,
  CheckCircle2,
  ShieldCheck,
  Sparkles,
  Wallet,
  X,
  XCircle,
} from 'lucide-react'
import { formatINR, type PaymentEvent } from '@/lib/revenue-data'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { GateBadge, ResultBadge } from './status-badges'

function Step({
  index,
  title,
  icon,
  children,
}: {
  index: number
  title: string
  icon: React.ReactNode
  children: React.ReactNode
}) {
  return (
    <div className="relative pl-11">
      <span className="absolute left-0 top-0 flex size-8 items-center justify-center rounded-full border border-border bg-card text-primary">
        {icon}
      </span>
      <div className="flex flex-col gap-2">
        <div className="flex items-center gap-2">
          <span className="font-mono text-xs font-medium text-muted-foreground">
            STEP {index}
          </span>
          <h3 className="text-sm font-semibold text-foreground">{title}</h3>
        </div>
        {children}
      </div>
    </div>
  )
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-4 py-1.5 text-sm">
      <span className="text-muted-foreground">{label}</span>
      <span className="text-right font-medium text-foreground">{value}</span>
    </div>
  )
}

export function AuditTrace({
  event,
  onClose,
}: {
  event: PaymentEvent | null
  onClose: () => void
}) {
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }
    if (event) {
      document.addEventListener('keydown', onKey)
      document.body.style.overflow = 'hidden'
    }
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = ''
    }
  }, [event, onClose])

  const open = Boolean(event)

  return (
    <div
      className={cn(
        'fixed inset-0 z-50',
        open ? 'pointer-events-auto' : 'pointer-events-none',
      )}
      aria-hidden={!open}
    >
      <div
        onClick={onClose}
        className={cn(
          'absolute inset-0 bg-foreground/40 backdrop-blur-[2px] transition-opacity duration-300',
          open ? 'opacity-100' : 'opacity-0',
        )}
      />
      <aside
        role="dialog"
        aria-modal="true"
        aria-label="Audit trace"
        className={cn(
          'absolute right-0 top-0 flex h-full w-full max-w-xl flex-col border-l border-border bg-background shadow-2xl transition-transform duration-300 ease-out',
          open ? 'translate-x-0' : 'translate-x-full',
        )}
      >
        {event && (
          <>
            <header className="flex items-start justify-between gap-4 border-b border-border p-5">
              <div className="flex flex-col gap-1">
                <div className="flex items-center gap-2">
                  <span className="font-mono text-xs text-muted-foreground">
                    {event.id}
                  </span>
                  <ResultBadge result={event.result} />
                </div>
                <h2 className="text-lg font-semibold text-foreground">
                  {event.customer}
                </h2>
                <p className="text-sm text-muted-foreground">
                  {formatINR(event.amount)} · {event.failureReason}
                </p>
              </div>
              <Button
                variant="ghost"
                size="icon"
                onClick={onClose}
                aria-label="Close audit trace"
              >
                <X className="size-4" />
              </Button>
            </header>

            <div className="flex flex-1 flex-col gap-8 overflow-y-auto p-6">
              <Step index={1} title="Raw Payment Event" icon={<Braces className="size-4" />}>
                <div className="rounded-lg border border-border bg-muted/40 px-4 py-2">
                  <Field label="Gateway" value={event.trace.rawEvent.gateway} />
                  <Field label="Method" value={event.trace.rawEvent.method} />
                  <Field label="Currency" value={event.trace.rawEvent.currency} />
                  <Field
                    label="Prior attempts"
                    value={String(event.trace.rawEvent.attempts)}
                  />
                  <Field label="Declined amount" value={formatINR(event.amount)} />
                  <Field label="Failure reason" value={event.failureReason} />
                </div>
              </Step>

              <Step
                index={2}
                title="AI Diagnosis & Rationale"
                icon={<Sparkles className="size-4" />}
              >
                <div className="flex flex-col gap-3 rounded-lg border border-border bg-muted/40 p-4">
                  <div className="flex items-center gap-2">
                    <span className="rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">
                      {event.trace.diagnosis.category}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      Confidence{' '}
                      <span className="font-mono font-medium text-foreground">
                        {(event.trace.diagnosis.confidence * 100).toFixed(0)}%
                      </span>
                    </span>
                  </div>
                  <p className="text-sm leading-relaxed text-foreground">
                    {event.trace.diagnosis.rationale}
                  </p>
                  <div className="rounded-md border border-primary/20 bg-primary/5 px-3 py-2 text-sm">
                    <span className="font-medium text-primary">
                      Recommendation:{' '}
                    </span>
                    <span className="text-foreground">
                      {event.recommendation}
                    </span>
                  </div>
                </div>
              </Step>

              <Step
                index={3}
                title="Policy Safety Gate Verification"
                icon={<ShieldCheck className="size-4" />}
              >
                <div className="flex flex-col gap-3 rounded-lg border border-border bg-muted/40 p-4">
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-muted-foreground">
                      Gate verdict
                    </span>
                    <GateBadge status={event.trace.policyGate.verdict} />
                  </div>
                  <ul className="flex flex-col gap-2">
                    {event.trace.policyGate.checks.map((c) => (
                      <li
                        key={c.label}
                        className="flex items-center gap-2 text-sm"
                      >
                        {c.passed ? (
                          <CheckCircle2 className="size-4 text-primary" />
                        ) : (
                          <XCircle className="size-4 text-destructive" />
                        )}
                        <span
                          className={cn(
                            c.passed
                              ? 'text-foreground'
                              : 'text-muted-foreground line-through',
                          )}
                        >
                          {c.label}
                        </span>
                      </li>
                    ))}
                  </ul>
                  <p className="text-xs text-muted-foreground">
                    {event.trace.policyGate.note}
                  </p>
                </div>
              </Step>

              <Step
                index={4}
                title="Execution Outcome & Revenue Recovered"
                icon={<Wallet className="size-4" />}
              >
                <div className="flex flex-col gap-3 rounded-lg border border-border bg-muted/40 p-4">
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-muted-foreground">
                      Final action
                    </span>
                    <span className="text-sm font-medium text-foreground">
                      {event.finalAction}
                    </span>
                  </div>
                  <p className="text-sm text-foreground">
                    {event.trace.execution.outcome}
                  </p>
                  <div className="flex items-end justify-between rounded-lg border border-border bg-card p-4">
                    <div className="flex flex-col">
                      <span className="text-xs text-muted-foreground">
                        Revenue recovered
                      </span>
                      <span
                        className={cn(
                          'font-mono text-2xl font-semibold tabular-nums',
                          event.recovered > 0
                            ? 'text-primary'
                            : 'text-muted-foreground',
                        )}
                      >
                        {formatINR(event.recovered)}
                      </span>
                    </div>
                    <span className="font-mono text-xs text-muted-foreground">
                      {event.trace.execution.latencyMs} ms
                    </span>
                  </div>
                </div>
              </Step>
            </div>
          </>
        )}
      </aside>
    </div>
  )
}
