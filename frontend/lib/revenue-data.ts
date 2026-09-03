export type ActionType = 'Retry' | 'Payment Link' | 'Wait' | 'Escalated' | 'Stopped'
export type ResultType = 'SUCCESS' | 'FAILED' | 'PENDING' | 'ESCALATED' | 'STOPPED'
export type GateStatus = 'Approved' | 'Overridden'

export interface AuditTrace {
  rawEvent: {
    gateway: string
    method: string
    timestamp: string
    attempts: number
    currency: string
  }
  diagnosis: {
    rationale: string
    confidence: number
    category: string
  }
  policyGate: {
    checks: { label: string; passed: boolean }[]
    verdict: GateStatus
    note: string
  }
  execution: {
    outcome: string
    recovered: number
    latencyMs: number
  }
}

export interface PaymentEvent {
  id: string
  customer: string
  email: string
  amount: number
  failureReason: string
  recommendation: string
  gateStatus: GateStatus
  finalAction: ActionType
  result: ResultType
  recovered: number
  trace: AuditTrace
}

export interface DashboardData {
  events: PaymentEvent[]
  generatedAt: string
}

export function formatINR(value: number): string {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 0,
  }).format(value)
}

const CUSTOMERS = [
  'Aarav Mehta',
  'Priya Sharma',
  'Rohan Gupta',
  'Ananya Iyer',
  'Vikram Reddy',
  'Sneha Nair',
  'Karan Malhotra',
  'Diya Kapoor',
  'Arjun Singh',
  'Isha Verma',
  'Kabir Joshi',
  'Meera Pillai',
  'Aditya Rao',
  'Nisha Bose',
  'Rahul Chopra',
]

const COMPANIES = [
  'Nimbus Labs',
  'Corepay Retail',
  'Zenith Foods',
  'Orbit Media',
  'Halcyon SaaS',
  'Vertex Cloud',
  'Lumen Health',
  'Pioneer Logistics',
]

const FAILURE_REASONS = [
  'Insufficient funds',
  'Card expired',
  'Issuer declined',
  'Do not honor',
  'Network timeout',
  'CVV mismatch',
  '3DS authentication failed',
  'Fraud hold',
]

const GATEWAYS = ['Razorpay', 'Stripe', 'PayU', 'Cashfree']
const METHODS = ['UPI Autopay', 'Credit Card', 'Debit Card', 'Net Banking']

function pick<T>(arr: T[], rng: () => number): T {
  return arr[Math.floor(rng() * arr.length)]
}

// Deterministic-ish PRNG so repeated batches feel stable but seedable.
function makeRng(seed: number) {
  let s = seed % 2147483647
  if (s <= 0) s += 2147483646
  return () => {
    s = (s * 16807) % 2147483647
    return (s - 1) / 2147483646
  }
}

function buildRecommendation(
  reason: string,
  action: ActionType,
): string {
  switch (action) {
    case 'Retry':
      return `Smart-retry after grace window (${reason.toLowerCase()})`
    case 'Payment Link':
      return `Send secure payment link to customer`
    case 'Wait':
      return `Defer recovery and re-check later`
    case 'Escalated':
      return `Route to human — high-value / risk flag`
    case 'Stopped':
      return `Halt recovery — policy limit breached`
  }
}

function actionForReason(reason: string, rng: () => number): ActionType {
  if (reason === 'Fraud hold') return rng() > 0.4 ? 'Escalated' : 'Stopped'
  if (reason === 'Card expired') return 'Payment Link'
  if (reason === '3DS authentication failed')
    return rng() > 0.5 ? 'Payment Link' : 'Escalated'
  if (reason === 'Insufficient funds' || reason === 'Network timeout')
    return 'Retry'
  const r = rng()
  if (r > 0.75) return 'Escalated'
  if (r > 0.55) return 'Payment Link'
  if (r > 0.12) return 'Retry'
  return 'Stopped'
}

function resultForAction(action: ActionType, rng: () => number): ResultType {
  switch (action) {
    case 'Escalated':
      return 'ESCALATED'
    case 'Stopped':
      return 'STOPPED'
    case 'Retry':
      return rng() > 0.32 ? 'SUCCESS' : rng() > 0.5 ? 'PENDING' : 'ESCALATED'
    case 'Payment Link':
      return rng() > 0.45 ? 'SUCCESS' : 'PENDING'
  }
}

export function generateEvents(count: number, seed = Date.now()): PaymentEvent[] {
  const rng = makeRng(seed)
  const events: PaymentEvent[] = []

  for (let i = 0; i < count; i++) {
    const reason = pick(FAILURE_REASONS, rng)
    const action = actionForReason(reason, rng)
    const result = resultForAction(action, rng)
    const amount = Math.round((2000 + rng() * 148000) / 100) * 100
    const recovered = result === 'SUCCESS' ? amount : 0
    const highValue = amount > 90000

    const gateStatus: GateStatus =
      action === 'Stopped' || (highValue && action === 'Retry')
        ? 'Overridden'
        : 'Approved'

    const person = pick(CUSTOMERS, rng)
    const company = pick(COMPANIES, rng)
    const gateway = pick(GATEWAYS, rng)
    const method = pick(METHODS, rng)

    events.push({
      id: `pay_${(seed % 100000).toString(36)}${(1000 + i).toString(36)}`,
      customer: person,
      email: `${person.split(' ')[0].toLowerCase()}@${company
        .split(' ')[0]
        .toLowerCase()}.com`,
      amount,
      failureReason: reason,
      recommendation: buildRecommendation(reason, action),
      gateStatus,
      finalAction: action,
      result,
      recovered,
      trace: {
        rawEvent: {
          gateway,
          method,
          timestamp: new Date(Date.now() - i * 37000).toISOString(),
          attempts: 1 + Math.floor(rng() * 3),
          currency: 'INR',
        },
        diagnosis: {
          rationale:
            reason === 'Insufficient funds'
              ? 'Balance shortfall detected on a recurring mandate. Historically resolves within 24h — recommend timed retry rather than customer friction.'
              : reason === 'Card expired'
                ? 'Stored card past expiry. Retrying is futile; the customer must supply fresh credentials via a secure link.'
                : reason === 'Fraud hold'
                  ? 'Velocity and geo signals exceed the risk threshold. Autonomous recovery is unsafe without human review.'
                  : `Gateway returned "${reason}". Pattern matches a recoverable soft-decline for ${method} on ${gateway}.`,
          confidence: 0.6 + rng() * 0.39,
          category:
            action === 'Escalated' || action === 'Stopped'
              ? 'High Risk'
              : 'Recoverable',
        },
        policyGate: {
          checks: [
            { label: 'Amount within auto-recovery ceiling', passed: !highValue },
            { label: 'Retry attempts under mandate cap', passed: rng() > 0.15 },
            {
              label: 'Customer not on do-not-contact list',
              passed: rng() > 0.08,
            },
            { label: 'Risk score below block threshold', passed: reason !== 'Fraud hold' },
          ],
          verdict: gateStatus,
          note:
            gateStatus === 'Overridden'
              ? 'Agent recommendation overridden by policy gate to protect against limit breach.'
              : 'All safety limits satisfied — agent cleared to execute.',
        },
        execution: {
          outcome:
            result === 'SUCCESS'
              ? `Payment recovered via ${action}.`
              : result === 'PENDING'
                ? `${action} dispatched — awaiting customer / issuer response.`
                : result === 'ESCALATED'
                  ? 'Handed to human agent with full context packet.'
                  : 'Recovery halted before any charge attempt.',
          recovered,
          latencyMs: 120 + Math.floor(rng() * 900),
        },
      },
    })
  }

  return events
}

/** 
 * Backend API URL Normalization.
 * Strips accidental protocol strings, trailing slashes, and redundant /api endings,
 * then guarantees that the final API_BASE strictly points to `.../api`.
 */
const rawUrl = (process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000/api")
  .trim()
  .replace(/^https?:\/\//i, "")
  .replace(/\/+$/, "")
  .replace(/\/api$/i, "");

const isLocalhost = rawUrl.startsWith("localhost") || rawUrl.startsWith("127.0.0.1");
const protocol = isLocalhost ? "http://" : "https://";

export const API_BASE = `${protocol}${rawUrl}/api`;

type BackendAudit = {
  id: string
  timestamp: string
  payment_id: string
  customer_id: string
  amount: number
  failure_reason: string
  ai_decision: 'RETRY' | 'PAYMENT_LINK' | 'WAIT' | 'ESCALATE' | 'STOP'
  ai_confidence: number
  ai_rationale: string
  policy_decision: 'RETRY' | 'PAYMENT_LINK' | 'WAIT' | 'ESCALATE' | 'STOP'
  policy_approved: boolean
  policy_reason: string
  final_action: 'RETRY' | 'PAYMENT_LINK' | 'WAIT' | 'ESCALATE' | 'STOP'
  execution_result: 'SUCCESS' | 'FAILED' | 'PENDING' | 'ESCALATED' | 'STOPPED'
  amount_recovered: number
}

type AuditResponse = {
  page: number
  page_size: number
  total: number
  total_pages: number
  results: BackendAudit[]
}

type SimulationResponse = {
  batch_size: number
  processed: number
  action_counts: Record<string, number>
  status_counts: Record<string, number>
  amount_recovered_this_run: number
  audits: BackendAudit[]
}

function labelAction(action: BackendAudit['final_action']): ActionType {
  switch (action) {
    case 'RETRY': return 'Retry'
    case 'PAYMENT_LINK': return 'Payment Link'
    case 'WAIT': return 'Wait'
    case 'ESCALATE': return 'Escalated'
    case 'STOP': return 'Stopped'
  }
}

function labelResult(result: BackendAudit['execution_result']): ResultType {
  return result
}

function labelReason(reason: string): string {
  return reason.replaceAll('_', ' ').replace(/\b\w/g, (c) => c.toUpperCase())
}

function auditToEvent(a: BackendAudit): PaymentEvent {
  const action = labelAction(a.final_action)
  const result = labelResult(a.execution_result)
  const highValue = a.amount > 10000

  return {
    id: a.payment_id,
    customer: a.customer_id,
    email: `${a.customer_id}@synthetic.customer`,
    amount: a.amount,
    failureReason: labelReason(a.failure_reason),
    recommendation: a.ai_rationale,
    gateStatus: a.policy_approved ? 'Approved' : 'Overridden',
    finalAction: action,
    result,
    recovered: a.amount_recovered,
    trace: {
      rawEvent: {
        gateway: 'Simulated gateway',
        method: 'Synthetic payment',
        timestamp: a.timestamp,
        attempts: 1,
        currency: 'INR',
      },
      diagnosis: {
        rationale: a.ai_rationale,
        confidence: a.ai_confidence,
        category: a.ai_decision === 'ESCALATE' || a.ai_decision === 'STOP' ? 'High Risk' : 'Recoverable',
      },
      policyGate: {
        checks: [
          { label: 'Amount within auto-recovery ceiling', passed: !highValue },
          { label: 'AI action approved by policy', passed: a.policy_approved },
        ],
        verdict: a.policy_approved ? 'Approved' : 'Overridden',
        note: a.policy_reason,
      },
      execution: {
        outcome:
          result === 'SUCCESS' ? `Payment recovered via ${action}.` :
          result === 'PENDING' ? `${action} dispatched — awaiting response.` :
          result === 'ESCALATED' ? 'Handed to human agent with full context.' :
          'Recovery halted before a charge attempt.',
        recovered: a.amount_recovered,
        latencyMs: 0,
      },
    },
  }
}

async function getAudits(count: number): Promise<BackendAudit[]> {
  const pageSize = Math.min(Math.max(count, 1), 500)
  // Replace: signal: AbortSignal.timeout(10000)
const res = await fetch(`${API_BASE}/audit-trail?page=1&page_size=${pageSize}`, {
  cache: 'no-store',
})
  if (!res.ok) throw new Error(`API responded ${res.status}`)
  const json = (await res.json()) as AuditResponse
  return json.results
}

export async function fetchDashboardData(
  count = 100,
): Promise<{ data: DashboardData; live: boolean }> {
  try {
    const audits = await getAudits(count)
    return {
      data: { events: audits.map(auditToEvent), generatedAt: new Date().toISOString() },
      live: true,
    }
  } catch {
    return {
      data: { events: generateEvents(count), generatedAt: new Date().toISOString() },
      live: false,
    }
  }
}

export async function runBatchSimulation(
  count = 100,
): Promise<{ data: DashboardData; live: boolean }> {
  try {
    // Replace: signal: AbortSignal.timeout(30000)
const res = await fetch(`${API_BASE}/run-simulation`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ batch_size: count, reset: false }),
  cache: 'no-store',
})
    if (!res.ok) throw new Error(`API responded ${res.status}`)
    const json = (await res.json()) as SimulationResponse
    return {
      data: {
        events: json.audits.map(auditToEvent),
        generatedAt: new Date().toISOString(),
      },
      live: true,
    }
  } catch {
    return {
      data: {
        events: generateEvents(count, Date.now() + Math.floor(Math.random() * 9999)),
        generatedAt: new Date().toISOString(),
      },
      live: false,
    }
  }
}