import { formatINR, type ActionType, type PaymentEvent } from '@/lib/revenue-data'
import { ACTION_COLORS } from './status-badges'

const ORDER: ActionType[] = ['Retry', 'Payment Link', 'Wait', 'Escalated', 'Stopped']

export function ActionBreakdown({ events }: { events: PaymentEvent[] }) {
  const groups = ORDER.map((action) => {
    const rows = events.filter((e) => e.finalAction === action)
    return {
      action,
      count: rows.length,
      recovered: rows.reduce((s, e) => s + e.recovered, 0),
    }
  })
  const max = Math.max(1, ...groups.map((g) => g.count))
  const total = events.length || 1

  return (
    <section className="rounded-xl border border-border bg-card p-5 shadow-sm">
      <div className="mb-5 flex items-baseline justify-between">
        <div>
          <h2 className="text-sm font-semibold text-foreground">
            Actions Taken
          </h2>
          <p className="text-xs text-muted-foreground">
            How the agent distributed {events.length} recovery decisions
          </p>
        </div>
      </div>

      <div className="flex flex-col gap-4">
        {groups.map((g) => {
          const pct = (g.count / total) * 100
          return (
            <div key={g.action} className="flex flex-col gap-1.5">
              <div className="flex items-center justify-between text-sm">
                <span className="flex items-center gap-2 font-medium text-foreground">
                  <span
                    aria-hidden
                    className="size-2.5 rounded-sm"
                    style={{ backgroundColor: ACTION_COLORS[g.action] }}
                  />
                  {g.action}
                </span>
                <span className="flex items-center gap-3 text-muted-foreground">
                  <span className="font-mono tabular-nums text-foreground">
                    {g.count}
                  </span>
                  <span className="hidden font-mono text-xs tabular-nums sm:inline">
                    {formatINR(g.recovered)}
                  </span>
                </span>
              </div>
              <div className="h-2.5 w-full overflow-hidden rounded-full bg-muted">
                <div
                  className="h-full rounded-full transition-all duration-700"
                  style={{
                    width: `${(g.count / max) * 100}%`,
                    backgroundColor: ACTION_COLORS[g.action],
                  }}
                />
              </div>
              <span className="text-xs text-muted-foreground">
                {pct.toFixed(0)}% of decisions
              </span>
            </div>
          )
        })}
      </div>
    </section>
  )
}
