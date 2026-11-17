import { protocol, net } from 'electron'
import { mkdirSync } from 'fs'
import { basename, relative, resolve } from 'path'
import { pathToFileURL } from 'url'
import { INVOICE_FILE_SCHEME, INVOICE_IMAGE_HOST, INVOICE_IMAGE_NAME } from '../../shared/invoices'
import { filesDirectory } from './images'

export function registerFileScheme(): void {
  protocol.registerSchemesAsPrivileged([
    {
      scheme: INVOICE_FILE_SCHEME,
      privileges: {
        standard: true,
        secure: true,
        supportFetchAPI: true,
        corsEnabled: true,
        stream: true
      }
    }
  ])
}

function filenameFromRequest(raw: string): string | null {
  let url: URL
  try {
    url = new URL(raw)
  } catch {
    return null
  }
  if (url.protocol !== `${INVOICE_FILE_SCHEME}:`) return null
  if (url.hostname !== INVOICE_IMAGE_HOST) return null

  let pathname: string
  try {
    pathname = decodeURIComponent(url.pathname)
  } catch {
    return null
  }
  const name = basename(pathname)
  if (pathname !== `/${name}`) return null
  if (!INVOICE_IMAGE_NAME.test(name)) return null

  const root = resolve(filesDirectory())
  const full = resolve(root, name)
  if (relative(root, full) !== name) return null
  return name
}

export function registerFileProtocol(): void {
  mkdirSync(filesDirectory(), { recursive: true })
  protocol.handle(INVOICE_FILE_SCHEME, (request) => {
    if (request.method !== 'GET') {
      return new Response('Method not allowed', { status: 405 })
    }
    const name = filenameFromRequest(request.url)
    if (!name) return new Response('Forbidden', { status: 403 })
    const full = resolve(filesDirectory(), name)
    return net.fetch(pathToFileURL(full).href)
  })
}
