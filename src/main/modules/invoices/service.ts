import { randomUUID } from 'crypto'
import type Database from 'better-sqlite3'
import { invoiceTotalPaisa, lineTotalPaisa } from '../../../core/money'
import {
  INVOICE_IMAGE_NAME,
  type InvoiceDetail,
  type InvoiceLine,
  type InvoiceStatus,
  type InvoiceSummary,
  type ListInvoicesParams,
  type SaveInvoiceInput
} from '../../../shared/invoices'
import { deleteStoredImage, storedImageExists } from '../../files/images'

type InvoiceRow = {
  id: string
  number: string | null
  client_id: string
  client_name: string
  client_phone: string | null
  invoice_date: string
  status: string
  total: number
  void_reason: string | null
  issued_at: string | null
  created_at: string
  updated_at: string
}

type LineRow = {
  id: string
  position: number
  name: string
  image_path: string | null
  unit_id: string
  unit_name: string
  quantity: number
  rate: number
  total: number
}

type ClientRow = {
  id: string
  status: 'active' | 'inactive'
}

type UnitRow = {
  id: string
  name: string
  status: 'active' | 'inactive'
}

function asStatus(value: string): InvoiceStatus {
  if (value === 'draft' || value === 'issued' || value === 'void') return value
  throw new Error('Invoice status is invalid')
}

function mapLine(row: LineRow): InvoiceLine {
  return {
    id: row.id,
    position: row.position,
    name: row.name,
    image_path: row.image_path,
    unit_id: row.unit_id,
    unit_name: row.unit_name,
    quantity: row.quantity,
    rate: row.rate,
    total: row.total
  }
}

function mapSummary(row: InvoiceRow): InvoiceSummary {
  return {
    id: row.id,
    number: row.number,
    client_id: row.client_id,
    client_name: row.client_name,
    invoice_date: row.invoice_date,
    status: asStatus(row.status),
    total: row.total,
    created_at: row.created_at,
    updated_at: row.updated_at
  }
}

function mapDetail(row: InvoiceRow, lines: LineRow[]): InvoiceDetail {
  return {
    ...mapSummary(row),
    client_phone: row.client_phone,
    void_reason: row.void_reason,
    issued_at: row.issued_at,
    lines: lines.map(mapLine)
  }
}

const detailSql = `SELECT i.id, i.number, i.client_id, c.name AS client_name, c.phone AS client_phone,
  i.invoice_date, i.status, i.total, i.void_reason, i.issued_at, i.created_at, i.updated_at
  FROM invoices i
  JOIN clients c ON c.id = i.client_id`

function getInvoiceRow(db: Database.Database, id: string): InvoiceRow | undefined {
  return db.prepare(`${detailSql} WHERE i.id = ?`).get(id) as InvoiceRow | undefined
}

function listLineRows(db: Database.Database, invoiceId: string): LineRow[] {
  return db
    .prepare(
      `SELECT id, position, name, image_path, unit_id, unit_name, quantity, rate, total
       FROM invoice_lines
       WHERE invoice_id = ?
       ORDER BY position ASC, id ASC`
    )
    .all(invoiceId) as LineRow[]
}

export function getInvoice(db: Database.Database, id: string): InvoiceDetail | null {
  const row = getInvoiceRow(db, id)
  if (!row) return null
  return mapDetail(row, listLineRows(db, id))
}

export function listInvoices(db: Database.Database, params: ListInvoicesParams): InvoiceSummary[] {
  const conditions: string[] = []
  const values: unknown[] = []

  if (params.status && params.status !== 'all') {
    conditions.push('i.status = ?')
    values.push(params.status)
  }

  if (params.client_id) {
    conditions.push('i.client_id = ?')
    values.push(params.client_id)
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
      `SELECT i.id, i.number, i.client_id, c.name AS client_name, NULL AS client_phone,
         i.invoice_date, i.status, i.total, NULL AS void_reason, NULL AS issued_at,
         i.created_at, i.updated_at
       FROM invoices i
       JOIN clients c ON c.id = i.client_id
       ${where}
       ORDER BY i.created_at DESC, i.id DESC`
    )
    .all(...values) as InvoiceRow[]
  return rows.map(mapSummary)
}

function imagesToRemove(
  previous: string[],
  next: Array<string | null>,
  requested: string[]
): string[] {
  const keep = new Set(next.filter((path): path is string => path !== null))
  const remove = new Set<string>()
  for (const path of previous) {
    if (!keep.has(path)) remove.add(path)
  }
  for (const path of requested) {
    if (!keep.has(path) && INVOICE_IMAGE_NAME.test(path)) remove.add(path)
  }
  return [...remove]
}

function deleteUnusedImages(db: Database.Database, filenames: readonly string[]): void {
  const used = db.prepare('SELECT 1 FROM invoice_lines WHERE image_path = ?')
  for (const filename of filenames) {
    if (!INVOICE_IMAGE_NAME.test(filename)) continue
    if (used.get(filename)) continue
    try {
      deleteStoredImage(filename)
    } catch (error) {
      console.error('Failed to delete image', filename, error)
    }
  }
}

export function saveInvoice(db: Database.Database, input: SaveInvoiceInput): InvoiceDetail {
  let removed: string[] = []

  const run = db.transaction(() => {
    const existing = input.id ? getInvoiceRow(db, input.id) : undefined
    if (input.id && !existing) throw new Error('Invoice not found')
    if (existing && existing.status !== 'draft') throw new Error('Only drafts can be saved')

    const client = db
      .prepare('SELECT id, status FROM clients WHERE id = ?')
      .get(input.client_id) as ClientRow | undefined
    if (!client) throw new Error('Client not found')
    const sameClient = existing?.client_id === input.client_id
    if (client.status !== 'active' && !sameClient) throw new Error('Client is inactive')

    const existingLines = existing ? listLineRows(db, existing.id) : []
    const existingById = new Map(existingLines.map((line) => [line.id, line]))
    const seen = new Set<string>()

    const prepared = input.lines.map((line, index) => {
      if (line.id) {
        if (seen.has(line.id)) throw new Error('Duplicate line')
        seen.add(line.id)
      }
      const name = line.name.trim()
      if (!name) throw new Error('Name is required')
      if (name.length > 100) throw new Error('Name must be at most 100 characters')
      if (!Number.isInteger(line.quantity) || line.quantity <= 0) {
        throw new Error('Quantity must be greater than zero')
      }
      if (!Number.isInteger(line.rate) || line.rate < 0) {
        throw new Error('Rate must be zero or greater')
      }

      const previous = line.id ? existingById.get(line.id) : undefined
      const unit = db
        .prepare('SELECT id, name, status FROM units WHERE id = ?')
        .get(line.unit_id) as UnitRow | undefined
      if (!unit) throw new Error('Unit not found')
      const sameUnit = previous?.unit_id === line.unit_id
      if (unit.status !== 'active' && !sameUnit) throw new Error('Unit is inactive')

      if (line.image_path && !storedImageExists(line.image_path)) {
        throw new Error('Image file is missing')
      }

      return {
        id: previous ? previous.id : randomUUID(),
        position: index,
        name,
        image_path: line.image_path,
        unit_id: unit.id,
        unit_name: unit.name,
        quantity: line.quantity,
        rate: line.rate,
        total: lineTotalPaisa(line.rate, line.quantity)
      }
    })

    const total = invoiceTotalPaisa(prepared.map((line) => line.total))
    const now = new Date().toISOString()
    const id = existing?.id ?? randomUUID()

    if (existing) {
      const updated = db
        .prepare(
          `UPDATE invoices
           SET client_id = ?, invoice_date = ?, total = ?, updated_at = ?
           WHERE id = ? AND status = 'draft'`
        )
        .run(input.client_id, input.invoice_date, total, now, id)
      if (updated.changes !== 1) throw new Error('Only drafts can be saved')
      db.prepare('DELETE FROM invoice_lines WHERE invoice_id = ?').run(id)
    } else {
      db.prepare(
        `INSERT INTO invoices (
           id, number, client_id, invoice_date, status, total, void_reason, issued_at, created_at, updated_at
         ) VALUES (?, NULL, ?, ?, 'draft', ?, NULL, NULL, ?, ?)`
      ).run(id, input.client_id, input.invoice_date, total, now, now)
    }

    const insertLine = db.prepare(
      `INSERT INTO invoice_lines (
         id, invoice_id, position, name, image_path, unit_id, unit_name, quantity, rate, total
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    for (const line of prepared) {
      insertLine.run(
        line.id,
        id,
        line.position,
        line.name,
        line.image_path,
        line.unit_id,
        line.unit_name,
        line.quantity,
        line.rate,
        line.total
      )
    }

    removed = imagesToRemove(
      existingLines.flatMap((line) => (line.image_path ? [line.image_path] : [])),
      prepared.map((line) => line.image_path),
      input.removed_images ?? []
    )
    return id
  })

  const id = run()
  const invoice = getInvoice(db, id)
  if (!invoice) throw new Error('Invoice not found')
  deleteUnusedImages(db, removed)
  return invoice
}

function nextInvoiceNumber(db: Database.Database): string {
  const row = db.prepare(`SELECT value FROM app_meta WHERE key = 'invoice_counter'`).get() as
    { value: string } | undefined
  if (!row || !/^\d+$/.test(row.value)) throw new Error('Invoice counter is invalid')
  const current = Number(row.value)
  if (!Number.isSafeInteger(current)) throw new Error('Invoice counter is invalid')
  const next = current + 1
  db.prepare(`UPDATE app_meta SET value = ? WHERE key = 'invoice_counter'`).run(String(next))
  return `BS-${String(next).padStart(4, '0')}`
}

export function issueInvoice(db: Database.Database, id: string): InvoiceDetail {
  const run = db.transaction(() => {
    const invoice = getInvoiceRow(db, id)
    if (!invoice) throw new Error('Invoice not found')
    if (invoice.status !== 'draft') throw new Error('Only drafts can be issued')

    const lines = listLineRows(db, id)
    if (lines.length < 1) throw new Error('Add at least one line before issuing')
    const total = invoiceTotalPaisa(lines.map((line) => line.total))
    if (total <= 0) throw new Error('Invoice total must be greater than zero')

    // A reopened draft already has a number. Keep it so the sequence stays gapless.
    const number = invoice.number ?? nextInvoiceNumber(db)
    const now = new Date().toISOString()
    const updated = db
      .prepare(
        `UPDATE invoices
         SET number = ?, status = 'issued', total = ?, issued_at = ?, updated_at = ?
         WHERE id = ? AND status = 'draft'`
      )
      .run(number, total, now, now, id)
    if (updated.changes !== 1) throw new Error('Only drafts can be issued')
  })
  run()
  const invoice = getInvoice(db, id)
  if (!invoice) throw new Error('Invoice not found')
  return invoice
}

export function reopenInvoice(db: Database.Database, id: string): InvoiceDetail {
  const invoice = getInvoiceRow(db, id)
  if (!invoice) throw new Error('Invoice not found')
  if (invoice.status !== 'issued') throw new Error('Only issued invoices can be reopened')
  const now = new Date().toISOString()
  const updated = db
    .prepare(
      `UPDATE invoices
       SET status = 'draft', issued_at = NULL, updated_at = ?
       WHERE id = ? AND status = 'issued'`
    )
    .run(now, id)
  if (updated.changes !== 1) throw new Error('Only issued invoices can be reopened')
  const next = getInvoice(db, id)
  if (!next) throw new Error('Invoice not found')
  return next
}

export function voidInvoice(db: Database.Database, id: string, reason: string): InvoiceDetail {
  const trimmed = reason.trim()
  if (!trimmed || trimmed.length > 200) throw new Error('A reason is required')
  const invoice = getInvoiceRow(db, id)
  if (!invoice) throw new Error('Invoice not found')
  if (invoice.status !== 'issued') throw new Error('Only issued invoices can be voided')
  const now = new Date().toISOString()
  const updated = db
    .prepare(
      `UPDATE invoices
       SET status = 'void', void_reason = ?, updated_at = ?
       WHERE id = ? AND status = 'issued'`
    )
    .run(trimmed, now, id)
  if (updated.changes !== 1) throw new Error('Only issued invoices can be voided')
  const next = getInvoice(db, id)
  if (!next) throw new Error('Invoice not found')
  return next
}

export function deleteDraftInvoice(db: Database.Database, id: string): void {
  const invoice = getInvoiceRow(db, id)
  if (!invoice) throw new Error('Invoice not found')
  if (invoice.status !== 'draft' || invoice.number !== null) {
    throw new Error('Only an unissued draft can be deleted')
  }
  const images = listLineRows(db, id).flatMap((line) => (line.image_path ? [line.image_path] : []))
  const run = db.transaction(() => {
    const result = db
      .prepare(`DELETE FROM invoices WHERE id = ? AND status = 'draft' AND number IS NULL`)
      .run(id)
    if (result.changes !== 1) throw new Error('Only an unissued draft can be deleted')
  })
  run()
  deleteUnusedImages(db, images)
}
