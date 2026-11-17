import { randomUUID } from 'crypto'
import { app, dialog, nativeImage, type BrowserWindow, type OpenDialogOptions } from 'electron'
import { existsSync, mkdirSync, readFileSync, unlinkSync, writeFileSync } from 'fs'
import { join } from 'path'
import { INVOICE_IMAGE_NAME } from '../../shared/invoices'

const STORED_MAX_SIDE = 1600

export function filesDirectory(): string {
  return join(app.getPath('userData'), 'files')
}

function fitWithin(
  width: number,
  height: number,
  maxSide: number
): { width: number; height: number } | null {
  if (width <= 0 || height <= 0) return null
  const longest = Math.max(width, height)
  if (longest <= maxSide) return null
  const scale = maxSide / longest
  return {
    width: Math.max(1, Math.floor(width * scale)),
    height: Math.max(1, Math.floor(height * scale))
  }
}

function errno(error: unknown): string | undefined {
  if (!error || typeof error !== 'object' || !('code' in error)) return undefined
  return String((error as { code: unknown }).code)
}

export function storedImageExists(filename: string): boolean {
  if (!INVOICE_IMAGE_NAME.test(filename)) return false
  return existsSync(join(filesDirectory(), filename))
}

export function deleteStoredImage(filename: string): void {
  if (!INVOICE_IMAGE_NAME.test(filename)) return
  try {
    unlinkSync(join(filesDirectory(), filename))
  } catch (error) {
    if (errno(error) !== 'ENOENT') throw error
  }
}

/** JPEG data URI of a stored image, resized so the longest side is at most maxSide. */
export function storedImageDataUri(filename: string, maxSide = 320): string | null {
  if (!storedImageExists(filename)) return null
  const image = nativeImage.createFromBuffer(readFileSync(join(filesDirectory(), filename)))
  if (image.isEmpty()) return null
  const size = image.getSize()
  const fitted = fitWithin(size.width, size.height, maxSide)
  const output = fitted
    ? image.resize({ width: fitted.width, height: fitted.height, quality: 'best' })
    : image
  return `data:image/jpeg;base64,${output.toJPEG(80).toString('base64')}`
}

export async function pickInvoiceImage(parent?: BrowserWindow | null): Promise<string | null> {
  const options: OpenDialogOptions = {
    title: 'Choose an image',
    properties: ['openFile'],
    filters: [{ name: 'Images', extensions: ['png', 'jpg', 'jpeg', 'webp'] }]
  }
  const result = parent
    ? await dialog.showOpenDialog(parent, options)
    : await dialog.showOpenDialog(options)
  if (result.canceled || result.filePaths.length === 0) return null

  const image = nativeImage.createFromPath(result.filePaths[0])
  if (image.isEmpty()) throw new Error('Could not read that image')
  const size = image.getSize()
  if (size.width <= 0 || size.height <= 0) throw new Error('Could not read that image')

  const fitted = fitWithin(size.width, size.height, STORED_MAX_SIDE)
  const resized = fitted
    ? image.resize({ width: fitted.width, height: fitted.height, quality: 'best' })
    : image
  const dir = filesDirectory()
  mkdirSync(dir, { recursive: true })
  const filename = `${randomUUID()}.jpg`
  writeFileSync(join(dir, filename), resized.toJPEG(85))
  return filename
}
