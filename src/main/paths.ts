import {
  accessSync,
  constants,
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  renameSync,
  rmSync,
  statSync,
  writeFileSync
} from 'fs'
import { join, resolve } from 'path'
import { app } from 'electron'
import Database from 'better-sqlite3'
import { z } from 'zod'
import type { AppConfig, FolderStatus, StartupState } from '../shared/settings'

const configSchema = z.object({
  dataDir: z.string().trim().min(1),
  exportsDir: z.string().trim().min(1),
  backupDir: z.union([z.string().trim().min(1), z.null()]).default(null)
})

type ResolvedPaths = {
  config: AppConfig
}

let resolved: ResolvedPaths | null = null
let startupFailure: Extract<StartupState, { ok: false }> | null = null

export function configFile(): string {
  return join(app.getPath('userData'), 'config.json')
}

/** Default data folder: Electron userData (e.g. %APPDATA%\\credex). */
export function defaultDataDir(): string {
  return resolve(app.getPath('userData'))
}

/** Default exports folder: Downloads/credex. */
export function defaultExportsDir(): string {
  return resolve(join(app.getPath('downloads'), 'credex'))
}

function ensureDir(dir: string): void {
  mkdirSync(dir, { recursive: true })
}

function canCreateDir(dir: string): boolean {
  try {
    ensureDir(dir)
    accessSync(dir, constants.R_OK | constants.W_OK)
    const probe = join(dir, `.credex-write-${process.pid}`)
    writeFileSync(probe, 'ok')
    rmSync(probe, { force: true })
    return true
  } catch {
    return false
  }
}

function writeConfigAtomic(config: AppConfig): void {
  const parsed = configSchema.parse(config)
  const file = configFile()
  ensureDir(join(file, '..'))
  const temp = `${file}.${process.pid}.tmp`
  writeFileSync(temp, `${JSON.stringify(parsed, null, 2)}\n`, 'utf8')
  renameSync(temp, file)
}

function readConfigFile(): AppConfig | null {
  const file = configFile()
  if (!existsSync(file)) return null
  const raw = JSON.parse(readFileSync(file, 'utf8')) as unknown
  return configSchema.parse(raw)
}

function prepareDataTree(dataDir: string): void {
  ensureDir(dataDir)
  ensureDir(join(dataDir, 'files'))
  ensureDir(join(dataDir, 'logs'))
  ensureDir(join(dataDir, 'premigration'))
}

function copyDirectoryRecursive(source: string, target: string): void {
  ensureDir(target)
  for (const entry of readdirSync(source, { withFileTypes: true })) {
    const from = join(source, entry.name)
    const to = join(target, entry.name)
    if (entry.isDirectory()) copyDirectoryRecursive(from, to)
    else copyFileSync(from, to)
  }
}

function integrityOk(dbPath: string): boolean {
  const db = new Database(dbPath, { readonly: true, fileMustExist: true })
  try {
    const row = db.pragma('integrity_check') as Array<{ integrity_check: string }>
    return row[0]?.integrity_check === 'ok'
  } finally {
    db.close()
  }
}

function validateExistingDataDir(dataDir: string): string | null {
  const dbPath = join(dataDir, 'ledger.db')
  if (!existsSync(dataDir)) return 'Data folder is missing'
  try {
    accessSync(dataDir, constants.R_OK | constants.W_OK)
  } catch {
    return 'Data folder is not readable or writable'
  }
  if (!existsSync(dbPath)) return 'ledger.db is missing'
  try {
    accessSync(dbPath, constants.R_OK | constants.W_OK)
  } catch {
    return 'ledger.db is not readable or writable'
  }
  return null
}

/**
 * Load or create config.json before opening the DB.
 * Existing config is authoritative. First run writes absolute default paths once.
 * Returns a startup failure instead of creating an empty DB when configured data is missing.
 */
export function initializePaths(): StartupState {
  resolved = null
  startupFailure = null

  try {
    const existing = readConfigFile()
    if (existing) {
      const dataDir = resolve(existing.dataDir)
      const reason = validateExistingDataDir(dataDir)
      if (reason) {
        startupFailure = { ok: false, path: dataDir, reason }
        return startupFailure
      }
      ensureDir(join(dataDir, 'files'))
      ensureDir(join(dataDir, 'logs'))
      ensureDir(join(dataDir, 'premigration'))
      const exportsPath = resolve(existing.exportsDir)
      try {
        ensureDir(exportsPath)
      } catch {
        // Recreate exports silently when possible; export will report write failures later.
      }
      resolved = {
        config: {
          dataDir,
          exportsDir: exportsPath,
          backupDir: existing.backupDir ? resolve(existing.backupDir) : null
        }
      }
      return { ok: true }
    }

    // First run (no config): pin absolute defaults into config.json.
    const dataDir = defaultDataDir()
    const dbPath = join(dataDir, 'ledger.db')
    if (existsSync(dbPath)) {
      const reason = validateExistingDataDir(dataDir)
      if (reason) {
        startupFailure = { ok: false, path: dataDir, reason }
        return startupFailure
      }
      ensureDir(join(dataDir, 'files'))
      ensureDir(join(dataDir, 'logs'))
      ensureDir(join(dataDir, 'premigration'))
    } else {
      prepareDataTree(dataDir)
    }

    const exportsPath = defaultExportsDir()
    try {
      ensureDir(exportsPath)
    } catch {
      // Leave exports missing; export will show a clear error with Change folder.
    }

    const config: AppConfig = {
      dataDir: resolve(dataDir),
      exportsDir: resolve(exportsPath),
      backupDir: null
    }
    writeConfigAtomic(config)
    resolved = { config }
    return { ok: true }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Could not initialize folders'
    startupFailure = {
      ok: false,
      path: readConfigFile()?.dataDir ?? defaultDataDir(),
      reason: message
    }
    return startupFailure
  }
}

function requireResolved(): ResolvedPaths {
  if (!resolved) throw new Error('Paths are not initialized')
  return resolved
}

export function getStartupFailure(): Extract<StartupState, { ok: false }> | null {
  return startupFailure
}

export function getConfig(): AppConfig {
  return { ...requireResolved().config }
}

export function dataDir(): string {
  return requireResolved().config.dataDir
}

export function dbFile(): string {
  return join(dataDir(), 'ledger.db')
}

export function filesDir(): string {
  return join(dataDir(), 'files')
}

export function logsDir(): string {
  return join(dataDir(), 'logs')
}

export function premigrationDir(): string {
  return join(dataDir(), 'premigration')
}

export function exportsDir(): string {
  return requireResolved().config.exportsDir
}

export function backupDir(): string | null {
  return requireResolved().config.backupDir
}

export function saveConfig(config: AppConfig): void {
  const next: AppConfig = {
    dataDir: resolve(config.dataDir),
    exportsDir: resolve(config.exportsDir),
    backupDir: config.backupDir ? resolve(config.backupDir) : null
  }
  writeConfigAtomic(next)
  resolved = { config: next }
}

export function folderStatus(pathValue: string | null, options?: { allowMissing?: boolean }): FolderStatus {
  if (!pathValue) return 'not_set'
  if (!existsSync(pathValue)) return options?.allowMissing ? 'missing' : 'missing'
  try {
    accessSync(pathValue, constants.R_OK | constants.W_OK)
    return 'ok'
  } catch {
    return 'not_writable'
  }
}

export function directorySizeBytes(dir: string): number | null {
  if (!existsSync(dir)) return null
  let total = 0
  const walk = (current: string): void => {
    for (const entry of readdirSync(current, { withFileTypes: true })) {
      const full = join(current, entry.name)
      if (entry.isDirectory()) walk(full)
      else total += statSync(full).size
    }
  }
  try {
    walk(dir)
    return total
  } catch {
    return null
  }
}

export function freeDiskBytes(dir: string): number | null {
  try {
    // Available in modern Node/Electron builds.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const fs = require('fs') as typeof import('fs') & {
      statfsSync?: (path: string) => { bavail: number | bigint; bsize: number | bigint }
    }
    if (typeof fs.statfsSync !== 'function') return null
    const target = existsSync(dir) ? dir : join(dir, '..')
    const info = fs.statfsSync(target)
    return Number(info.bavail) * Number(info.bsize)
  } catch {
    return null
  }
}

export function probeWritableDirectory(dir: string): boolean {
  return canCreateDir(dir)
}

/** Recreate the exports folder when possible (startup). Does not throw. */
export function ensureExportsDir(): void {
  if (!resolved) return
  try {
    ensureDir(resolved.config.exportsDir)
  } catch {
    // Export will report a clear write failure later.
  }
}

/** Ensure exportsDir exists and is writable; throw a clear path + reason on failure. */
export function assertExportsDirWritable(): string {
  const dir = exportsDir()
  try {
    ensureDir(dir)
    accessSync(dir, constants.R_OK | constants.W_OK)
    const probe = join(dir, `.credex-write-${process.pid}`)
    writeFileSync(probe, 'ok')
    rmSync(probe, { force: true })
    return dir
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error)
    throw new Error(`Could not use exports folder:\n${dir}\n\n${reason}`)
  }
}

export { copyDirectoryRecursive, integrityOk, prepareDataTree, writeConfigAtomic }
