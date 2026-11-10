import { autoUpdater } from 'electron-updater'
import { app, BrowserWindow, ipcMain } from 'electron'

export function setupUpdater(win: BrowserWindow): void {
  autoUpdater.autoDownload = true
  autoUpdater.autoInstallOnAppQuit = true
  const send = (s: string): void => win.webContents.send('update-status', s)
  autoUpdater.on('checking-for-update', () => send('Checking for updates…'))
  autoUpdater.on('update-available', (i) => send(`Downloading ${i.version}…`))
  autoUpdater.on('update-not-available', () => send('Up to date'))
  autoUpdater.on('update-downloaded', (i) => send(`Update ${i.version} ready`))
  autoUpdater.on('error', () => send('Update check failed (offline?)'))
  const check = (): void => void autoUpdater.checkForUpdates().catch(() => {})
  ipcMain.handle('updates:check', check)
  ipcMain.handle('updates:install', () => autoUpdater.quitAndInstall())
  if (app.isPackaged) check()
}