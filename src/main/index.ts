import { app, shell, BrowserWindow, ipcMain } from 'electron'
import { join } from 'path'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import icon from '../../resources/icon.png?asset'

import { openDb, schemaVersion } from './db'
import { registerFileProtocol, registerFileScheme } from './files/protocol'
import { registerClientsIpc } from './modules/clients/ipc'
import { registerInvoicesIpc } from './modules/invoices/ipc'
import { registerUnitsIpc } from './modules/units/ipc'
import { setupUpdater } from './updater'

registerFileScheme()

// Window background until the renderer reports the saved theme.
let windowBackground = '#1b1b1f'

function applyWindowBackground(win: BrowserWindow): void {
  if (win.isDestroyed()) return
  win.setBackgroundColor(windowBackground)
}

function createWindow(): BrowserWindow {
  // Create the browser window.
  const mainWindow = new BrowserWindow({
    width: 900,
    height: 670,
    show: false,
    autoHideMenuBar: true,
    backgroundColor: windowBackground,
    ...(process.platform === 'linux' ? { icon } : {}),
    // Frameless caption so window controls live in the page and modals can cover them.
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

  // HMR for renderer based on electron-vite CLI.
  // Load the remote URL for development or the local HTML file for production.
  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }

  return mainWindow
}

// This method will be called when Electron has finished
// initialization and is ready to create browser windows.
app.whenReady().then(() => {
  // Set app user model ID for Windows.
  electronApp.setAppUserModelId('com.electron')

  // Default open or close DevTools by F12 in development.
  // Ignore CommandOrControl + R in production.
  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window)
  })

  // Initialize the database.
  const db = openDb()
  registerClientsIpc(db)
  registerUnitsIpc(db)
  registerInvoicesIpc(db)
  registerFileProtocol()

  // Provide application information to the renderer.
  ipcMain.handle('app:info', () => ({
    version: app.getVersion(),
    schema: schemaVersion(db)
  }))

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

  // Create the main window and initialize the updater.
  const win = createWindow()
  setupUpdater(win)

  // Re-create a window when the macOS dock icon is clicked.
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow()
    }
  })
})

// Quit when all windows are closed, except on macOS.
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})
