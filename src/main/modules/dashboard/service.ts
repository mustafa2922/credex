import type Database from 'better-sqlite3'
import { invoicePaidAndDue, type PaymentStatus } from '../../../core/payments'
import type {
  DashboardMonth,
  DashboardRecentInvoice,
  DashboardSummary
} from '../../../shared/dashboard'
import { sumActivePaymentsForInvoice } from '../payments/service'

type IssuedInvoiceRow = {
  id: string
  number: string | null
  client_name: string
  invoice_date: string
  total: number
  created_at: string
}

type MonthSumRow = {
  month_key: string
  total: number
}

const MONTH_LABELS = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec'
] as const

function localTodayParts(now = new Date()): { year: number; month: number; day: number } {
  return {
    year: now.getFullYear(),
    month: now.getMonth() + 1,
    day: now.getDate()
  }
}

function pad2(value: number): string {
  return String(value).padStart(2, '0')
}

function monthKey(year: number, month: number): string {
  return `${year}-${pad2(month)}`
}

function monthLabel(month: number): string {
  return MONTH_LABELS[month - 1] ?? pad2(month)
}

/** Last `count` calendar months ending at the current local month (oldest → newest). */
function lastMonthKeys(count: number, now = new Date()): Array<{ key: string; label: string }> {
  const { year, month } = localTodayParts(now)
  const keys: Array<{ key: string; label: string }> = []
  let y = year
  let m = month
  for (let i = 0; i < count; i++) {
    keys.push({ key: monthKey(y, m), label: monthLabel(m) })
    m -= 1
    if (m < 1) {
      m = 12
      y -= 1
    }
  }
  return keys.reverse()
}

function monthRangeBounds(
  keys: Array<{ key: string }>
): { start: string; endExclusive: string } | null {
  if (keys.length === 0) return null
  const first = keys[0]!.key
  const last = keys[keys.length - 1]!.key
  const [ly, lm] = last.split('-').map(Number)
  let endYear = ly!
  let endMonth = lm! + 1
  if (endMonth > 12) {
    endMonth = 1
    endYear += 1
  }
  return {
    start: `${first}-01`,
    endExclusive: `${endYear}-${pad2(endMonth)}-01`
  }
}

function listIssuedInvoices(db: Database.Database): IssuedInvoiceRow[] {
  return db
    .prepare(
      `SELECT i.id, i.number, c.name AS client_name, i.invoice_date, i.total, i.created_at
       FROM invoices i
       JOIN clients c ON c.id = i.client_id
       WHERE i.status = 'issued'`
    )
    .all() as IssuedInvoiceRow[]
}

function toMonthMap(rows: MonthSumRow[]): Map<string, number> {
  const map = new Map<string, number>()
  for (const row of rows) {
    map.set(row.month_key, row.total)
  }
  return map
}

export function getDashboardSummary(db: Database.Database): DashboardSummary {
  const now = new Date()
  const { year, month } = localTodayParts(now)
  const thisMonthKey = monthKey(year, month)
  const monthKeys = lastMonthKeys(6, now)
  const bounds = monthRangeBounds(monthKeys)

  const issued = listIssuedInvoices(db)

  let receivable = 0
  let openInvoices = 0
  let paidCount = 0
  let partialCount = 0
  let unpaidCount = 0

  const withMoney: Array<
    IssuedInvoiceRow & { paid: number; due: number; payment_status: PaymentStatus }
  > = []

  for (const invoice of issued) {
    const paid = sumActivePaymentsForInvoice(db, invoice.id)
    const money = invoicePaidAndDue('issued', invoice.total, paid)
    receivable += money.due
    if (money.paymentStatus === 'paid') paidCount += 1
    else if (money.paymentStatus === 'partial') {
      partialCount += 1
      openInvoices += 1
    } else {
      unpaidCount += 1
      openInvoices += 1
    }
    withMoney.push({
      ...invoice,
      paid: money.paid,
      due: money.due,
      payment_status: money.paymentStatus
    })
  }

  let nextMonthYear = year
  let nextMonth = month + 1
  if (nextMonth > 12) {
    nextMonth = 1
    nextMonthYear += 1
  }
  const thisMonthStart = `${thisMonthKey}-01`
  const nextMonthStart = `${nextMonthYear}-${pad2(nextMonth)}-01`

  const collectedThisMonthRow = db
    .prepare(
      `SELECT COALESCE(SUM(amount), 0) AS total
       FROM payments
       WHERE status = 'active'
         AND payment_date >= ?
         AND payment_date < ?`
    )
    .get(thisMonthStart, nextMonthStart) as { total: number }

  const activeClientsRow = db
    .prepare(`SELECT COUNT(*) AS count FROM clients WHERE status = 'active'`)
    .get() as { count: number }

  const invoicedByMonth = bounds
    ? toMonthMap(
        db
          .prepare(
            `SELECT substr(invoice_date, 1, 7) AS month_key, COALESCE(SUM(total), 0) AS total
             FROM invoices
             WHERE status = 'issued'
               AND invoice_date >= ?
               AND invoice_date < ?
             GROUP BY month_key`
          )
          .all(bounds.start, bounds.endExclusive) as MonthSumRow[]
      )
    : new Map<string, number>()

  const collectedByMonth = bounds
    ? toMonthMap(
        db
          .prepare(
            `SELECT substr(payment_date, 1, 7) AS month_key, COALESCE(SUM(amount), 0) AS total
             FROM payments
             WHERE status = 'active'
               AND payment_date >= ?
               AND payment_date < ?
             GROUP BY month_key`
          )
          .all(bounds.start, bounds.endExclusive) as MonthSumRow[]
      )
    : new Map<string, number>()

  const monthly: DashboardMonth[] = monthKeys.map(({ key, label }) => ({
    key,
    label,
    invoiced: invoicedByMonth.get(key) ?? 0,
    collected: collectedByMonth.get(key) ?? 0
  }))

  const recentSorted = [...withMoney].sort((a, b) => {
    if (a.created_at !== b.created_at) return a.created_at < b.created_at ? 1 : -1
    return a.id < b.id ? 1 : a.id > b.id ? -1 : 0
  })

  const recent_invoices: DashboardRecentInvoice[] = recentSorted.slice(0, 4).map((invoice) => ({
    id: invoice.id,
    number: invoice.number ?? '—',
    client_name: invoice.client_name,
    invoice_date: invoice.invoice_date,
    total: invoice.total,
    paid: invoice.paid,
    due: invoice.due,
    payment_status: invoice.payment_status
  }))

  return {
    receivable,
    open_invoices: openInvoices,
    collected_this_month: collectedThisMonthRow.total,
    active_clients: activeClientsRow.count,
    invoice_status: {
      paid: paidCount,
      partial: partialCount,
      unpaid: unpaidCount
    },
    monthly,
    recent_invoices
  }
}
