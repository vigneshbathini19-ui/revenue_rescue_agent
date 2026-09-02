'use client'

import { useMemo, useState } from 'react'
import { ChevronRight, ListFilter } from 'lucide-react'
import {
  formatINR,
  type ActionType,
  type PaymentEvent,
  type ResultType,
} from '@/lib/revenue-data'
import { cn } from '@/lib/utils'
import { ActionDot, GateBadge, ResultBadge } from './status-badges'

const ACTIONS: (ActionType | 'All')[] = [
  'All',
  'Retry',
  'Payment Link',
  'Wait',
  'Escalated',
  'Stopped',
]
const RESULTS: (ResultType | 'All')[] = [
  'All',
  'SUCCESS',
  'FAILED',
  'PENDING',
  'ESCALATED',
  'STOPPED',
]

function FilterSelect<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string
  value: T
  options: T[]
  onChange: (v: T) => void
}) {
  return (
    <label className="flex items-center gap-2 text-sm">
      <span className="text-muted-foreground">{label}</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value as T)}
        className="h-8 rounded-lg border border-border bg-background px-2.5 text-sm font-medium text-foreground outline-none transition-colors hover:bg-muted focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
      >
        {options.map((o) => (
          <option key={o} value={o}>
            {o}
          </option>
        ))}
      </select>
    </label>
  )
}

export function RecoveryTable({
  events,
  onSelect,
  selectedId,
}: {
  events: PaymentEvent[]
  onSelect: (event: PaymentEvent) => void
  selectedId?: string
}) {
  const [actionFilter, setActionFilter] = useState<ActionType | 'All'>('All')
  const [resultFilter, setResultFilter] = useState<ResultType | 'All'>('All')

  const filtered = useMemo(
    () =>
      events.filter(
        (e) =>
          (actionFilter === 'All' || e.finalAction === actionFilter) &&
          (resultFilter === 'All' || e.result === resultFilter),
      ),
    [events, actionFilter, resultFilter],
  )

  return (
    <section className="flex flex-col overflow-hidden rounded-xl border border-border bg-card shadow-sm">
      <div className="flex flex-col gap-3 border-b border-border p-5 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-sm font-semibold text-foreground">
            Recovery Queue & Audit Log
          </h2>
          <p className="text-xs text-muted-foreground">
            {filtered.length} of {events.length} events · click a row for the
            full audit trace
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <ListFilter className="size-4 text-muted-foreground" />
          <FilterSelect
            label="Action"
            value={actionFilter}
            options={ACTIONS}
            onChange={setActionFilter}
          />
          <FilterSelect
            label="Result"
            value={resultFilter}
            options={RESULTS}
            onChange={setResultFilter}
          />
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full min-w-[880px] border-collapse text-sm">
          <thead>
            <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted-foreground">
              <th className="px-5 py-3 font-medium">Payment ID</th>
              <th className="px-5 py-3 font-medium">Customer</th>
              <th className="px-5 py-3 text-right font-medium">Amount</th>
              <th className="px-5 py-3 font-medium">Failure Reason</th>
              <th className="px-5 py-3 font-medium">AI Recommendation</th>
              <th className="px-5 py-3 font-medium">Policy Gate</th>
              <th className="px-5 py-3 font-medium">Final Action</th>
              <th className="px-5 py-3 font-medium">Result</th>
              <th className="px-5 py-3" />
            </tr>
          </thead>
          <tbody>
            {filtered.map((e) => (
              <tr
                key={e.id}
                tabIndex={0}
                onClick={() => onSelect(e)}
                onKeyDown={(ev) => {
                  if (ev.key === 'Enter' || ev.key === ' ') {
                    ev.preventDefault()
                    onSelect(e)
                  }
                }}
                className={cn(
                  'group cursor-pointer border-b border-border/60 outline-none transition-colors last:border-0 hover:bg-muted/60 focus-visible:bg-muted',
                  selectedId === e.id && 'bg-primary/5',
                )}
              >
                <td className="px-5 py-3 font-mono text-xs text-muted-foreground">
                  {e.id}
                </td>
                <td className="px-5 py-3">
                  <div className="flex flex-col">
                    <span className="font-medium text-foreground">
                      {e.customer}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {e.email}
                    </span>
                  </div>
                </td>
                <td className="px-5 py-3 text-right font-mono tabular-nums text-foreground">
                  {formatINR(e.amount)}
                </td>
                <td className="px-5 py-3 text-muted-foreground">
                  {e.failureReason}
                </td>
                <td className="max-w-[240px] px-5 py-3 text-muted-foreground">
                  <span className="line-clamp-2">{e.recommendation}</span>
                </td>
                <td className="px-5 py-3">
                  <GateBadge status={e.gateStatus} />
                </td>
                <td className="px-5 py-3">
                  <ActionDot action={e.finalAction} />
                </td>
                <td className="px-5 py-3">
                  <ResultBadge result={e.result} />
                </td>
                <td className="px-5 py-3">
                  <ChevronRight className="size-4 text-muted-foreground/50 transition-transform group-hover:translate-x-0.5 group-hover:text-foreground" />
                </td>
              </tr>
            ))}
            {filtered.length === 0 && (
              <tr>
                <td
                  colSpan={9}
                  className="px-5 py-16 text-center text-sm text-muted-foreground"
                >
                  No events match the selected filters.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  )
}
