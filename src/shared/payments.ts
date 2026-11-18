import { isInvoiceDate } from './invoices'

export type PaymentMethod = 'cash' | 'cheque' | 'online'
export type PaymentRecordStatus = 'active' | 'void'
export type PaymentStatus = 'unpaid' | 'partial' | 'paid'
export type PaymentListStatus = PaymentRecordStatus | 'all'

export type Payment = {
  id: string
  invoice_id: string
  amount: number
  method: PaymentMethod
  payment_date: string
  note: string | null
  attachment_path: string | null
  status: PaymentRecordStatus
  void_reason: string | null
  voided_at: string | null
  created_at: string
  updated_at: string
}

export type PaymentSummary = Payment & {
  invoice_number: string | null
  client_id: string
  client_name: string
}

export type ListPaymentsParams = {
  invoice_id?: string
  client_id?: string
  status?: PaymentListStatus
  search?: string
}

export type CreatePaymentInput = {
  invoice_id: string
  amount: number
  method: PaymentMethod
  payment_date: string
  note?: string | null
  attachment_path?: string | null
}

export type VoidPaymentInput = {
  id: string
  reason: string
}

export function isPaymentDate(value: string): boolean {
  return isInvoiceDate(value)
}

export function paymentMethodLabel(method: PaymentMethod): string {
  if (method === 'cheque') return 'Cheque'
  if (method === 'online') return 'Online'
  return 'Cash'
}

export function paymentStatusLabel(status: PaymentStatus): string {
  if (status === 'partial') return 'Partial'
  if (status === 'paid') return 'Paid'
  return 'Unpaid'
}
