import { randomUUID } from 'crypto'
import type Database from 'better-sqlite3'
import {
  assertPaymentWithinDue,
  invoicePaidAndDue,
  sumActivePaymentsPaisa
} from '../../../core/payments'
import { INVOICE_IMAGE_NAME } from '../../../shared/invoices'
import type {
  CreatePaymentInput,
  Payment,
  PaymentMethod,
  PaymentRecordStatus,
  PaymentSummary,
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

export function createPayment(db: Database.Database, input: CreatePaymentInput): Payment {
  const attachment = input.attachment_path ?? null
  let createdId: string | null = null

  try {
    const run = db.transaction(() => {
      const invoice = db
        .prepare(`SELECT id, status, total FROM invoices WHERE id = ?`)
        .get(input.invoice_id) as InvoicePayRow | undefined
      if (!invoice) throw new Error('Invoice not found')
      if (invoice.status !== 'issued') throw new Error('Only issued invoices can receive payments')

      const paid = sumActivePaymentsForInvoice(db, invoice.id)
      const { due } = invoicePaidAndDue('issued', invoice.total, paid)
      assertPaymentWithinDue(input.amount, due)

      if (attachment) {
        if (!INVOICE_IMAGE_NAME.test(attachment) || !storedImageExists(attachment)) {
          throw new Error('Attachment file is missing')
        }
      }

      const id = randomUUID()
      const now = new Date().toISOString()
      db.prepare(
        `INSERT INTO payments (
           id, invoice_id, amount, method, payment_date, note, attachment_path,
           status, void_reason, voided_at, created_at, updated_at
         ) VALUES (?, ?, ?, ?, ?, ?, ?, 'active', NULL, NULL, ?, ?)`
      ).run(
        id,
        input.invoice_id,
        input.amount,
        input.method,
        input.payment_date,
        input.note ?? null,
        attachment,
        now,
        now
      )
      createdId = id
      return id
    })

    const id = run()
    const row = db.prepare(`SELECT * FROM payments WHERE id = ?`).get(id) as PaymentRow | undefined
    if (!row) throw new Error('Payment not found')
    return mapPayment(row)
  } catch (error) {
    if (attachment && !createdId) {
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

  const existing = db.prepare(`SELECT * FROM payments WHERE id = ?`).get(id) as PaymentRow | undefined
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
