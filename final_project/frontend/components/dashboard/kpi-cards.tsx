import {
  AlertTriangle,
  ArrowUpRight,
  TrendingUp,
  UserRoundCog,
} from 'lucide-react'
import { formatINR, type PaymentEvent } from '@/lib/revenue-data'
import { cn } from '@/lib/utils'

function computeKpis(events: PaymentEvent[]) {
  const atRisk = events.reduce((sum, e) => sum + e.amount, 0)
  const recovered = events.reduce((sum, e) => sum + e.recovered, 0)
  const successCount = events.filter((e) => e.result === 'SUCCESS').length
  const escalations = events.filter((e) => e.result === 'ESCALATED').length
  const successRate = events.length ? (successCount / events.length) * 100 : 0
  const recoveryPct = atRisk ? (recovered / atRisk) * 100 : 0
  return { atRisk, recovered, successRate, escalations, recoveryPct }
}

function Card({
  label,
  icon,
  children,
  accent,
}: {
  label: string
  icon: React.ReactNode
  children: React.ReactNode
  accent?: string
}) {
  return (
    <div className="flex flex-col gap-3 rounded-xl border border-border bg-card p-5 shadow-sm">
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium text-muted-foreground">
          {label}
        </span>
        <span
          className={cn(
            'flex size-8 items-center justify-center rounded-lg',
            accent ?? 'bg-muted text-muted-foreground',
          )}
        >
          {icon}
        </span>
      </div>
      {children}
    </div>
  )
}

export function KpiCards({ events }: { events: PaymentEvent[] }) {
  const { atRisk, recovered, successRate, escalations, recoveryPct } =
    computeKpis(events)

  return (
    <section className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
      <Card
        label="Total Revenue at Risk"
        icon={<AlertTriangle className="size-4" />}
        accent="bg-destructive/10 text-destructive"
      >
        <p className="font-mono text-2xl font-semibold tabular-nums text-foreground">
          {formatINR(atRisk)}
        </p>
        <p className="text-xs text-muted-foreground">
          Across {events.length} failed payment events
        </p>
      </Card>

      <Card
        label="Total Recovered"
        icon={<ArrowUpRight className="size-4" />}
        accent="bg-primary/10 text-primary"
      >
        <p className="font-mono text-2xl font-semibold tabular-nums text-foreground">
          {formatINR(recovered)}
        </p>
        <div className="flex flex-col gap-1.5">
          <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
            <div
              className="h-full rounded-full bg-primary transition-all duration-700"
              style={{ width: `${Math.min(recoveryPct, 100)}%` }}
            />
          </div>
          <p className="text-xs text-muted-foreground">
            {recoveryPct.toFixed(1)}% of at-risk revenue reclaimed
          </p>
        </div>
      </Card>

      <Card
        label="Recovery Success Rate"
        icon={<TrendingUp className="size-4" />}
        accent="bg-primary/10 text-primary"
      >
        <p className="font-mono text-2xl font-semibold tabular-nums text-foreground">
          {successRate.toFixed(1)}%
        </p>
        <p className="text-xs text-muted-foreground">
          Share of events fully resolved by the agent
        </p>
      </Card>

      <Card
        label="Human Escalations"
        icon={<UserRoundCog className="size-4" />}
        accent="bg-orange-500/10 text-orange-600 dark:text-orange-400"
      >
        <p className="font-mono text-2xl font-semibold tabular-nums text-foreground">
          {escalations}
        </p>
        <p className="text-xs text-muted-foreground">
          Routed to a human for manual review
        </p>
      </Card>
    </section>
  )
}
