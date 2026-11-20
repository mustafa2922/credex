import { ipcMain } from 'electron'
import type Database from 'better-sqlite3'
import type { DashboardSummary } from '../../../shared/dashboard'
import { getDashboardSummary } from './service'

export function registerDashboardIpc(db: Database.Database): void {
  ipcMain.handle('dashboard:getSummary', (): DashboardSummary => getDashboardSummary(db))
}
