import { randomUUID } from 'crypto'
import { BrowserWindow } from 'electron'
import type Database from 'better-sqlite3'
import { existsSync, unlinkSync, writeFileSync } from 'fs'
import { basename, join } from 'path'
import { formatQuantityThousandths, formatRupees } from '../../../core/money'
import { pdfExportBasename, uniqueFilePath } from '../../../core/folders'
import type { InvoiceDetail } from '../../../shared/invoices'
import type { ExportInvoicePdfResult } from '../../../shared/settings'
import { paymentMethodLabel } from '../../../shared/payments'
import { storedImageDataUri } from '../../files/images'
import { assertExportsDirWritable, tempDir } from '../../paths'
import { getInvoice } from './service'

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;')
}

function renderInvoiceHtml(invoice: InvoiceDetail, hideRates: boolean): string {
  const rateHeader = hideRates ? '' : '<th class="num">Rate</th>'
  const rows = invoice.lines
    .map((line) => {
      const image = line.image_path ? storedImageDataUri(line.image_path) : null
      const imageCell = image ? `<img src="${image}" alt="" />` : ''
      const rateCell = hideRates
        ? ''
        : `<td class="num">${escapeHtml(formatRupees(line.rate))}</td>`
      return `<tr>
        <td class="image">${imageCell}</td>
        <td>${escapeHtml(line.name)}</td>
        <td>${escapeHtml(line.unit_name)}</td>
        <td class="num">${escapeHtml(formatQuantityThousandths(line.quantity))}</td>
        ${rateCell}
        <td class="num">${escapeHtml(formatRupees(line.total))}</td>
      </tr>`
    })
    .join('')
  const phone = invoice.client_phone
    ? `<p class="meta">${escapeHtml(invoice.client_phone)}</p>`
    : ''

  return `<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src data:; style-src 'unsafe-inline'" />
    <title>${escapeHtml(invoice.number ?? 'Draft')}</title>
    <style>
      @page { size: A4; margin: 16mm; }
      * { box-sizing: border-box; }
      body { margin: 0; color: #111; background: #fff; font: 12px/1.4 "Segoe UI", sans-serif; }
      h1 { margin: 0 0 12px; font-size: 22px; font-weight: 700; }
      .meta { margin: 0 0 4px; }
      table { width: 100%; margin-top: 16px; border-collapse: collapse; }
      th, td { padding: 6px 8px; border-bottom: 1px solid #ccc; text-align: left; vertical-align: middle; }
      th { font-size: 11px; color: #444; }
      td.num, th.num { text-align: right; white-space: nowrap; }
      td.image { width: 56px; }
      img { width: 48px; height: 48px; object-fit: cover; }
      .total { margin: 16px 0 0; text-align: right; font-size: 14px; font-weight: 700; }
    </style>
  </head>
  <body>
    <h1>credex</h1>
    <p class="meta"><strong>${escapeHtml(invoice.number ?? 'Draft')}</strong></p>
    <p class="meta">${escapeHtml(invoice.invoice_date)}</p>
    <p class="meta">${escapeHtml(invoice.client_name)}</p>
    ${phone}
    <table>
      <thead>
        <tr>
          <th>Image</th>
          <th>Name</th>
          <th>Unit</th>
          <th class="num">Qty</th>
          ${rateHeader}
          <th class="num">Total</th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>
    <p class="total">Total ${escapeHtml(formatRupees(invoice.total))}</p>
    ${
      invoice.payments.filter((payment) => payment.status === 'active').length > 0
        ? `<table>
      <thead>
        <tr>
          <th>Payment date</th>
          <th>Method</th>
          <th class="num">Amount</th>
        </tr>
      </thead>
      <tbody>
        ${invoice.payments
          .filter((payment) => payment.status === 'active')
          .map(
            (payment) => `<tr>
          <td>${escapeHtml(payment.payment_date)}</td>
          <td>${escapeHtml(paymentMethodLabel(payment.method))}</td>
          <td class="num">${escapeHtml(formatRupees(payment.amount))}</td>
        </tr>`
          )
          .join('')}
      </tbody>
    </table>
    <p class="total">Paid ${escapeHtml(formatRupees(invoice.paid))}</p>
    <p class="total">Due ${escapeHtml(formatRupees(invoice.due))}</p>`
        : invoice.status === 'issued'
          ? `<p class="total">Paid ${escapeHtml(formatRupees(invoice.paid))}</p>
    <p class="total">Due ${escapeHtml(formatRupees(invoice.due))}</p>`
          : ''
    }
  </body>
</html>`
}

export async function exportInvoicePdf(
  db: Database.Database,
  id: string,
  hideRates = false
): Promise<ExportInvoicePdfResult> {
  const invoice = getInvoice(db, id)
  if (!invoice) throw new Error('Invoice not found')

  const dir = assertExportsDirWritable()

  const htmlPath = join(tempDir(), `credex-invoice-${randomUUID()}.html`)
  const win = new BrowserWindow({
    show: false,
    width: 794,
    height: 1123,
    autoHideMenuBar: true,
    skipTaskbar: true,
    webPreferences: {
      sandbox: false,
      contextIsolation: true,
      nodeIntegration: false,
      backgroundThrottling: false
    }
  })

  try {
    writeFileSync(htmlPath, renderInvoiceHtml(invoice, hideRates), 'utf8')
    await win.loadFile(htmlPath)
    const pdf = await win.webContents.printToPDF({
      pageSize: 'A4',
      printBackground: true,
      preferCSSPageSize: true
    })
    const desired = pdfExportBasename(invoice.number, hideRates)
    const filePath = uniqueFilePath(dir, desired, existsSync)
    try {
      writeFileSync(filePath, pdf)
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error)
      throw new Error(`Could not save PDF to:\n${filePath}\n\n${reason}`, { cause: error })
    }
    return { saved: true, filename: basename(filePath), filePath }
  } finally {
    if (!win.isDestroyed()) win.destroy()
    try {
      unlinkSync(htmlPath)
    } catch {
      // The temp file may not have been created.
    }
  }
}
