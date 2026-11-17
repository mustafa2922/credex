import { ipcMain } from 'electron'
import type Database from 'better-sqlite3'
import { ZodError } from 'zod'
import type { Client } from '../../../shared/clients'
import {
  clientIdSchema,
  createClientSchema,
  formatZodError,
  listClientsSchema,
  setClientStatusSchema,
  updateClientSchema
} from './schemas'
import { createClient, getClient, listClients, setClientStatus, updateClient } from './service'

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

export function registerClientsIpc(db: Database.Database): void {
  ipcMain.handle('clients:list', (_, raw: unknown) =>
    invoke(() => {
      const params = listClientsSchema.parse(raw ?? {})
      return listClients(db, params)
    })
  )

  ipcMain.handle('clients:get', (_, raw: unknown): Client =>
    invoke(() => {
      const id =
        typeof raw === 'string'
          ? clientIdSchema.parse(raw)
          : clientIdSchema.parse((raw as { id?: string })?.id)
      const client = getClient(db, id)
      if (!client) {
        throw new Error('Client not found')
      }
      return client
    })
  )

  ipcMain.handle('clients:create', (_, raw: unknown): Client =>
    invoke(() => {
      const input = createClientSchema.parse(raw ?? {})
      return createClient(db, input)
    })
  )

  ipcMain.handle('clients:update', (_, raw: unknown): Client =>
    invoke(() => {
      const input = updateClientSchema.parse(raw ?? {})
      return updateClient(db, input.id, { name: input.name, phone: input.phone })
    })
  )

  ipcMain.handle('clients:setStatus', (_, raw: unknown): Client =>
    invoke(() => {
      const input = setClientStatusSchema.parse(raw ?? {})
      return setClientStatus(db, input.id, input.status)
    })
  )
}