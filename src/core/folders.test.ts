import { describe, expect, it } from 'vitest'
import {
  isPathInsideOrEqual,
  isSyncFolderPath,
  isUncPath,
  pathsOverlap,
  ledgerPdfBasename,
  pdfExportBasename,
  sameDrive,
  uniqueFilename
} from './folders'

describe('isUncPath', () => {
  it('detects UNC and rejects local paths', () => {
    expect(isUncPath('\\\\server\\share')).toBe(true)
    expect(isUncPath('//server/share')).toBe(true)
    expect(isUncPath('C:\\credex')).toBe(false)
    expect(isUncPath('/home/user/credex')).toBe(false)
  })
})

describe('path nesting', () => {
  it('detects nested and overlapping folders', () => {
    expect(isPathInsideOrEqual('C:\\credex\\files', 'C:\\credex')).toBe(true)
    expect(isPathInsideOrEqual('C:\\credex', 'C:\\credex')).toBe(true)
    expect(isPathInsideOrEqual('C:\\other', 'C:\\credex')).toBe(false)
    expect(pathsOverlap('C:\\credex', 'C:\\credex\\files')).toBe(true)
    expect(pathsOverlap('C:\\credex\\files', 'C:\\credex')).toBe(true)
    expect(pathsOverlap('C:\\credex', 'D:\\credex')).toBe(false)
  })
})

describe('isSyncFolderPath', () => {
  it('flags OneDrive, Dropbox, Google Drive, and iCloud', () => {
    expect(isSyncFolderPath('C:\\Users\\a\\OneDrive\\credex')).toBe(true)
    expect(isSyncFolderPath('D:\\Dropbox\\data')).toBe(true)
    expect(isSyncFolderPath('C:\\Google Drive\\ledger')).toBe(true)
    expect(isSyncFolderPath('/Users/a/Library/Mobile Documents/com~apple~CloudDocs/x')).toBe(false)
    expect(isSyncFolderPath('C:\\Users\\a\\iCloudDrive\\docs')).toBe(true)
    expect(isSyncFolderPath('C:\\credex')).toBe(false)
  })
})

describe('sameDrive', () => {
  it('compares Windows drive letters', () => {
    expect(sameDrive('C:\\credex', 'C:\\exports')).toBe(true)
    expect(sameDrive('C:\\credex', 'D:\\backups')).toBe(false)
    expect(sameDrive('\\\\server\\share', 'C:\\credex')).toBe(false)
  })
})

describe('uniqueFilename', () => {
  it('keeps the name when free and suffixes when taken', () => {
    const taken = new Set(['INV-0007.pdf', 'INV-0007 (2).pdf'])
    expect(uniqueFilename('INV-0007.pdf', (name) => taken.has(name))).toBe('INV-0007 (3).pdf')
    expect(uniqueFilename('fresh.pdf', (name) => taken.has(name))).toBe('fresh.pdf')
  })
})

describe('pdfExportBasename', () => {
  it('builds invoice PDF names with optional no-rates suffix', () => {
    expect(pdfExportBasename('INV-0007', false)).toBe('INV-0007.pdf')
    expect(pdfExportBasename('INV-0007', true)).toBe('INV-0007 - no rates.pdf')
    expect(pdfExportBasename(null, false)).toBe('invoice.pdf')
  })
})

describe('ledgerPdfBasename', () => {
  it('builds a sanitized client ledger filename', () => {
    expect(ledgerPdfBasename('Papa Garments')).toBe('Papa Garments ledger.pdf')
    expect(ledgerPdfBasename('A/B:C')).toBe('A-B-C ledger.pdf')
    expect(ledgerPdfBasename('   ')).toBe('client ledger.pdf')
  })
})
