import { basename, dirname, extname, isAbsolute, join, normalize, resolve, sep } from 'path'

const SYNC_MARKERS = ['onedrive', 'dropbox', 'google drive', 'icloud'] as const

/** True for Windows UNC paths like \\server\share\... */
export function isUncPath(value: string): boolean {
  const trimmed = value.trim()
  if (!trimmed) return false
  return trimmed.startsWith('\\\\') || trimmed.startsWith('//')
}

function normalizeForCompare(value: string): string {
  const resolved = resolve(normalize(value.trim()))
  // Windows paths are case-insensitive for containment checks.
  return process.platform === 'win32' ? resolved.toLowerCase() : resolved
}

/** True when `inner` is the same as or nested inside `outer`. */
export function isPathInsideOrEqual(inner: string, outer: string): boolean {
  const a = normalizeForCompare(inner)
  const b = normalizeForCompare(outer)
  if (a === b) return true
  const prefix = b.endsWith(sep) ? b : `${b}${sep}`
  return a.startsWith(prefix)
}

/** True when either path is inside or equal to the other. */
export function pathsOverlap(a: string, b: string): boolean {
  return isPathInsideOrEqual(a, b) || isPathInsideOrEqual(b, a)
}

/** Detects common cloud-sync folders in a path. */
export function isSyncFolderPath(value: string): boolean {
  const normalized = normalize(value.trim()).replace(/\\/g, '/').toLowerCase()
  return SYNC_MARKERS.some((marker) => normalized.includes(marker))
}

/** Drive letter for Windows absolute paths (e.g. "c:"), otherwise null. */
export function driveLetter(value: string): string | null {
  const trimmed = value.trim()
  if (isUncPath(trimmed)) return null
  const match = /^([a-zA-Z]):/.exec(trimmed)
  return match ? match[1].toLowerCase() + ':' : null
}

export function sameDrive(a: string, b: string): boolean {
  const left = driveLetter(a)
  const right = driveLetter(b)
  if (!left || !right) return false
  return left === right
}

/**
 * Build a non-colliding filename. If `base.pdf` exists, try `base (2).pdf`, `base (3).pdf`, …
 * `exists` receives candidate filenames (not full paths).
 */
export function uniqueFilename(desiredName: string, exists: (filename: string) => boolean): string {
  const name = basename(desiredName.trim())
  if (!name) throw new Error('Filename is required')
  if (!exists(name)) return name

  const extension = extname(name)
  const stem = extension ? name.slice(0, -extension.length) : name
  for (let n = 2; n < 10_000; n += 1) {
    const candidate = `${stem} (${n})${extension}`
    if (!exists(candidate)) return candidate
  }
  throw new Error('Could not find a unique filename')
}

/** Join a directory with a unique filename derived from `desiredName`. */
export function uniqueFilePath(
  directory: string,
  desiredName: string,
  existsAbsolute: (absolutePath: string) => boolean
): string {
  if (!isAbsolute(directory)) throw new Error('Directory must be absolute')
  const filename = uniqueFilename(desiredName, (name) => existsAbsolute(join(directory, name)))
  return join(directory, filename)
}

export function pdfExportBasename(invoiceNumber: string | null, hideRates: boolean): string {
  const base = (invoiceNumber?.trim() || 'invoice').replace(/[<>:"/\\|?*]/g, '-')
  return hideRates ? `${base} - no rates.pdf` : `${base}.pdf`
}

/** Safe basename for a client ledger PDF export. */
export function ledgerPdfBasename(clientName: string): string {
  const base = (clientName.trim() || 'client').replace(/[<>:"/\\|?*]/g, '-')
  return `${base} ledger.pdf`
}

export { dirname, join }
