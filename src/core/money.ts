// Rates and totals are integer paisa. Quantity is integer thousandths.
// Line total rounds half up: (rate_paisa * quantity_thousandths) / 1000.

const MAX_SAFE = BigInt(Number.MAX_SAFE_INTEGER)

function assertSafeInteger(value: number, message: string): void {
  if (!Number.isSafeInteger(value)) throw new Error(message)
}

function scaledInteger(text: string, fractionDigits: number): bigint {
  const [whole, fraction = ''] = text.split('.')
  return BigInt(whole + fraction.padEnd(fractionDigits, '0'))
}

/** Parse a rupee amount with up to 2 decimal places into paisa. */
export function parseRatePaisa(input: string): number {
  const text = input.trim()
  if (!/^\d+(?:\.\d{1,2})?$/.test(text)) {
    throw new Error('Rate must be a number with up to 2 decimal places')
  }
  const paisa = scaledInteger(text, 2)
  if (paisa > MAX_SAFE) throw new Error('Rate is too large')
  return Number(paisa)
}

/** Parse a quantity with up to 3 decimal places into thousandths. Must be > 0. */
export function parseQuantityThousandths(input: string): number {
  const text = input.trim()
  if (!/^\d+(?:\.\d{1,3})?$/.test(text)) {
    throw new Error('Quantity must be a number with up to 3 decimal places')
  }
  const thousandths = scaledInteger(text, 3)
  if (thousandths === 0n) throw new Error('Quantity must be greater than zero')
  if (thousandths > MAX_SAFE) throw new Error('Quantity is too large')
  return Number(thousandths)
}

/** Round half up (rate_paisa * quantity_thousandths / 1000) using integer math. */
export function lineTotalPaisa(ratePaisa: number, quantityThousandths: number): number {
  assertSafeInteger(ratePaisa, 'Rate must be zero or greater')
  assertSafeInteger(quantityThousandths, 'Quantity must be greater than zero')
  if (ratePaisa < 0) throw new Error('Rate must be zero or greater')
  if (quantityThousandths <= 0) throw new Error('Quantity must be greater than zero')

  const product = BigInt(ratePaisa) * BigInt(quantityThousandths)
  const quotient = product / 1000n
  const remainder = product % 1000n
  const total = remainder >= 500n ? quotient + 1n : quotient
  if (total > MAX_SAFE) throw new Error('Line total is too large')
  return Number(total)
}

/** Sum line totals. An invoice with no lines totals 0. */
export function invoiceTotalPaisa(lineTotals: readonly number[]): number {
  let sum = 0n
  for (const total of lineTotals) {
    assertSafeInteger(total, 'Line total is invalid')
    if (total < 0) throw new Error('Line total is invalid')
    sum += BigInt(total)
  }
  if (sum > MAX_SAFE) throw new Error('Invoice total is too large')
  return Number(sum)
}

/** Format paisa as rupees with a thousands separator and 2 decimal places. */
export function formatPaisa(paisa: number): string {
  assertSafeInteger(paisa, 'Amount is invalid')
  const negative = paisa < 0
  const value = negative ? -BigInt(paisa) : BigInt(paisa)
  const rupees = (value / 100n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',')
  const fraction = (value % 100n).toString().padStart(2, '0')
  return `${negative ? '-' : ''}${rupees}.${fraction}`
}

/** Format paisa for display, prefixed with Rs. */
export function formatRupees(paisa: number): string {
  return `Rs ${formatPaisa(paisa)}`
}

/** Format thousandths for an input or a quantity column. Trailing zeros are dropped. */
export function formatQuantityThousandths(thousandths: number): string {
  assertSafeInteger(thousandths, 'Quantity is invalid')
  if (thousandths < 0) throw new Error('Quantity is invalid')
  const value = BigInt(thousandths)
  const whole = (value / 1000n).toString()
  const fraction = value % 1000n
  if (fraction === 0n) return whole
  return `${whole}.${fraction.toString().padStart(3, '0').replace(/0+$/, '')}`
}

/** Format paisa as a rupee input with 2 decimal places and no thousands separator. */
export function formatRatePaisa(paisa: number): string {
  assertSafeInteger(paisa, 'Rate is invalid')
  if (paisa < 0) throw new Error('Rate is invalid')
  const value = BigInt(paisa)
  const fraction = (value % 100n).toString().padStart(2, '0')
  return `${(value / 100n).toString()}.${fraction}`
}
