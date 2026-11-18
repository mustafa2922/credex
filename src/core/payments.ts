// Invoice payment totals are integer paisa. Paid status is derived, never stored.

const MAX_SAFE = BigInt(Number.MAX_SAFE_INTEGER)

export type PaymentStatus = 'unpaid' | 'partial' | 'paid'

function assertSafeInteger(value: number, message: string): void {
  if (!Number.isSafeInteger(value)) throw new Error(message)
}

/** Sum of active payment amounts. Voided payments are not included by the caller. */
export function sumActivePaymentsPaisa(amounts: readonly number[]): number {
  let sum = 0n
  for (const amount of amounts) {
    assertSafeInteger(amount, 'Payment amount is invalid')
    if (amount <= 0) throw new Error('Payment amount must be greater than zero')
    sum += BigInt(amount)
  }
  if (sum > MAX_SAFE) throw new Error('Payments total is too large')
  return Number(sum)
}

/** Due amount for an issued invoice. Never negative. */
export function invoiceDuePaisa(totalPaisa: number, paidPaisa: number): number {
  assertSafeInteger(totalPaisa, 'Invoice total is invalid')
  assertSafeInteger(paidPaisa, 'Paid amount is invalid')
  if (totalPaisa < 0) throw new Error('Invoice total is invalid')
  if (paidPaisa < 0) throw new Error('Paid amount is invalid')
  return Math.max(0, totalPaisa - paidPaisa)
}

/** Derived payment status from total and paid. */
export function paymentStatusFromAmounts(totalPaisa: number, paidPaisa: number): PaymentStatus {
  assertSafeInteger(totalPaisa, 'Invoice total is invalid')
  assertSafeInteger(paidPaisa, 'Paid amount is invalid')
  if (totalPaisa < 0) throw new Error('Invoice total is invalid')
  if (paidPaisa < 0) throw new Error('Paid amount is invalid')
  if (paidPaisa <= 0) return 'unpaid'
  if (paidPaisa >= totalPaisa) return 'paid'
  return 'partial'
}

/**
 * Paid/due for an invoice. Draft and void invoices are not payable:
 * paid and due are always 0.
 */
export function invoicePaidAndDue(
  status: 'draft' | 'issued' | 'void',
  totalPaisa: number,
  activePaymentsSum: number
): { paid: number; due: number; paymentStatus: PaymentStatus } {
  assertSafeInteger(totalPaisa, 'Invoice total is invalid')
  assertSafeInteger(activePaymentsSum, 'Paid amount is invalid')
  if (totalPaisa < 0) throw new Error('Invoice total is invalid')
  if (activePaymentsSum < 0) throw new Error('Paid amount is invalid')

  if (status !== 'issued') {
    return { paid: 0, due: 0, paymentStatus: 'unpaid' }
  }

  const paid = activePaymentsSum
  const due = invoiceDuePaisa(totalPaisa, paid)
  return {
    paid,
    due,
    paymentStatus: paymentStatusFromAmounts(totalPaisa, paid)
  }
}

/** Reject a payment that is not a positive amount within the current due. */
export function assertPaymentWithinDue(amountPaisa: number, duePaisa: number): void {
  assertSafeInteger(amountPaisa, 'Payment amount is invalid')
  assertSafeInteger(duePaisa, 'Due amount is invalid')
  if (amountPaisa <= 0) throw new Error('Amount must be greater than zero')
  if (duePaisa < 0) throw new Error('Due amount is invalid')
  if (amountPaisa > duePaisa) {
    throw new Error('Amount exceeds the invoice due')
  }
}

/** Client balance is the sum of dues across the client's issued invoices. */
export function clientBalancePaisa(invoiceDues: readonly number[]): number {
  let sum = 0n
  for (const due of invoiceDues) {
    assertSafeInteger(due, 'Due amount is invalid')
    if (due < 0) throw new Error('Due amount is invalid')
    sum += BigInt(due)
  }
  if (sum > MAX_SAFE) throw new Error('Client balance is too large')
  return Number(sum)
}
