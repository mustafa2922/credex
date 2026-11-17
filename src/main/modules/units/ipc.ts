import { ipcMain } from 'electron'
import type Database from 'better-sqlite3'
import { ZodError } from 'zod'
import type { Unit } from '../../../shared/units'
import {
  createUnitSchema,
  formatZodError,
  listUnitsSchema,
  setUnitStatusSchema,
  updateUnitSchema
} from './schemas'
import { createUnit, listUnits, setUnitStatus, updateUnit } from './service'

function invoke<T>(fn: () => T): T {
  try {
    return fn()
  } catch (error) {
    if (error instanceof ZodError) {
      throw new Error(formatZodError(error), { cause: error })
    }
    throw error
  }
}

export function registerUnitsIpc(db: Database.Database): void {
  ipcMain.handle('units:list', (_, raw: unknown) =>
    invoke(() => {
      const params = listUnitsSchema.parse(raw ?? {})
      return listUnits(db, params)
    })
  )

  ipcMain.handle('units:create', (_, raw: unknown): Unit =>
    invoke(() => {
      const input = createUnitSchema.parse(raw ?? {})
      return createUnit(db, input)
    })
  )

  ipcMain.handle('units:update', (_, raw: unknown): Unit =>
    invoke(() => {
      const input = updateUnitSchema.parse(raw ?? {})
      return updateUnit(db, input.id, { name: input.name })
    })
  )

  ipcMain.handle('units:setStatus', (_, raw: unknown): Unit =>
    invoke(() => {
      const input = setUnitStatusSchema.parse(raw ?? {})
      return setUnitStatus(db, input.id, input.status)
    })
  )
}
