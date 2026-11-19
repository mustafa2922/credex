import { randomUUID } from 'crypto'
import type Database from 'better-sqlite3'
import { formatRupees } from '../../../core/money'
import {
  allocateOldestFirst,
  invoicePaidAndDue,
  sumActivePaymentsPaisa,
  type AllocatableInvoice
} from '../../../core/payments'
import { INVOICE_IMAGE_NAME } from '../../../shared/invoices'
import type {
  CreatePaymentInput,
  CreatePaymentResult,
  Payment,
  PaymentAllocationRow,
  PaymentMethod,
  PaymentRecordStatus,
  PaymentSummary,
  PreviewPaymentInput,
  PreviewPaymentResult,
  ListPaymentsParams
} from '../../../shared/payments'
import { deleteStoredImage, storedImageExists } from '../../files/images'

type PaymentRow = {
  id: string
  invoice_id: string
  amount: number
  method: string
  payment_date: string
  note: string | null
  attachment_path: string | null
  status: string
  void_reason: string | null
  voided_at: string | null
  created_at: string
  updated_at: string
}

type PaymentSummaryRow = PaymentRow & {
  invoice_number: string | null
  client_id: string
  client_name: string
}

type InvoicePayRow = {
  id: string
  number: string | null
  client_id: string
  invoice_date: string
  status: 'draft' | 'issued' | 'void'
  total: number
}

function asMethod(value: string): PaymentMethod {
  if (value === 'cash' || value === 'cheque' || value === 'online') return value
  throw new Error('Payment method is invalid')
}

function asRecordStatus(value: string): PaymentRecordStatus {
  if (value === 'active' || value === 'void') return value
  throw new Error('Payment status is invalid')
}

function mapPayment(row: PaymentRow): Payment {
  return {
    id: row.id,
    invoice_id: row.invoice_id,
    amount: row.amount,
    method: asMethod(row.method),
    payment_date: row.payment_date,
    note: row.note,
    attachment_path: row.attachment_path,
    status: asRecordStatus(row.status),
    void_reason: row.void_reason,
    voided_at: row.voided_at,
    created_at: row.created_at,
    updated_at: row.updated_at
  }
}

function mapSummary(row: PaymentSummaryRow): PaymentSummary {
  return {
    ...mapPayment(row),
    invoice_number: row.invoice_number,
    client_id: row.client_id,
    client_name: row.client_name
  }
}

export function sumActivePaymentsForInvoice(db: Database.Database, invoiceId: string): number {
  const rows = db
    .prepare(`SELECT amount FROM payments WHERE invoice_id = ? AND status = 'active'`)
    .all(invoiceId) as Array<{ amount: number }>
  if (rows.length === 0) return 0
  return sumActivePaymentsPaisa(rows.map((row) => row.amount))
}

export function countActivePaymentsForInvoice(db: Database.Database, invoiceId: string): number {
  const row = db
    .prepare(`SELECT COUNT(*) AS count FROM payments WHERE invoice_id = ? AND status = 'active'`)
    .get(invoiceId) as { count: number }
  return row.count
}

export function listPaymentsForInvoice(db: Database.Database, invoiceId: string): Payment[] {
  const rows = db
    .prepare(
      `SELECT id, invoice_id, amount, method, payment_date, note, attachment_path,
              status, void_reason, voided_at, created_at, updated_at
       FROM payments
       WHERE invoice_id = ?
       ORDER BY payment_date DESC, created_at DESC, id DESC`
    )
    .all(invoiceId) as PaymentRow[]
  return rows.map(mapPayment)
}

export function listPayments(db: Database.Database, params: ListPaymentsParams): PaymentSummary[] {
  const conditions: string[] = []
  const values: unknown[] = []

  if (params.invoice_id) {
    conditions.push('p.invoice_id = ?')
    values.push(params.invoice_id)
  }
  if (params.client_id) {
    conditions.push('i.client_id = ?')
    values.push(params.client_id)
  }
  if (params.status && params.status !== 'all') {
    conditions.push('p.status = ?')
    values.push(params.status)
  }

  const search = params.search?.trim()
  if (search) {
    const pattern = `%${search.toLowerCase()}%`
    conditions.push(`(LOWER(IFNULL(i.number, '')) LIKE ? OR LOWER(c.name) LIKE ?)`)
    values.push(pattern, pattern)
  }

  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : ''
  const rows = db
    .prepare(
      `SELECT p.id, p.invoice_id, p.amount, p.method, p.payment_date, p.note,
              p.attachment_path, p.status, p.void_reason, p.voided_at, p.created_at, p.updated_at,
              i.number AS invoice_number, i.client_id, c.name AS client_name
       FROM payments p
       JOIN invoices i ON i.id = p.invoice_id
       JOIN clients c ON c.id = i.client_id
       ${where}
       ORDER BY p.payment_date DESC, p.created_at DESC, p.id DESC`
    )
    .all(...values) as PaymentSummaryRow[]
  return rows.map(mapSummary)
}

function clientExists(db: Database.Database, clientId: string): boolean {
  const row = db.prepare(`SELECT id FROM clients WHERE id = ?`).get(clientId) as
    { id: string } | undefined
  return Boolean(row)
}

function loadIssuedInvoicesForClient(db: Database.Database, clientId: string): InvoicePayRow[] {
  return db
    .prepare(
      `SELECT id, number, client_id, invoice_date, status, total
       FROM invoices
       WHERE client_id = ? AND status = 'issued'
       ORDER BY invoice_date ASC, IFNULL(number, '') ASC, id ASC`
    )
    .all(clientId) as InvoicePayRow[]
}

function toAllocatable(db: Database.Database, invoice: InvoicePayRow): AllocatableInvoice | null {
  if (invoice.status !== 'issued' || !invoice.number) return null
  const paid = sumActivePaymentsForInvoice(db, invoice.id)
  const { due } = invoicePaidAndDue('issued', invoice.total, paid)
  if (due <= 0) return null
  return {
    id: invoice.id,
    number: invoice.number,
    date: invoice.invoice_date,
    due
  }
}

function planAllocations(
  db: Database.Database,
  input: { client_id: string; invoice_id?: string | null; amount: number }
): PaymentAllocationRow[] {
  if (!clientExists(db, input.client_id)) throw new Error('Client not found')

  const issued = loadIssuedInvoicesForClient(db, input.client_id)
  const invoiceId = input.invoice_id ?? null

  if (invoiceId) {
    const invoice = issued.find((row) => row.id === invoiceId)
    if (!invoice) {
      const any = db
        .prepare(`SELECT id, client_id, status FROM invoices WHERE id = ?`)
        .get(invoiceId) as { id: string; client_id: string; status: string } | undefined
      if (!any) throw new Error('Invoice not found')
      if (any.client_id !== input.client_id) {
        throw new Error('Invoice does not belong to this client')
      }
      if (any.status !== 'issued') throw new Error('Only issued invoices can receive payments')
      throw new Error(`Invoice due is ${formatRupees(0)}`)
    }

    const allocatable = toAllocatable(db, invoice)
    const due = allocatable?.due ?? 0
    if (!allocatable || input.amount > due) {
      throw new Error(`Invoice due is ${formatRupees(due)}`)
    }

    return allocateOldestFirst([allocatable], input.amount).map((row) => ({
      invoice_id: row.invoiceId,
      invoice_number: allocatable.number,
      amount: row.amount
    }))
  }

  const eligible = issued
    .map((invoice) => toAllocatable(db, invoice))
    .filter((invoice): invoice is AllocatableInvoice => invoice != null)

  if (eligible.length === 0) throw new Error('Nothing due')

  const receivable = eligible.reduce((sum, invoice) => sum + invoice.due, 0)
  if (input.amount > receivable) {
    throw new Error(`Client owes ${formatRupees(receivable)}`)
  }

  const numberById = new Map(eligible.map((invoice) => [invoice.id, invoice.number]))
  return allocateOldestFirst(eligible, input.amount).map((row) => ({
    invoice_id: row.invoiceId,
    invoice_number: numberById.get(row.invoiceId) ?? '',
    amount: row.amount
  }))
}

export function previewPayment(
  db: Database.Database,
  input: PreviewPaymentInput
): PreviewPaymentResult {
  try {
    const allocations = planAllocations(db, input)
    return { ok: true, allocations }
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : 'Something went wrong'
    }
  }
}

export function createPayment(
  db: Database.Database,
  input: CreatePaymentInput
): CreatePaymentResult {
  const attachment = input.attachment_path ?? null
  let created = false

  try {
    const run = db.transaction(() => {
      const allocations = planAllocations(db, {
        client_id: input.client_id,
        invoice_id: input.invoice_id,
        amount: input.amount
      })

      if (attachment) {
        if (!INVOICE_IMAGE_NAME.test(attachment) || !storedImageExists(attachment)) {
          throw new Error('Attachment file is missing')
        }
      }

      const now = new Date().toISOString()
      const insert = db.prepare(
        `INSERT INTO payments (
           id, invoice_id, amount, method, payment_date, note, attachment_path,
           status, void_reason, voided_at, created_at, updated_at
         ) VALUES (?, ?, ?, ?, ?, ?, ?, 'active', NULL, NULL, ?, ?)`
      )

      for (const planned of allocations) {
        insert.run(
          randomUUID(),
          planned.invoice_id,
          planned.amount,
          input.method,
          input.payment_date,
          input.note ?? null,
          attachment,
          now,
          now
        )
      }

      return allocations
    })

    const createdRows = run()
    created = true
    return { created: createdRows }
  } catch (error) {
    if (attachment && !created) {
      try {
        deleteStoredImage(attachment)
      } catch (cleanupError) {
        console.error('Failed to delete unused payment attachment', attachment, cleanupError)
      }
    }
    throw error
  }
}

export function voidPayment(db: Database.Database, id: string, reason: string): Payment {
  const trimmed = reason.trim()
  if (!trimmed || trimmed.length > 200) throw new Error('A reason is required')

  const existing = db.prepare(`SELECT * FROM payments WHERE id = ?`).get(id) as
    PaymentRow | undefined
  if (!existing) throw new Error('Payment not found')
  if (existing.status !== 'active') throw new Error('Only active payments can be voided')

  const now = new Date().toISOString()
  const updated = db
    .prepare(
      `UPDATE payments
       SET status = 'void', void_reason = ?, voided_at = ?, updated_at = ?
       WHERE id = ? AND status = 'active'`
    )
    .run(trimmed, now, now, id)
  if (updated.changes !== 1) throw new Error('Only active payments can be voided')

  const row = db.prepare(`SELECT * FROM payments WHERE id = ?`).get(id) as PaymentRow | undefined
  if (!row) throw new Error('Payment not found')
  return mapPayment(row)
}
