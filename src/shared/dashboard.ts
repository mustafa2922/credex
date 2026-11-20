import type { PaymentStatus } from './payments'

export type DashboardMonth = {
  /** YYYY-MM */
  key: string
  /** Short month label, e.g. Jun */
  label: string
  invoiced: number
  collected: number
}

export type DashboardRecentInvoice = {
  id: string
  number: string
  client_name: string
  invoice_date: string
  total: number
  paid: number
  due: number
  payment_status: PaymentStatus
}

export type DashboardSummary = {
  receivable: number
  open_invoices: number
  collected_this_month: number
  active_clients: number
  invoice_status: {
    paid: number
    partial: number
    unpaid: number
  }
  monthly: DashboardMonth[]
  recent_invoices: DashboardRecentInvoice[]
}
