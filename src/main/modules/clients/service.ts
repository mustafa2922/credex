import { randomUUID } from 'crypto'
import type Database from 'better-sqlite3'
import { clientBalancePaisa, invoicePaidAndDue } from '../../../core/payments'
import type { Client, ClientListStatus, ListClientsParams } from '../../../shared/clients'
import type { PaymentMethod } from '../../../shared/payments'
import { listPaymentsForInvoice, sumActivePaymentsForInvoice } from '../payments/service'

type ClientRow = {
  id: string
  name: string
  phone: string | null
  status: 'active' | 'inactive'
  created_at: string
  updated_at: string
}

type IssuedInvoiceRow = {
  id: string
  total: number
}

type LedgerInvoiceRow = {
  id: string
  number: string
  invoice_date: string
  total: number
}

type LedgerLineRow = {
  name: string
  image_path: string | null
  unit_name: string
  quantity: number
  rate: number
  total: number
}

export type ClientLedgerLine = {
  name: string
  image_path: string | null
  unit_name: string
  quantity: number
  rate: number
  total: number
}

export type ClientLedgerPayment = {
  payment_date: string
  method: PaymentMethod
  note: string | null
  amount: number
}

export type ClientLedgerInvoice = {
  id: string
  number: string
  invoice_date: string
  total: number
  paid: number
  due: number
  lines: ClientLedgerLine[]
  payments: ClientLedgerPayment[]
}

export type ClientLedgerData = {
  client: { id: string; name: string; phone: string | null }
  invoices: ClientLedgerInvoice[]
}

function clientBalance(db: Database.Database, clientId: string): number {
  const invoices = db
    .prepare(`SELECT id, total FROM invoices WHERE client_id = ? AND status = 'issued'`)
    .all(clientId) as IssuedInvoiceRow[]
  const dues = invoices.map((invoice) => {
    const paid = sumActivePaymentsForInvoice(db, invoice.id)
    return invoicePaidAndDue('issued', invoice.total, paid).due
  })
  return clientBalancePaisa(dues)
}

function mapRow(db: Database.Database, row: ClientRow): Client {
  return {
    id: row.id,
    name: row.name,
    phone: row.phone,
    status: row.status,
    balance: clientBalance(db, row.id),
    created_at: row.created_at,
    updated_at: row.updated_at
  }
}

function getRow(db: Database.Database, id: string): ClientRow | undefined {
  return db.prepare('SELECT * FROM clients WHERE id = ?').get(id) as ClientRow | undefined
}

export function listClients(db: Database.Database, params: ListClientsParams): Client[] {
  const status: ClientListStatus = params.status ?? 'active'
  const search = params.search?.trim()

  const conditions: string[] = []
  const values: unknown[] = []

  if (status !== 'all') {
    conditions.push('status = ?')
    values.push(status)
  }

  if (search) {
    const pattern = `%${search.toLowerCase()}%`
    const phonePattern = `%${search}%`
    conditions.push('(LOWER(name) LIKE ? OR IFNULL(phone, ?) LIKE ?)')
    values.push(pattern, '', phonePattern)
  }

  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : ''
  const sql = `SELECT * FROM clients ${where} ORDER BY LOWER(name) ASC`
  const rows = db.prepare(sql).all(...values) as ClientRow[]
  return rows.map((row) => mapRow(db, row))
}

export function getClient(db: Database.Database, id: string): Client | null {
  const row = getRow(db, id)
  return row ? mapRow(db, row) : null
}

/** Issued unpaid/partial invoices with lines and active payments, oldest first. */
export function getClientLedgerData(db: Database.Database, clientId: string): ClientLedgerData {
  const row = getRow(db, clientId)
  if (!row) throw new Error('Client not found')

  const invoices = db
    .prepare(
      `SELECT id, number, invoice_date, total
       FROM invoices
       WHERE client_id = ? AND status = 'issued' AND number IS NOT NULL
       ORDER BY invoice_date ASC, number ASC, id ASC`
    )
    .all(clientId) as LedgerInvoiceRow[]

  const lineStmt = db.prepare(
    `SELECT name, image_path, unit_name, quantity, rate, total
     FROM invoice_lines
     WHERE invoice_id = ?
     ORDER BY position ASC, id ASC`
  )

  const result: ClientLedgerInvoice[] = []
  for (const invoice of invoices) {
    const paid = sumActivePaymentsForInvoice(db, invoice.id)
    const money = invoicePaidAndDue('issued', invoice.total, paid)
    if (money.paymentStatus === 'paid') continue

    const lines = (lineStmt.all(invoice.id) as LedgerLineRow[]).map((line) => ({
      name: line.name,
      image_path: line.image_path,
      unit_name: line.unit_name,
      quantity: line.quantity,
      rate: line.rate,
      total: line.total
    }))

    const payments = listPaymentsForInvoice(db, invoice.id)
      .filter((payment) => payment.status === 'active')
      .slice()
      .sort((a, b) => {
        if (a.payment_date !== b.payment_date) return a.payment_date.localeCompare(b.payment_date)
        if (a.created_at !== b.created_at) return a.created_at.localeCompare(b.created_at)
        return a.id.localeCompare(b.id)
      })
      .map((payment) => ({
        payment_date: payment.payment_date,
        method: payment.method,
        note: payment.note,
        amount: payment.amount
      }))

    result.push({
      id: invoice.id,
      number: invoice.number,
      invoice_date: invoice.invoice_date,
      total: invoice.total,
      paid: money.paid,
      due: money.due,
      lines,
      payments
    })
  }

  return {
    client: { id: row.id, name: row.name, phone: row.phone },
    invoices: result
  }
}

export function createClient(
  db: Database.Database,
  input: { name: string; phone: string | null }
): Client {
  const id = randomUUID()
  const now = new Date().toISOString()
  db.prepare(
    `INSERT INTO clients (id, name, phone, status, created_at, updated_at)
     VALUES (?, ?, ?, 'active', ?, ?)`
  ).run(id, input.name, input.phone, now, now)
  return getClient(db, id)!
}

export function updateClient(
  db: Database.Database,
  id: string,
  input: { name: string; phone: string | null }
): Client {
  const existing = getRow(db, id)
  if (!existing) {
    throw new Error('Client not found')
  }
  const now = new Date().toISOString()
  db.prepare(`UPDATE clients SET name = ?, phone = ?, updated_at = ? WHERE id = ?`).run(
    input.name,
    input.phone,
    now,
    id
  )
  return getClient(db, id)!
}

export function setClientStatus(
  db: Database.Database,
  id: string,
  status: 'active' | 'inactive'
): Client {
  const existing = getRow(db, id)
  if (!existing) {
    throw new Error('Client not found')
  }
  const now = new Date().toISOString()
  db.prepare(`UPDATE clients SET status = ?, updated_at = ? WHERE id = ?`).run(status, now, id)
  return getClient(db, id)!
}
