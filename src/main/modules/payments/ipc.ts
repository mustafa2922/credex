import { BrowserWindow, ipcMain } from 'electron'
import type Database from 'better-sqlite3'
import { ZodError } from 'zod'
import type { Payment, PaymentSummary } from '../../../shared/payments'
import { pickInvoiceImage } from '../../files/images'
import {
  createPaymentSchema,
  formatZodError,
  listPaymentsSchema,
  voidPaymentSchema
} from './schemas'
import { createPayment, listPayments, voidPayment } from './service'

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

export function registerPaymentsIpc(db: Database.Database): void {
  ipcMain.handle('payments:list', (_, raw: unknown): PaymentSummary[] =>
    invoke(() => {
      const params = listPaymentsSchema.parse(raw ?? {})
      return listPayments(db, params)
    })
  )

  ipcMain.handle('payments:create', (_, raw: unknown): Payment =>
    invoke(() => {
      const input = createPaymentSchema.parse(raw ?? {})
      return createPayment(db, input)
    })
  )

  ipcMain.handle('payments:void', (_, raw: unknown): Payment =>
    invoke(() => {
      const input = voidPaymentSchema.parse(raw ?? {})
      return voidPayment(db, input.id, input.reason)
    })
  )

  ipcMain.handle('payments:pickAttachment', async (event): Promise<string | null> => {
    try {
      return await pickInvoiceImage(parentWindow(event))
    } catch (error) {
      if (error instanceof ZodError) {
        throw new Error(formatZodError(error))
      }
      throw error
    }
  })
}
