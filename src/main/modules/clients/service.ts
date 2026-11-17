import { randomUUID } from 'crypto'
import type Database from 'better-sqlite3'
import type { Client, ClientListStatus, ListClientsParams } from '../../../shared/clients'

type ClientRow = {
  id: string
  name: string
  phone: string | null
  status: 'active' | 'inactive'
  created_at: string
  updated_at: string
}

function mapRow(row: ClientRow): Client {
  return {
    id: row.id,
    name: row.name,
    phone: row.phone,
    status: row.status,
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
  return rows.map(mapRow)
}

export function getClient(db: Database.Database, id: string): Client | null {
  const row = getRow(db, id)
  return row ? mapRow(row) : null
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