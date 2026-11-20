export type FolderStatus = 'ok' | 'missing' | 'not_writable' | 'not_set'

export type AppConfig = {
  dataDir: string
  exportsDir: string
  backupDir: string
}

export type FolderInfo = {
  path: string | null
  status: FolderStatus
  freeBytes: number | null
  sizeBytes?: number | null
  warning?: string | null
}

export type SettingsSnapshot = {
  version: string
  schema: number
  dbPath: string
  dbSizeBytes: number | null
  configPath: string
  logsPath: string
  folders: {
    data: FolderInfo
    exports: FolderInfo
    backups: FolderInfo
  }
  osVersion: string
}

export type StartupState = { ok: true } | { ok: false; path: string; reason: string }

export type ChangeDataDirMode = 'copy' | 'use_existing'

export type ChangeDataDirInput = {
  targetPath: string
  mode: ChangeDataDirMode
  confirmSyncFolder?: boolean
}

export type ChangeFolderInput = {
  path: string
  confirmSameDrive?: boolean
}

export type RunBackupResult = {
  path: string
  folderName: string
}

export type ExportInvoicePdfResult = { saved: true; filename: string; filePath: string }
