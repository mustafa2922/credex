import { app, dialog, shell, type BrowserWindow } from 'electron'
import Database from 'better-sqlite3'
import {
  existsSync,
  mkdirSync,
  readdirSync,
  rmSync,
  statSync
} from 'fs'
import { join, resolve } from 'path'
import {
  isSyncFolderPath,
  isUncPath,
  pathsOverlap,
  sameDrive
} from '../../../core/folders'
import type {
  ChangeDataDirInput,
  ChangeFolderInput,
  SettingsSnapshot
} from '../../../shared/settings'
import { latestMigrationVersion, schemaVersion } from '../../db'
import { logger } from '../../logger'
import {
  backupDir,
  configFile,
  copyDirectoryRecursive,
  dataDir,
  dbFile,
  defaultExportsDir,
  directorySizeBytes,
  exportsDir,
  folderStatus,
  freeDiskBytes,
  getConfig,
  integrityOk,
  logsDir,
  prepareDataTree,
  probeWritableDirectory,
  saveConfig
} from '../../paths'

type CountRow = { c: number }

function countTable(db: Database.Database, table: string): number {
  const row = db.prepare(`SELECT COUNT(*) AS c FROM ${table}`).get() as CountRow
  return row.c
}

function readSchemaVersion(dbPath: string): number {
  const db = new Database(dbPath, { readonly: true, fileMustExist: true })
  try {
    return schemaVersion(db)
  } finally {
    db.close()
  }
}

function assertLocalDataPath(targetPath: string): string {
  const resolved = resolve(targetPath.trim())
  if (isUncPath(resolved)) throw new Error('Network (UNC) paths are not allowed for the data folder')
  return resolved
}

export function getSettingsSnapshot(db: Database.Database): SettingsSnapshot {
  const dataPath = dataDir()
  const exportsPath = exportsDir()
  const backupsPath = backupDir()
  const databasePath = dbFile()
  let dbSize: number | null = null
  try {
    dbSize = existsSync(databasePath) ? statSync(databasePath).size : null
  } catch {
    dbSize = null
  }

  const backupWarning =
    backupsPath && sameDrive(dataPath, backupsPath)
      ? 'Backup folder is on the same drive as data. This does not protect against disk failure.'
      : null

  return {
    version: app.getVersion(),
    schema: schemaVersion(db),
    dbPath: databasePath,
    dbSizeBytes: dbSize,
    configPath: configFile(),
    logsPath: logsDir(),
    folders: {
      data: {
        path: dataPath,
        status: folderStatus(dataPath),
        freeBytes: freeDiskBytes(dataPath),
        sizeBytes: directorySizeBytes(dataPath),
        warning: isSyncFolderPath(dataPath)
          ? 'Data folder looks like a cloud sync location.'
          : null
      },
      exports: {
        path: exportsPath,
        status: folderStatus(exportsPath),
        freeBytes: freeDiskBytes(exportsPath)
      },
      backups: {
        path: backupsPath,
        status: folderStatus(backupsPath),
        freeBytes: backupsPath ? freeDiskBytes(backupsPath) : null,
        warning: backupWarning
      }
    },
    osVersion: `${process.platform} ${process.getSystemVersion?.() ?? ''}`.trim()
  }
}

export function copyDiagnostics(db: Database.Database): string {
  const snap = getSettingsSnapshot(db)
  const lines = [
    `version: ${snap.version}`,
    `schema: ${snap.schema}`,
    `dataDir: ${snap.folders.data.path}`,
    `exportsDir: ${snap.folders.exports.path}`,
    `backupDir: ${snap.folders.backups.path ?? '(not set)'}`,
    `dbPath: ${snap.dbPath}`,
    `configPath: ${snap.configPath}`,
    `os: ${snap.osVersion}`,
    '',
    '--- last log lines ---',
    logger.readTail(50)
  ]
  return lines.join('\n')
}

export async function pickDirectory(
  parent?: BrowserWindow | null,
  title = 'Choose folder'
): Promise<string | null> {
  const result = parent
    ? await dialog.showOpenDialog(parent, {
        title,
        properties: ['openDirectory', 'createDirectory']
      })
    : await dialog.showOpenDialog({
        title,
        properties: ['openDirectory', 'createDirectory']
      })
  if (result.canceled || result.filePaths.length === 0) return null
  return result.filePaths[0]
}

export function inspectDataDirTarget(targetPath: string): {
  path: string
  empty: boolean
  hasLedger: boolean
  schemaVersion: number | null
  syncFolder: boolean
  overlapsCurrent: boolean
} {
  const resolved = assertLocalDataPath(targetPath)
  const current = dataDir()
  if (pathsOverlap(resolved, current)) {
    throw new Error('Choose a folder that is not inside the current data folder (and does not contain it)')
  }
  const ledger = join(resolved, 'ledger.db')
  const hasLedger = existsSync(ledger)
  let empty = true
  if (existsSync(resolved)) {
    try {
      empty = readdirSync(resolved).length === 0
    } catch {
      empty = false
    }
  }
  return {
    path: resolved,
    empty: !existsSync(resolved) || empty,
    hasLedger,
    schemaVersion: hasLedger ? readSchemaVersion(ledger) : null,
    syncFolder: isSyncFolderPath(resolved),
    overlapsCurrent: false
  }
}

export async function changeDataDir(
  liveDb: Database.Database,
  input: ChangeDataDirInput
): Promise<{ relaunch: true }> {
  const inspection = inspectDataDirTarget(input.targetPath)
  if (inspection.syncFolder && !input.confirmSyncFolder) {
    throw new Error('SYNC_FOLDER_CONFIRM')
  }

  if (input.mode === 'use_existing') {
    if (!inspection.hasLedger) throw new Error('Selected folder does not contain ledger.db')
    const schema = inspection.schemaVersion ?? 0
    if (schema > latestMigrationVersion()) {
      throw new Error('Selected database is newer than this app version')
    }
    const config = getConfig()
    saveConfig({ ...config, dataDir: inspection.path })
    logger.info(`Switched dataDir to existing folder ${inspection.path}`)
    app.relaunch()
    app.exit(0)
    return { relaunch: true }
  }

  // Copy flow: target must be empty or non-existent.
  if (existsSync(inspection.path) && !inspection.empty) {
    throw new Error('Target folder must be empty (or choose Use existing data folder)')
  }

  const source = dataDir()
  const target = inspection.path
  prepareDataTree(target)

  const sourceCounts = {
    clients: countTable(liveDb, 'clients'),
    units: countTable(liveDb, 'units'),
    invoices: countTable(liveDb, 'invoices'),
    payments: countTable(liveDb, 'payments')
  }

  try {
    liveDb.pragma('wal_checkpoint(TRUNCATE)')
    liveDb.close()
  } catch (error) {
    logger.error(`Failed to checkpoint/close DB before copy: ${String(error)}`)
    throw new Error('Could not close the database for copying')
  }

  try {
    copyDirectoryRecursive(source, target)
    const targetDb = join(target, 'ledger.db')
    if (!integrityOk(targetDb)) throw new Error('Copied database failed integrity_check')
    const verify = new Database(targetDb, { readonly: true, fileMustExist: true })
    try {
      const targetCounts = {
        clients: countTable(verify, 'clients'),
        units: countTable(verify, 'units'),
        invoices: countTable(verify, 'invoices'),
        payments: countTable(verify, 'payments')
      }
      for (const key of Object.keys(sourceCounts) as Array<keyof typeof sourceCounts>) {
        if (sourceCounts[key] !== targetCounts[key]) {
          throw new Error(`Row count mismatch for ${key}`)
        }
      }
    } finally {
      verify.close()
    }

    const config = getConfig()
    saveConfig({ ...config, dataDir: target })
    logger.info(`Copied dataDir from ${source} to ${target}`)
    app.relaunch()
    app.exit(0)
    return { relaunch: true }
  } catch (error) {
    try {
      rmSync(target, { recursive: true, force: true })
    } catch {
      // Keep going; old config is unchanged.
    }
    logger.error(`Data folder copy failed: ${String(error)}`)
    const message = `${error instanceof Error ? error.message : 'Copy failed'}. Kept the previous data folder (not deleted). Restarting on the previous location.`
    dialog.showErrorBox('Could not move data folder', message)
    app.relaunch()
    app.exit(1)
    return { relaunch: true }
  }
}

export function changeExportsDir(input: ChangeFolderInput): void {
  const resolved = resolve(input.path.trim())
  if (!probeWritableDirectory(resolved)) {
    throw new Error('Exports folder is not writable')
  }
  const config = getConfig()
  saveConfig({ ...config, exportsDir: resolved })
  logger.info(`exportsDir set to ${resolved}`)
}

export function changeBackupDir(input: ChangeFolderInput): void {
  const resolved = resolve(input.path.trim())
  if (pathsOverlap(resolved, dataDir())) {
    throw new Error('Backup folder must not be inside the data folder')
  }
  if (!probeWritableDirectory(resolved)) {
    throw new Error('Backup folder is not writable')
  }
  if (sameDrive(resolved, dataDir()) && !input.confirmSameDrive) {
    throw new Error('SAME_DRIVE_CONFIRM')
  }
  const config = getConfig()
  saveConfig({ ...config, backupDir: resolved })
  logger.info(`backupDir set to ${resolved}`)
}

export function clearBackupDir(): void {
  const config = getConfig()
  saveConfig({ ...config, backupDir: null })
}

export async function openPath(target: string): Promise<void> {
  if (!target) throw new Error('Path is required')
  await shell.openPath(target)
}

export function showInFolder(target: string): void {
  shell.showItemInFolder(target)
}

export function openConfigFile(): void {
  shell.showItemInFolder(configFile())
}

/** Validate a chosen existing data folder during startup recovery. */
export function adoptDataDirAtStartup(targetPath: string): void {
  const resolved = assertLocalDataPath(targetPath)
  const ledger = join(resolved, 'ledger.db')
  if (!existsSync(ledger)) throw new Error('Selected folder does not contain ledger.db')
  const schema = readSchemaVersion(ledger)
  if (schema > latestMigrationVersion()) {
    throw new Error('Selected database is newer than this app version')
  }
  if (!integrityOk(ledger)) throw new Error('Selected database failed integrity_check')
  mkdirSync(join(resolved, 'files'), { recursive: true })
  mkdirSync(join(resolved, 'logs'), { recursive: true })
  mkdirSync(join(resolved, 'premigration'), { recursive: true })
  let exportsDirValue = defaultExportsDir()
  try {
    exportsDirValue = getConfig().exportsDir
  } catch {
    // Paths were not resolved yet during recovery.
  }
  mkdirSync(exportsDirValue, { recursive: true })
  saveConfig({
    dataDir: resolved,
    exportsDir: exportsDirValue,
    backupDir: null
  })
}
