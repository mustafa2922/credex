import { app, BrowserWindow, clipboard, ipcMain } from 'electron'
import type Database from 'better-sqlite3'
import { ZodError, z } from 'zod'
import type { SettingsSnapshot } from '../../../shared/settings'
import {
  adoptDataDirAtStartup,
  changeBackupDir,
  changeDataDir,
  changeExportsDir,
  copyDiagnostics,
  getSettingsSnapshot,
  inspectDataDirTarget,
  openConfigFile,
  openPath,
  pickDirectory,
  showInFolder
} from './service'
import { initializePaths, getStartupFailure } from '../../paths'
import { logger } from '../../logger'

function parentWindow(event: Electron.IpcMainInvokeEvent): BrowserWindow | null {
  return BrowserWindow.fromWebContents(event.sender)
}

function formatZodError(error: ZodError): string {
  return error.issues.map((issue) => issue.message).join(' ')
}

const changeDataDirSchema = z.object({
  targetPath: z.string().trim().min(1),
  mode: z.enum(['copy', 'use_existing']),
  confirmSyncFolder: z.boolean().optional()
})

const changeFolderSchema = z.object({
  path: z.string().trim().min(1),
  confirmSameDrive: z.boolean().optional()
})

export function registerSettingsIpc(db: Database.Database): void {
  ipcMain.handle('settings:get', (): SettingsSnapshot => getSettingsSnapshot(db))

  ipcMain.handle('settings:copyDiagnostics', (): string => {
    const text = copyDiagnostics(db)
    clipboard.writeText(text)
    return text
  })

  ipcMain.handle('settings:pickDirectory', async (event, title?: unknown) => {
    return pickDirectory(parentWindow(event), typeof title === 'string' ? title : 'Choose folder')
  })

  ipcMain.handle('settings:inspectDataDir', (_event, raw: unknown) => {
    const path = z.string().trim().min(1).parse(raw)
    return inspectDataDirTarget(path)
  })

  ipcMain.handle('settings:changeDataDir', async (_event, raw: unknown) => {
    try {
      const input = changeDataDirSchema.parse(raw ?? {})
      return await changeDataDir(db, input)
    } catch (error) {
      if (error instanceof ZodError) throw new Error(formatZodError(error), { cause: error })
      throw error
    }
  })

  ipcMain.handle('settings:changeExportsDir', (_event, raw: unknown) => {
    try {
      changeExportsDir(changeFolderSchema.parse(raw ?? {}))
      return getSettingsSnapshot(db)
    } catch (error) {
      if (error instanceof ZodError) throw new Error(formatZodError(error), { cause: error })
      throw error
    }
  })

  ipcMain.handle('settings:changeBackupDir', (_event, raw: unknown) => {
    try {
      changeBackupDir(changeFolderSchema.parse(raw ?? {}))
      return getSettingsSnapshot(db)
    } catch (error) {
      if (error instanceof ZodError) throw new Error(formatZodError(error), { cause: error })
      throw error
    }
  })

  ipcMain.handle('settings:openPath', async (_event, raw: unknown) => {
    const path = z.string().trim().min(1).parse(raw)
    await openPath(path)
  })

  ipcMain.handle('settings:showInFolder', (_event, raw: unknown) => {
    const path = z.string().trim().min(1).parse(raw)
    showInFolder(path)
  })

  ipcMain.handle('settings:openConfig', () => {
    openConfigFile()
  })

  ipcMain.handle('settings:openLogs', async () => {
    await openPath(getSettingsSnapshot(db).logsPath)
  })
}

let startupOkPayload: { ok: true } | null = null

export function setStartupOk(): void {
  startupOkPayload = { ok: true }
}

export function registerRecoveryIpc(): void {
  ipcMain.removeHandler('app:startup')
  ipcMain.handle('app:startup', () => {
    if (startupOkPayload) return startupOkPayload
    const failure = getStartupFailure()
    if (failure) return failure
    return { ok: true as const }
  })

  ipcMain.handle('app:retryStartup', () => {
    const state = initializePaths()
    if (state.ok) {
      setStartupOk()
      app.relaunch()
      app.exit(0)
    }
    return state
  })

  ipcMain.handle('app:chooseDataDir', async (event) => {
    const picked = await pickDirectory(parentWindow(event), 'Choose data folder with ledger.db')
    if (!picked) return getStartupFailure()
    try {
      adoptDataDirAtStartup(picked)
      logger.info(`Adopted dataDir ${picked} during recovery`)
      app.relaunch()
      app.exit(0)
      return { ok: true as const }
    } catch (error) {
      return {
        ok: false as const,
        path: picked,
        reason: error instanceof Error ? error.message : 'Could not use that folder'
      }
    }
  })

  ipcMain.handle('app:quit', () => {
    app.quit()
  })
}
