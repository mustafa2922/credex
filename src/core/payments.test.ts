import { describe, expect, test } from 'vitest'
import {
  assertPaymentWithinDue,
  clientBalancePaisa,
  invoiceDuePaisa,
  invoicePaidAndDue,
  paymentStatusFromAmounts,
  sumActivePaymentsPaisa
} from './payments'

describe('sumActivePaymentsPaisa', () => {
  test('sums active payment amounts', () => {
    expect(sumActivePaymentsPaisa([])).toBe(0)
    expect(sumActivePaymentsPaisa([100, 250])).toBe(350)
  })

  test('rejects non-positive amounts', () => {
    expect(() => sumActivePaymentsPaisa([0])).toThrow(/greater than zero/)
    expect(() => sumActivePaymentsPaisa([-1])).toThrow(/greater than zero/)
  })
})

describe('invoice paid and due', () => {
  test('partial payment leaves a positive due', () => {
    expect(invoiceDuePaisa(10_000, 2_500)).toBe(7_500)
    expect(paymentStatusFromAmounts(10_000, 2_500)).toBe('partial')
    expect(invoicePaidAndDue('issued', 10_000, 2_500)).toEqual({
      paid: 2_500,
      due: 7_500,
      paymentStatus: 'partial'
    })
  })

  test('full payment clears the due', () => {
    expect(invoiceDuePaisa(10_000, 10_000)).toBe(0)
    expect(paymentStatusFromAmounts(10_000, 10_000)).toBe('paid')
    expect(invoicePaidAndDue('issued', 10_000, 10_000)).toEqual({
      paid: 10_000,
      due: 0,
      paymentStatus: 'paid'
    })
  })

  test('overpayment still reports due as zero and status paid', () => {
    expect(invoiceDuePaisa(10_000, 12_000)).toBe(0)
    expect(paymentStatusFromAmounts(10_000, 12_000)).toBe('paid')
  })

  test('draft and void invoices are not payable', () => {
    expect(invoicePaidAndDue('draft', 10_000, 0)).toEqual({
      paid: 0,
      due: 0,
      paymentStatus: 'unpaid'
    })
    expect(invoicePaidAndDue('void', 10_000, 5_000)).toEqual({
      paid: 0,
      due: 0,
      paymentStatus: 'unpaid'
    })
  })
})

describe('assertPaymentWithinDue', () => {
  test('rejects a payment that exceeds the current due', () => {
    expect(() => assertPaymentWithinDue(7_501, 7_500)).toThrow(/exceeds the invoice due/)
  })

  test('accepts a payment within the current due', () => {
    expect(() => assertPaymentWithinDue(7_500, 7_500)).not.toThrow()
    expect(() => assertPaymentWithinDue(1, 7_500)).not.toThrow()
  })

  test('rejects a non-positive payment amount', () => {
    expect(() => assertPaymentWithinDue(0, 100)).toThrow(/greater than zero/)
  })
})

describe('void restores due', () => {
  test('removing a voided payment from the active sum restores due', () => {
    const total = 10_000
    const before = invoicePaidAndDue('issued', total, sumActivePaymentsPaisa([4_000, 3_000]))
    expect(before).toEqual({ paid: 7_000, due: 3_000, paymentStatus: 'partial' })

    // Void the 3_000 payment: only 4_000 remains active.
    const after = invoicePaidAndDue('issued', total, sumActivePaymentsPaisa([4_000]))
    expect(after).toEqual({ paid: 4_000, due: 6_000, paymentStatus: 'partial' })
  })
})

describe('clientBalancePaisa', () => {
  test('equals total issued minus total active payments across invoices', () => {
    // Client has two issued invoices: 10_000 and 5_000.
    // Active payments: 4_000 on the first, 5_000 on the second.
    const dues = [
      invoiceDuePaisa(10_000, 4_000),
      invoiceDuePaisa(5_000, 5_000)
    ]
    expect(dues).toEqual([6_000, 0])
    expect(clientBalancePaisa(dues)).toBe(6_000)

    const totalIssued = 10_000 + 5_000
    const totalActivePayments = 4_000 + 5_000
    expect(clientBalancePaisa(dues)).toBe(totalIssued - totalActivePayments)
  })
})
