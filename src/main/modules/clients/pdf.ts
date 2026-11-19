import { randomUUID } from 'crypto'
import { BrowserWindow } from 'electron'
import type Database from 'better-sqlite3'
import { existsSync, unlinkSync, writeFileSync } from 'fs'
import { basename, join } from 'path'
import { formatQuantityThousandths, formatRupees } from '../../../core/money'
import { ledgerPdfBasename, uniqueFilePath } from '../../../core/folders'
import { paymentMethodLabel, type PaymentMethod } from '../../../shared/payments'
import type { ExportInvoicePdfResult } from '../../../shared/settings'
import { storedImageDataUri } from '../../files/images'
import { assertExportsDirWritable, tempDir } from '../../paths'
import { getClientLedgerData, type ClientLedgerData } from './service'

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;')
}

function paymentDescription(method: PaymentMethod, note: string | null): string {
  const label = paymentMethodLabel(method)
  const trimmed = note?.trim()
  return trimmed ? `Received — ${label} — ${trimmed}` : `Received — ${label}`
}

const MONTHS = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec'
] as const

/** Format YYYY-MM-DD as 19-Nov-2026 for ledger PDF display. */
function formatLedgerDate(value: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value.trim())
  if (!match) return value
  const year = match[1]
  const month = Number(match[2])
  const day = Number(match[3])
  if (month < 1 || month > 12 || day < 1 || day > 31) return value
  return `${day}-${MONTHS[month - 1]}-${year}`
}

function renderLedgerHtml(data: ClientLedgerData): string {
  const phone = data.client.phone ? `<p class="meta">${escapeHtml(data.client.phone)}</p>` : ''

  let running = 0
  let totalAmount = 0
  let totalReceived = 0
  const bodyRows: string[] = []

  for (const invoice of data.invoices) {
    for (const line of invoice.lines) {
      running += line.total
      totalAmount += line.total
      const image = line.image_path ? storedImageDataUri(line.image_path) : null
      const imageCell = image ? `<img src="${image}" alt="" />` : ''
      const qty = `${formatQuantityThousandths(line.quantity)} ${line.unit_name}`
      bodyRows.push(`<tr>
        <td class="keep">${escapeHtml(formatLedgerDate(invoice.invoice_date))}</td>
        <td class="keep">${escapeHtml(invoice.number)}</td>
        <td class="image">${imageCell}</td>
        <td>${escapeHtml(line.name)}</td>
        <td class="num">${escapeHtml(formatRupees(line.rate))}</td>
        <td class="num">${escapeHtml(qty)}</td>
        <td class="num">${escapeHtml(formatRupees(line.total))}</td>
        <td class="num">${escapeHtml(formatRupees(running))}</td>
        <td class="num"></td>
      </tr>`)
    }

    for (const payment of invoice.payments) {
      running -= payment.amount
      totalReceived += payment.amount
      bodyRows.push(`<tr>
        <td class="keep">${escapeHtml(formatLedgerDate(payment.payment_date))}</td>
        <td class="keep">${escapeHtml(invoice.number)}</td>
        <td class="image"></td>
        <td>${escapeHtml(paymentDescription(payment.method, payment.note))}</td>
        <td class="num"></td>
        <td class="num"></td>
        <td class="num"></td>
        <td class="num">${escapeHtml(formatRupees(running))}</td>
        <td class="num">${escapeHtml(formatRupees(payment.amount))}</td>
      </tr>`)
    }

    bodyRows.push(`<tr class="subtotal">
      <td colspan="6">${escapeHtml(`Subtotal ${invoice.number}`)}</td>
      <td class="num">${escapeHtml(formatRupees(invoice.total))}</td>
      <td class="num">${escapeHtml(formatRupees(running))}</td>
      <td class="num">${escapeHtml(formatRupees(invoice.paid))}</td>
    </tr>`)
  }

  const totalDue = Math.max(0, totalAmount - totalReceived)
  const tableBody =
    bodyRows.length > 0
      ? bodyRows.join('')
      : `<tr><td colspan="9">No unpaid or partially paid invoices.</td></tr>`

  return `<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src data:; style-src 'unsafe-inline'" />
    <title>${escapeHtml(`${data.client.name} ledger`)}</title>
    <style>
      @page { size: A4; margin: 12mm; }
      * { box-sizing: border-box; }
      body { margin: 0; color: #111; background: #fff; font: 11px/1.4 "Segoe UI", sans-serif; }
      h1 { margin: 0 0 12px; font-size: 22px; font-weight: 700; }
      .meta { margin: 0 0 4px; }
      table { width: 100%; margin-top: 16px; border-collapse: collapse; }
      th, td { padding: 5px 6px; border-bottom: 1px solid #ccc; text-align: left; vertical-align: middle; }
      th { font-size: 10px; color: #444; }
      td.num, th.num { text-align: right; white-space: nowrap; }
      td.keep, th.keep { white-space: nowrap; }
      td.image { width: 48px; }
      img { width: 40px; height: 40px; object-fit: cover; }
      tr.subtotal td { font-weight: 700; border-bottom: 2px solid #999; background: #f5f5f5; }
      .totals { margin: 16px 0 0; text-align: right; font-size: 13px; }
      .totals p { margin: 0 0 4px; font-weight: 700; }
    </style>
  </head>
  <body>
    <h1>credex</h1>
    <p class="meta"><strong>${escapeHtml(data.client.name)}</strong></p>
    ${phone}
    <p class="meta">Client ledger</p>
    <table>
      <thead>
        <tr>
          <th class="keep">Date</th>
          <th class="keep">Invoice</th>
          <th>Image</th>
          <th>Description</th>
          <th class="num">Rate/Unit</th>
          <th class="num">Qty/Unit</th>
          <th class="num">Amount</th>
          <th class="num">Balance</th>
          <th class="num">Received</th>
        </tr>
      </thead>
      <tbody>${tableBody}</tbody>
    </table>
    <div class="totals">
      <p>Total Balance ${escapeHtml(formatRupees(totalAmount))}</p>
      <p>Total Received ${escapeHtml(formatRupees(totalReceived))}</p>
      <p>Total Due ${escapeHtml(formatRupees(totalDue))}</p>
    </div>
  </body>
</html>`
}

export async function exportClientLedgerPdf(
  db: Database.Database,
  clientId: string
): Promise<ExportInvoicePdfResult> {
  const data = getClientLedgerData(db, clientId)
  const dir = assertExportsDirWritable()

  const htmlPath = join(tempDir(), `credex-ledger-${randomUUID()}.html`)
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
    writeFileSync(htmlPath, renderLedgerHtml(data), 'utf8')
    await win.loadFile(htmlPath)
    const pdf = await win.webContents.printToPDF({
      pageSize: 'A4',
      printBackground: true,
      preferCSSPageSize: true
    })
    const filePath = uniqueFilePath(dir, ledgerPdfBasename(data.client.name), existsSync)
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
