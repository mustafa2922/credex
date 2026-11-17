import { ipcMain } from 'electron'
import type Database from 'better-sqlite3'
import './schemas'

export function registerInvoicesIpc(_db: Database.Database): void {
  ipcMain.handle('invoices:list', () => [])
}
