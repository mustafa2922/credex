export type InvoiceStatus = 'draft' | 'issued' | 'void'

export type InvoiceListStatus = InvoiceStatus | 'all'

export const INVOICE_FILE_SCHEME = 'credex-file'
export const INVOICE_IMAGE_HOST = 'image'

export const INVOICE_IMAGE_NAME =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.jpg$/i

export function invoiceImageUrl(filename: string): string {
  return `${INVOICE_FILE_SCHEME}://${INVOICE_IMAGE_HOST}/${encodeURIComponent(filename)}`
}

export function isInvoiceDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false
  const year = Number(value.slice(0, 4))
  const month = Number(value.slice(5, 7))
  const day = Number(value.slice(8, 10))
  const date = new Date(Date.UTC(year, month - 1, day))
  return (
    date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day
  )
}

export type InvoiceLine = {
  id: string
  position: number
  name: string
  image_path: string | null
  unit_id: string
  unit_name: string
  quantity: number
  rate: number
  total: number
}

export type InvoiceSummary = {
  id: string
  number: string | null
  client_id: string
  client_name: string
  invoice_date: string
  status: InvoiceStatus
  total: number
  created_at: string
  updated_at: string
}

export type InvoiceDetail = InvoiceSummary & {
  client_phone: string | null
  void_reason: string | null
  issued_at: string | null
  lines: InvoiceLine[]
}

export type ListInvoicesParams = {
  search?: string
  status?: InvoiceListStatus
  client_id?: string
}

export type SaveInvoiceLine = {
  id?: string
  name: string
  image_path: string | null
  unit_id: string
  quantity: number
  rate: number
}

export type SaveInvoiceInput = {
  id?: string
  client_id: string
  invoice_date: string
  lines: SaveInvoiceLine[]
  removed_images?: string[]
}

export type VoidInvoiceInput = {
  id: string
  reason: string
}

export type ExportInvoicePdfInput = {
  id: string
  hideRates?: boolean
}
