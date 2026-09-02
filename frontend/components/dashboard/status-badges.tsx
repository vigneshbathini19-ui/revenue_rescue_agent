import { cn } from '@/lib/utils'
import type { ActionType, GateStatus, ResultType } from '@/lib/revenue-data'

const RESULT_STYLES: Record<ResultType, string> = {
  SUCCESS:
    'bg-emerald-100 text-emerald-800 ring-emerald-600/20 dark:bg-emerald-950 dark:text-emerald-300 dark:ring-emerald-400/20',
  FAILED:
    'bg-red-100 text-red-800 ring-red-600/20 dark:bg-red-950 dark:text-red-300 dark:ring-red-400/20',
  PENDING:
    'bg-amber-100 text-amber-800 ring-amber-600/20 dark:bg-amber-950 dark:text-amber-300 dark:ring-amber-400/20',
  ESCALATED:
    'bg-orange-100 text-orange-800 ring-orange-600/20 dark:bg-orange-950 dark:text-orange-300 dark:ring-orange-400/20',
  STOPPED:
    'bg-neutral-200 text-neutral-700 ring-neutral-500/20 dark:bg-neutral-800 dark:text-neutral-300 dark:ring-neutral-400/20',
}

export function ResultBadge({ result }: { result: ResultType }) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold tracking-wide ring-1 ring-inset',
        RESULT_STYLES[result],
      )}
    >
      {result}
    </span>
  )
}

export function GateBadge({ status }: { status: GateStatus }) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset',
        status === 'Approved'
          ? 'bg-primary/10 text-primary ring-primary/20'
          : 'bg-destructive/10 text-destructive ring-destructive/20',
      )}
    >
      <span
        className={cn(
          'size-1.5 rounded-full',
          status === 'Approved' ? 'bg-primary' : 'bg-destructive',
        )}
      />
      {status}
    </span>
  )
}

export const ACTION_COLORS: Record<ActionType, string> = {
  Retry: 'var(--color-chart-1)',
  'Payment Link': 'var(--color-chart-2)',
  Wait: 'var(--color-chart-3)',
  Escalated: 'var(--color-chart-4)',
  Stopped: 'var(--color-chart-5)',
}

export function ActionDot({ action }: { action: ActionType }) {
  return (
    <span className="inline-flex items-center gap-1.5 text-sm">
      <span
        aria-hidden
        className="size-2 rounded-full"
        style={{ backgroundColor: ACTION_COLORS[action] }}
      />
      {action}
    </span>
  )
}
