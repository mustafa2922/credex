import { app, shell, BrowserWindow, ipcMain, Menu } from 'electron'
import { join } from 'path'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import icon from '../../resources/icon.png?asset'

import { openDb, schemaVersion } from './db'
import { registerFileProtocol, registerFileScheme } from './files/protocol'
import { registerClientsIpc } from './modules/clients/ipc'
import { registerInvoicesIpc } from './modules/invoices/ipc'
import { registerPaymentsIpc } from './modules/payments/ipc'
import { registerUnitsIpc } from './modules/units/ipc'
import { registerRecoveryIpc, registerSettingsIpc, setStartupOk } from './modules/settings/ipc'
import { initializePaths, ensureExportsDir } from './paths'
import { logger } from './logger'
import { setupUpdater } from './updater'

registerFileScheme()

function installApplicationMenu(): void {
  const template: Electron.MenuItemConstructorOptions[] = [
    ...(process.platform === 'darwin'
      ? [
          {
            label: app.name,
            submenu: [
              { role: 'about' as const },
              { type: 'separator' as const },
              { role: 'services' as const },
              { type: 'separator' as const },
              { role: 'hide' as const },
              { role: 'hideOthers' as const },
              { role: 'unhide' as const },
              { type: 'separator' as const },
              { role: 'quit' as const }
            ]
          }
        ]
      : []),
    { role: 'editMenu' },
    {
      label: 'View',
      submenu: [
        { role: 'reload' },
        { role: 'forceReload' },
        { role: 'toggleDevTools' },
        { type: 'separator' },
        { role: 'resetZoom' },
        { role: 'zoomIn' },
        { role: 'zoomOut' },
        { type: 'separator' },
        { role: 'togglefullscreen' }
      ]
    },
    { role: 'windowMenu' }
  ]
  Menu.setApplicationMenu(Menu.buildFromTemplate(template))
}

function wireZoomShortcuts(win: BrowserWindow): void {
  win.webContents.on('before-input-event', (event, input) => {
    if (input.type !== 'keyDown') return
    if (!(input.control || input.meta) || input.alt) return

    const { key, code } = input
    const zoomIn = key === '+' || key === '=' || code === 'Equal' || code === 'NumpadAdd'
    const zoomOut = key === '-' || key === '_' || code === 'Minus' || code === 'NumpadSubtract'
    const resetZoom = key === '0' || code === 'Digit0' || code === 'Numpad0'

    if (!zoomIn && !zoomOut && !resetZoom) return

    event.preventDefault()
    const contents = win.webContents
    if (contents.isDestroyed()) return
    if (zoomIn) contents.setZoomLevel(contents.getZoomLevel() + 0.5)
    else if (zoomOut) contents.setZoomLevel(contents.getZoomLevel() - 0.5)
    else contents.setZoomLevel(0)
  })
}

let windowBackground = '#1b1b1f'

function applyWindowBackground(win: BrowserWindow): void {
  if (win.isDestroyed()) return
  win.setBackgroundColor(windowBackground)
}

function createWindow(): BrowserWindow {
  const mainWindow = new BrowserWindow({
    width: 900,
    height: 670,
    show: false,
    autoHideMenuBar: true,
    backgroundColor: windowBackground,
    ...(process.platform === 'linux' ? { icon } : {}),
    ...(process.platform === 'win32' ? { titleBarStyle: 'hidden' as const } : {}),
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false
    }
  })

  const sendMaximized = (maximized: boolean): void => {
    if (mainWindow.isDestroyed()) return
    mainWindow.webContents.send('window:maximized', maximized)
  }
  mainWindow.on('maximize', () => sendMaximized(true))
  mainWindow.on('unmaximize', () => sendMaximized(false))

  mainWindow.on('ready-to-show', () => {
    applyWindowBackground(mainWindow)
    mainWindow.show()
  })

  mainWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url)
    return { action: 'deny' }
  })

  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }

  return mainWindow
}

function registerWindowIpc(): void {
  ipcMain.on('window:theme', (event, payload: unknown) => {
    if (!payload || typeof payload !== 'object') return
    const { color } = payload as { color?: unknown }
    if (typeof color !== 'string' || !/^#[0-9a-fA-F]{6}$/.test(color)) return
    windowBackground = color
    const win = BrowserWindow.fromWebContents(event.sender)
    if (!win) return
    applyWindowBackground(win)
  })

  ipcMain.on('window:minimize', (event) => {
    BrowserWindow.fromWebContents(event.sender)?.minimize()
  })

  ipcMain.on('window:toggle-maximize', (event) => {
    const win = BrowserWindow.fromWebContents(event.sender)
    if (!win || win.isDestroyed()) return
    if (win.isMaximized()) win.unmaximize()
    else win.maximize()
  })

  ipcMain.on('window:close', (event) => {
    BrowserWindow.fromWebContents(event.sender)?.close()
  })

  ipcMain.handle('window:is-maximized', (event) => {
    const win = BrowserWindow.fromWebContents(event.sender)
    return Boolean(win && !win.isDestroyed() && win.isMaximized())
  })
}

app.whenReady().then(() => {
  electronApp.setAppUserModelId('com.electron')
  installApplicationMenu()

  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window, { zoom: true })
    wireZoomShortcuts(window)
  })

  registerRecoveryIpc()
  registerWindowIpc()

  const startup = initializePaths()
  if (!startup.ok) {
    logger.error(`Startup blocked: ${startup.reason} (${startup.path})`)
    createWindow()
    return
  }

  setStartupOk()
  ensureExportsDir()
  logger.info(`Data folder ready at startup`)

  const db = openDb()
  registerClientsIpc(db)
  registerUnitsIpc(db)
  registerInvoicesIpc(db)
  registerPaymentsIpc(db)
  registerSettingsIpc(db)
  registerFileProtocol()

  ipcMain.handle('app:info', () => ({
    version: app.getVersion(),
    schema: schemaVersion(db)
  }))

  const win = createWindow()
  setupUpdater(win)

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow()
    }
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})
