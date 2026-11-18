import Database from 'better-sqlite3'
import { copyFileSync, mkdirSync } from 'fs'
import { join } from 'path'
import { migrations } from './migrations'
import { dbFile, premigrationDir } from './paths'

export function openDb(): Database.Database {
  const file = dbFile()
  mkdirSync(join(file, '..'), { recursive: true })
  const db = new Database(file)
  db.pragma('journal_mode = WAL')
  db.pragma('foreign_keys = ON')
  migrate(db, file)
  return db
}

export function schemaVersion(db: Database.Database): number {
  const r = db.prepare('SELECT MAX(version) AS v FROM schema_version').get() as { v: number | null }
  return r.v ?? 0
}

export function latestMigrationVersion(): number {
  return migrations[migrations.length - 1].version
}

function migrate(db: Database.Database, file: string): void {
  db.exec('CREATE TABLE IF NOT EXISTS schema_version (version INTEGER NOT NULL)')
  const current = schemaVersion(db)
  const latest = latestMigrationVersion()
  if (current > latest) throw new Error('Database is newer than this app version')
  const pending = migrations.filter((m) => m.version > current)
  if (!pending.length) return
  if (current > 0) {
    db.pragma('wal_checkpoint(TRUNCATE)')
    mkdirSync(premigrationDir(), { recursive: true })
    copyFileSync(file, join(premigrationDir(), `ledger.pre-v${latest}.bak`))
  }
  db.transaction(() => {
    for (const m of pending) {
      db.exec(m.sql)
      db.prepare('INSERT INTO schema_version VALUES (?)').run(m.version)
    }
  })()
}
