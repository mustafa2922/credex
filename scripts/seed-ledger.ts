/**
 * Dev-only ledger seed. Kept outside the app modules.
 * Run: npm run seed:ledger
 *
 * Uses the same service + schema layer as IPC (not raw SQL inserts).
 */
import { app, nativeImage } from 'electron'
import { join } from 'path'
import type Database from 'better-sqlite3'
import { openDb } from '../src/main/db'
import { storeInvoiceImageFromBytes } from '../src/main/files/images'
import { createClient, listClients } from '../src/main/modules/clients/service'
import { createClientSchema } from '../src/main/modules/clients/schemas'
import { issueInvoice, saveInvoice } from '../src/main/modules/invoices/service'
import { saveInvoiceSchema } from '../src/main/modules/invoices/schemas'
import { createPayment } from '../src/main/modules/payments/service'
import { createPaymentSchema } from '../src/main/modules/payments/schemas'
import { createUnit, listUnits } from '../src/main/modules/units/service'
import { createUnitSchema } from '../src/main/modules/units/schemas'
import { initializePaths } from '../src/main/paths'
import type { PaymentMethod } from '../src/shared/payments'

const SEED_CLIENT_NAME = 'Papa Garments (Seed)'
const INVOICE_COUNT = 120
const LINES_PER_INVOICE = 16
const SAMPLE_IMAGE_COUNT = 12

const DESIGN_NAMES = [
  'Easy Bear',
  'Hip Hop',
  'Floral Mesh',
  'Urban Tiger',
  'Neon Pulse',
  'Desert Rose',
  'Midnight Owl',
  'Cotton Wave',
  'Street King',
  'Pearl Drop',
  'Olive Branch',
  'Skyline Grid',
  'Amber Leaf',
  'Crystal Fox',
  'Mono Stripe',
  'Vintage Crest',
  'Soft Bloom',
  'Iron Script',
  'Lagoon Print',
  'Royal Anchor',
  'Smoke Trail',
  'Cedar Mark',
  'Pixel Hawk',
  'Golden Thread'
] as const

const PAYMENT_NOTES = [
  'Meezan Mohsin',
  'HBL transfer',
  'JazzCash',
  'Cash at shop',
  'Cheque clearing',
  'Bank Alfalah',
  'EasyPaisa'
] as const

const UNIT_NAMES = ['Meter', 'Piece'] as const

type SeedUnit = { id: string; name: string }

function pad2(n: number): string {
  return String(n).padStart(2, '0')
}

function addDays(isoDate: string, days: number): string {
  const [y, m, d] = isoDate.split('-').map(Number)
  const date = new Date(Date.UTC(y, m - 1, d))
  date.setUTCDate(date.getUTCDate() + days)
  return `${date.getUTCFullYear()}-${pad2(date.getUTCMonth() + 1)}-${pad2(date.getUTCDate())}`
}

function makeSampleJpeg(index: number): Uint8Array {
  const size = 160
  const buf = Buffer.alloc(size * size * 4)
  const hue = (index * 47) % 256
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const i = (y * size + x) * 4
      const band = Math.floor(x / 20) % 2 === 0
      // Electron createFromBitmap expects BGRA.
      buf[i] = band ? 40 + ((index * 13) % 180) : 200
      buf[i + 1] = band ? (hue * 2) % 256 : 80
      buf[i + 2] = band ? hue : 255 - hue
      buf[i + 3] = 255
    }
  }
  const image = nativeImage.createFromBitmap(buf, { width: size, height: size })
  if (image.isEmpty()) throw new Error('Failed to create sample image')
  return new Uint8Array(image.toJPEG(85))
}

function ensureUnit(db: Database.Database, name: string): SeedUnit {
  const existing = listUnits(db, { status: 'all' }).find(
    (unit) => unit.name.toLowerCase() === name.toLowerCase()
  )
  if (existing) return { id: existing.id, name: existing.name }
  const created = createUnit(db, createUnitSchema.parse({ name }))
  return { id: created.id, name: created.name }
}

function lineRatePaisa(invoiceIndex: number, lineIndex: number): number {
  const base = 350 + ((invoiceIndex * 7 + lineIndex * 11) % 50) * 10
  return base * 100
}

function lineQtyThousandths(invoiceIndex: number, lineIndex: number): number {
  const whole = 8 + ((invoiceIndex + lineIndex * 3) % 55)
  const frac = (invoiceIndex * lineIndex) % 10
  return whole * 1000 + frac * 100
}

async function seed(db: Database.Database): Promise<void> {
  const already = listClients(db, { status: 'all', search: SEED_CLIENT_NAME }).find(
    (client) => client.name === SEED_CLIENT_NAME
  )
  if (already) {
    throw new Error(
      `Client "${SEED_CLIENT_NAME}" already exists (id ${already.id}). Rename/remove it or use a fresh data folder, then re-run.`
    )
  }

  const units = UNIT_NAMES.map((name) => ensureUnit(db, name))
  console.log(`Units ready: ${units.map((u) => u.name).join(', ')}`)

  const client = createClient(
    db,
    createClientSchema.parse({ name: SEED_CLIENT_NAME, phone: '+92 300 5551212' })
  )
  console.log(`Created client: ${client.name}`)

  console.log(`Storing ${SAMPLE_IMAGE_COUNT} sample images…`)
  const imageNames: string[] = []
  for (let i = 0; i < SAMPLE_IMAGE_COUNT; i += 1) {
    imageNames.push(storeInvoiceImageFromBytes(makeSampleJpeg(i)))
  }

  let issuedCount = 0
  let paymentCount = 0
  let unpaid = 0
  let partial = 0
  let paid = 0
  const startDate = '2025-06-01'

  for (let i = 0; i < INVOICE_COUNT; i += 1) {
    const invoiceDate = addDays(startDate, i * 2)
    const lines = Array.from({ length: LINES_PER_INVOICE }, (_, lineIndex) => {
      const unit = units[lineIndex % units.length]
      return {
        name: DESIGN_NAMES[(i + lineIndex) % DESIGN_NAMES.length],
        image_path: imageNames[(i + lineIndex) % imageNames.length],
        unit_id: unit.id,
        quantity: lineQtyThousandths(i, lineIndex),
        rate: lineRatePaisa(i, lineIndex)
      }
    })

    const draft = saveInvoice(
      db,
      saveInvoiceSchema.parse({
        client_id: client.id,
        invoice_date: invoiceDate,
        lines
      })
    )
    const issued = issueInvoice(db, draft.id)
    issuedCount += 1

    const bucket = i % 5
    const paymentDate = addDays(invoiceDate, 3 + (i % 10))
    const methods: PaymentMethod[] = ['cash', 'cheque', 'online']
    const method = methods[i % methods.length]
    const note = PAYMENT_NOTES[i % PAYMENT_NOTES.length]

    if (bucket === 0) {
      // Fully paid — ledger export should omit these.
      createPayment(
        db,
        createPaymentSchema.parse({
          client_id: client.id,
          invoice_id: issued.id,
          amount: issued.total,
          method,
          payment_date: paymentDate,
          note: `Full — ${note}`
        })
      )
      paymentCount += 1
      paid += 1
    } else if (bucket === 1 || bucket === 2) {
      // Partial: one or two payments totaling under due.
      const first = Math.max(1, Math.floor(issued.total * 0.35))
      createPayment(
        db,
        createPaymentSchema.parse({
          client_id: client.id,
          invoice_id: issued.id,
          amount: first,
          method,
          payment_date: paymentDate,
          note: `Part 1 — ${note}`
        })
      )
      paymentCount += 1

      if (bucket === 2 && issued.total - first > 1) {
        const second = Math.max(1, Math.floor((issued.total - first) * 0.4))
        createPayment(
          db,
          createPaymentSchema.parse({
            client_id: client.id,
            invoice_id: issued.id,
            amount: second,
            method: methods[(i + 1) % methods.length],
            payment_date: addDays(paymentDate, 5),
            note: `Part 2 — ${PAYMENT_NOTES[(i + 1) % PAYMENT_NOTES.length]}`
          })
        )
        paymentCount += 1
      }
      partial += 1
    } else {
      unpaid += 1
    }

    if ((i + 1) % 20 === 0 || i + 1 === INVOICE_COUNT) {
      console.log(`  invoices ${i + 1}/${INVOICE_COUNT}`)
    }
  }

  const refreshed = listClients(db, { status: 'all', search: SEED_CLIENT_NAME }).find(
    (row) => row.id === client.id
  )

  console.log('')
  console.log('Seed complete')
  console.log(`  Client:   ${SEED_CLIENT_NAME}`)
  console.log(`  Invoices: ${issuedCount} (${LINES_PER_INVOICE} lines each)`)
  console.log(`  Payments: ${paymentCount} rows`)
  console.log(`  Status:   unpaid=${unpaid} partial=${partial} paid=${paid}`)
  console.log(`  Balance:  ${refreshed ? refreshed.balance : 'n/a'} paisa`)
  console.log('Open Clients → download ledger on this row to verify.')
}

async function main(): Promise<void> {
  const startup = initializePaths()
  if (!startup.ok) {
    console.error(`Cannot open data folder:\n${startup.path}\n${startup.reason}`)
    app.exit(1)
    return
  }

  console.log(`Seeding into userData: ${app.getPath('userData')}`)
  const db = openDb()
  try {
    await seed(db)
    app.exit(0)
  } catch (error) {
    console.error(error instanceof Error ? error.message : error)
    app.exit(1)
  } finally {
    try {
      db.close()
    } catch {
      // ignore close errors after exit path
    }
  }
}

// Match the app's userData (`%APPDATA%\credex`), not Electron's default (`...\Electron`).
app.setName('credex')
app.setPath('userData', join(app.getPath('appData'), 'credex'))

app
  .whenReady()
  .then(() => void main())
  .catch((error: unknown) => {
    console.error(error)
    app.exit(1)
  })
