'use client'

import { useCallback, useEffect, useState } from 'react'
import {
  fetchDashboardData,
  runBatchSimulation,
  type PaymentEvent,
} from '@/lib/revenue-data'
import { HeaderBar } from '@/components/dashboard/header-bar'
import { KpiCards } from '@/components/dashboard/kpi-cards'
import { ActionBreakdown } from '@/components/dashboard/action-breakdown'
import { RecoveryTable } from '@/components/dashboard/recovery-table'
import { AuditTrace } from '@/components/dashboard/audit-trace'

export default function Page() {
  const [events, setEvents] = useState<PaymentEvent[]>([])
  const [live, setLive] = useState(false)
  const [running, setRunning] = useState(false)
  const [loading, setLoading] = useState(true)
  const [selected, setSelected] = useState<PaymentEvent | null>(null)

  useEffect(() => {
    let active = true
    fetchDashboardData(100).then(({ data, live }) => {
      if (!active) return
      setEvents(data.events)
      setLive(live)
      setLoading(false)
    })
    return () => {
      active = false
    }
  }, [])

  const handleRun = useCallback(async () => {
    setRunning(true)
    const { data, live } = await runBatchSimulation(100)
    setEvents(data.events)
    setLive(live)
    setSelected(null)
    setRunning(false)
  }, [])

  return (
    <div className="min-h-screen bg-background">
      <HeaderBar onRun={handleRun} running={running} live={live} />

      <main className="mx-auto flex max-w-7xl flex-col gap-6 px-4 py-6 sm:px-6 lg:px-8">
        {loading ? (
          <div className="flex flex-col gap-6">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
              {Array.from({ length: 4 }).map((_, i) => (
                <div
                  key={i}
                  className="h-32 animate-pulse rounded-xl border border-border bg-card"
                />
              ))}
            </div>
            <div className="h-96 animate-pulse rounded-xl border border-border bg-card" />
          </div>
        ) : (
          <>
            <KpiCards events={events} />
            <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_340px]">
              <div className="order-2 lg:order-1">
                <RecoveryTable
                  events={events}
                  onSelect={setSelected}
                  selectedId={selected?.id}
                />
              </div>
              <div className="order-1 lg:order-2">
                <ActionBreakdown events={events} />
              </div>
            </div>
          </>
        )}
      </main>

      <AuditTrace event={selected} onClose={() => setSelected(null)} />
    </div>
  )
}
