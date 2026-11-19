import { contextBridge, ipcRenderer } from 'electron'
import type { Client, ListClientsParams } from '../shared/clients'
import type {
  ExportInvoicePdfInput,
  InvoiceDetail,
  InvoiceSummary,
  ListInvoicesParams,
  SaveInvoiceInput,
  VoidInvoiceInput
} from '../shared/invoices'
import type {
  ChangeDataDirInput,
  ChangeFolderInput,
  ExportInvoicePdfResult,
  SettingsSnapshot,
  StartupState
} from '../shared/settings'
import type {
  CreatePaymentInput,
  CreatePaymentResult,
  ListPaymentsParams,
  Payment,
  PaymentSummary,
  PreviewPaymentInput,
  PreviewPaymentResult,
  VoidPaymentInput
} from '../shared/payments'
import type { ListUnitsParams, Unit } from '../shared/units'

const clients = {
  list: (params?: ListClientsParams): Promise<Client[]> =>
    ipcRenderer.invoke('clients:list', params ?? {}),
  create: (input: { name: string; phone?: string }): Promise<Client> =>
    ipcRenderer.invoke('clients:create', input),
  update: (input: { id: string; name: string; phone?: string }): Promise<Client> =>
    ipcRenderer.invoke('clients:update', input),
  setStatus: (input: { id: string; status: 'active' | 'inactive' }): Promise<Client> =>
    ipcRenderer.invoke('clients:setStatus', input)
}

const units = {
  list: (params?: ListUnitsParams): Promise<Unit[]> =>
    ipcRenderer.invoke('units:list', params ?? {}),
  create: (input: { name: string }): Promise<Unit> => ipcRenderer.invoke('units:create', input),
  update: (input: { id: string; name: string }): Promise<Unit> =>
    ipcRenderer.invoke('units:update', input),
  setStatus: (input: { id: string; status: 'active' | 'inactive' }): Promise<Unit> =>
    ipcRenderer.invoke('units:setStatus', input)
}

const invoices = {
  save: (input: SaveInvoiceInput): Promise<InvoiceDetail> =>
    ipcRenderer.invoke('invoices:save', input),
  get: (id: string): Promise<InvoiceDetail> => ipcRenderer.invoke('invoices:get', id),
  list: (params?: ListInvoicesParams): Promise<InvoiceSummary[]> =>
    ipcRenderer.invoke('invoices:list', params ?? {}),
  issue: (id: string): Promise<InvoiceDetail> => ipcRenderer.invoke('invoices:issue', id),
  reopen: (id: string): Promise<InvoiceDetail> => ipcRenderer.invoke('invoices:reopen', id),
  void: (input: VoidInvoiceInput): Promise<InvoiceDetail> =>
    ipcRenderer.invoke('invoices:void', input),
  deleteDraft: (id: string): Promise<void> => ipcRenderer.invoke('invoices:deleteDraft', id),
  pickImage: (): Promise<string | null> => ipcRenderer.invoke('invoices:pickImage'),
  saveImage: (bytes: Uint8Array): Promise<string> =>
    ipcRenderer.invoke('invoices:saveImage', bytes),
  exportPdf: (input: ExportInvoicePdfInput): Promise<ExportInvoicePdfResult> =>
    ipcRenderer.invoke('invoices:exportPdf', input)
}

const settings = {
  get: (): Promise<SettingsSnapshot> => ipcRenderer.invoke('settings:get'),
  copyDiagnostics: (): Promise<string> => ipcRenderer.invoke('settings:copyDiagnostics'),
  pickDirectory: (title?: string): Promise<string | null> =>
    ipcRenderer.invoke('settings:pickDirectory', title),
  inspectDataDir: (
    path: string
  ): Promise<{
    path: string
    empty: boolean
    hasLedger: boolean
    schemaVersion: number | null
    syncFolder: boolean
    overlapsCurrent: boolean
  }> => ipcRenderer.invoke('settings:inspectDataDir', path),
  changeDataDir: (input: ChangeDataDirInput): Promise<{ relaunch: true }> =>
    ipcRenderer.invoke('settings:changeDataDir', input),
  changeExportsDir: (input: ChangeFolderInput): Promise<SettingsSnapshot> =>
    ipcRenderer.invoke('settings:changeExportsDir', input),
  changeBackupDir: (input: ChangeFolderInput): Promise<SettingsSnapshot> =>
    ipcRenderer.invoke('settings:changeBackupDir', input),
  openPath: (path: string): Promise<void> => ipcRenderer.invoke('settings:openPath', path),
  showInFolder: (path: string): Promise<void> => ipcRenderer.invoke('settings:showInFolder', path),
  openConfig: (): Promise<void> => ipcRenderer.invoke('settings:openConfig'),
  openLogs: (): Promise<void> => ipcRenderer.invoke('settings:openLogs')
}

const payments = {
  list: (params?: ListPaymentsParams): Promise<PaymentSummary[]> =>
    ipcRenderer.invoke('payments:list', params ?? {}),
  preview: (input: PreviewPaymentInput): Promise<PreviewPaymentResult> =>
    ipcRenderer.invoke('payments:preview', input),
  create: (input: CreatePaymentInput): Promise<CreatePaymentResult> =>
    ipcRenderer.invoke('payments:create', input),
  void: (input: VoidPaymentInput): Promise<Payment> => ipcRenderer.invoke('payments:void', input),
  pickAttachment: (): Promise<string | null> => ipcRenderer.invoke('payments:pickAttachment')
}

const api = {
  info: (): Promise<{ version: string; schema: number }> => ipcRenderer.invoke('app:info'),
  startup: (): Promise<StartupState> => ipcRenderer.invoke('app:startup'),
  retryStartup: (): Promise<StartupState> => ipcRenderer.invoke('app:retryStartup'),
  chooseDataDir: (): Promise<StartupState> => ipcRenderer.invoke('app:chooseDataDir'),
  quitApp: (): Promise<void> => ipcRenderer.invoke('app:quit'),
  checkUpdates: (): Promise<void> => ipcRenderer.invoke('updates:check'),
  installUpdate: (): Promise<void> => ipcRenderer.invoke('updates:install'),
  onUpdateStatus: (cb: (s: string) => void): (() => void) => {
    const h = (_: unknown, s: string): void => cb(s)
    ipcRenderer.on('update-status', h)
    return () => ipcRenderer.removeListener('update-status', h)
  },
  setWindowTheme: (theme: { color: string; symbolColor: string }): void => {
    ipcRenderer.send('window:theme', theme)
  },
  platform: process.platform,
  minimizeWindow: (): void => {
    ipcRenderer.send('window:minimize')
  },
  toggleMaximizeWindow: (): void => {
    ipcRenderer.send('window:toggle-maximize')
  },
  closeWindow: (): void => {
    ipcRenderer.send('window:close')
  },
  isWindowMaximized: (): Promise<boolean> => ipcRenderer.invoke('window:is-maximized'),
  onWindowMaximized: (cb: (maximized: boolean) => void): (() => void) => {
    const h = (_: unknown, maximized: boolean): void => cb(maximized)
    ipcRenderer.on('window:maximized', h)
    return () => ipcRenderer.removeListener('window:maximized', h)
  },
  clients,
  units,
  invoices,
  payments,
  settings
}
contextBridge.exposeInMainWorld('api', api)
export type Api = typeof api
