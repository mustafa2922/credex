import { randomUUID } from 'crypto'
import type Database from 'better-sqlite3'
import type { ListUnitsParams, Unit, UnitListStatus } from '../../../shared/units'

const UNIT_EXISTS = 'Unit already exists'

type UnitRow = {
  id: string
  name: string
  status: 'active' | 'inactive'
  created_at: string
  updated_at: string
}

function mapRow(row: UnitRow): Unit {
  return {
    id: row.id,
    name: row.name,
    status: row.status,
    created_at: row.created_at,
    updated_at: row.updated_at
  }
}

function getRow(db: Database.Database, id: string): UnitRow | undefined {
  return db.prepare('SELECT * FROM units WHERE id = ?').get(id) as UnitRow | undefined
}

function isUniqueNameConstraint(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false
  const code = 'code' in error ? (error as { code: unknown }).code : undefined
  const message = error instanceof Error ? error.message : ''
  if (code === 'SQLITE_CONSTRAINT_UNIQUE') return true
  return code === 'SQLITE_CONSTRAINT' && message.includes('units.name')
}

function assertNameAvailable(db: Database.Database, name: string, excludeId?: string): void {
  const sql = excludeId
    ? 'SELECT 1 FROM units WHERE name = ? COLLATE NOCASE AND id != ?'
    : 'SELECT 1 FROM units WHERE name = ? COLLATE NOCASE'
  const row = excludeId ? db.prepare(sql).get(name, excludeId) : db.prepare(sql).get(name)
  if (row) {
    throw new Error(UNIT_EXISTS)
  }
}

function runWrite(fn: () => void): void {
  try {
    fn()
  } catch (error) {
    if (isUniqueNameConstraint(error)) {
      throw new Error(UNIT_EXISTS, { cause: error })
    }
    throw error
  }
}

export function listUnits(db: Database.Database, params: ListUnitsParams): Unit[] {
  const status: UnitListStatus = params.status ?? 'active'
  const search = params.search?.trim()

  const conditions: string[] = []
  const values: unknown[] = []

  if (status !== 'all') {
    conditions.push('status = ?')
    values.push(status)
  }

  if (search) {
    conditions.push('LOWER(name) LIKE ?')
    values.push(`%${search.toLowerCase()}%`)
  }

  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : ''
  const sql = `SELECT * FROM units ${where} ORDER BY LOWER(name) ASC`
  const rows = db.prepare(sql).all(...values) as UnitRow[]
  return rows.map(mapRow)
}

function getUnit(db: Database.Database, id: string): Unit | null {
  const row = getRow(db, id)
  return row ? mapRow(row) : null
}

export function createUnit(db: Database.Database, input: { name: string }): Unit {
  assertNameAvailable(db, input.name)
  const id = randomUUID()
  const now = new Date().toISOString()
  runWrite(() => {
    db.prepare(
      `INSERT INTO units (id, name, status, created_at, updated_at)
       VALUES (?, ?, 'active', ?, ?)`
    ).run(id, input.name, now, now)
  })
  return getUnit(db, id)!
}

export function updateUnit(db: Database.Database, id: string, input: { name: string }): Unit {
  const existing = getRow(db, id)
  if (!existing) {
    throw new Error('Unit not found')
  }
  assertNameAvailable(db, input.name, id)
  const now = new Date().toISOString()
  runWrite(() => {
    db.prepare('UPDATE units SET name = ?, updated_at = ? WHERE id = ?').run(input.name, now, id)
  })
  return getUnit(db, id)!
}

export function setUnitStatus(
  db: Database.Database,
  id: string,
  status: 'active' | 'inactive'
): Unit {
  const existing = getRow(db, id)
  if (!existing) {
    throw new Error('Unit not found')
  }
  const now = new Date().toISOString()
  db.prepare('UPDATE units SET status = ?, updated_at = ? WHERE id = ?').run(status, now, id)
  return getUnit(db, id)!
}
