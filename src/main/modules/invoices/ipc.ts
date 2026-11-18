import { BrowserWindow, ipcMain } from 'electron'
import type Database from 'better-sqlite3'
import { ZodError } from 'zod'
import type { InvoiceDetail, InvoiceSummary } from '../../../shared/invoices'
import { pickInvoiceImage, storeInvoiceImageFromBytes } from '../../files/images'
import { exportInvoicePdf } from './pdf'
import {
  exportInvoiceSchema,
  formatZodError,
  invoiceIdSchema,
  listInvoicesSchema,
  saveInvoiceSchema,
  voidInvoiceSchema
} from './schemas'
import {
  deleteDraftInvoice,
  getInvoice,
  issueInvoice,
  listInvoices,
  reopenInvoice,
  saveInvoice,
  voidInvoice
} from './service'

function invoke<T>(fn: () => T): T {
  try {
    return fn()
  } catch (error) {
    if (error instanceof ZodError) {
      throw new Error(formatZodError(error))
    }
    throw error
  }
}

function parentWindow(event: Electron.IpcMainInvokeEvent): BrowserWindow | null {
  return BrowserWindow.fromWebContents(event.sender)
}

export function registerInvoicesIpc(db: Database.Database): void {
  ipcMain.handle('invoices:list', (_, raw: unknown): InvoiceSummary[] =>
    invoke(() => {
      const params = listInvoicesSchema.parse(raw ?? {})
      return listInvoices(db, params)
    })
  )

  ipcMain.handle('invoices:get', (_, raw: unknown): InvoiceDetail =>
    invoke(() => {
      const id =
        typeof raw === 'string'
          ? invoiceIdSchema.parse(raw)
          : invoiceIdSchema.parse((raw as { id?: string })?.id)
      const invoice = getInvoice(db, id)
      if (!invoice) {
        throw new Error('Invoice not found')
      }
      return invoice
    })
  )

  ipcMain.handle('invoices:save', (_, raw: unknown): InvoiceDetail =>
    invoke(() => {
      const input = saveInvoiceSchema.parse(raw ?? {})
      return saveInvoice(db, input)
    })
  )

  ipcMain.handle('invoices:issue', (_, raw: unknown): InvoiceDetail =>
    invoke(() => {
      const id =
        typeof raw === 'string'
          ? invoiceIdSchema.parse(raw)
          : invoiceIdSchema.parse((raw as { id?: string })?.id)
      return issueInvoice(db, id)
    })
  )

  ipcMain.handle('invoices:reopen', (_, raw: unknown): InvoiceDetail =>
    invoke(() => {
      const id =
        typeof raw === 'string'
          ? invoiceIdSchema.parse(raw)
          : invoiceIdSchema.parse((raw as { id?: string })?.id)
      return reopenInvoice(db, id)
    })
  )

  ipcMain.handle('invoices:void', (_, raw: unknown): InvoiceDetail =>
    invoke(() => {
      const input = voidInvoiceSchema.parse(raw ?? {})
      return voidInvoice(db, input.id, input.reason)
    })
  )

  ipcMain.handle('invoices:deleteDraft', (_, raw: unknown): void =>
    invoke(() => {
      const id =
        typeof raw === 'string'
          ? invoiceIdSchema.parse(raw)
          : invoiceIdSchema.parse((raw as { id?: string })?.id)
      deleteDraftInvoice(db, id)
    })
  )

  ipcMain.handle('invoices:pickImage', async (event): Promise<string | null> => {
    try {
      return await pickInvoiceImage(parentWindow(event))
    } catch (error) {
      if (error instanceof ZodError) {
        throw new Error(formatZodError(error))
      }
      throw error
    }
  })

  ipcMain.handle('invoices:saveImage', (_, raw: unknown): string => {
    let bytes: Uint8Array | null = null
    if (raw instanceof Uint8Array) bytes = raw
    else if (raw instanceof ArrayBuffer) bytes = new Uint8Array(raw)
    if (!bytes || bytes.byteLength === 0) {
      throw new Error('Could not read that image')
    }
    return storeInvoiceImageFromBytes(bytes)
  })

  ipcMain.handle('invoices:exportPdf', async (_event, raw: unknown) => {
    try {
      const input = exportInvoiceSchema.parse(raw ?? {})
      return await exportInvoicePdf(db, input.id, input.hideRates)
    } catch (error) {
      if (error instanceof ZodError) {
        throw new Error(formatZodError(error))
      }
      throw error
    }
  })
}
