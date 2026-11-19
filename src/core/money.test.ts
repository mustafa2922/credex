import { describe, expect, test } from 'vitest'
import {
  formatAmountInput,
  formatPaisa,
  formatQuantityThousandths,
  formatRatePaisa,
  formatRupees,
  invoiceTotalPaisa,
  lineTotalPaisa,
  parseQuantityThousandths,
  parseRatePaisa
} from './money'

describe('parseRatePaisa', () => {
  test('parses rupees with up to 2 decimal places into paisa', () => {
    expect(parseRatePaisa('0')).toBe(0)
    expect(parseRatePaisa('10')).toBe(1000)
    expect(parseRatePaisa('10.5')).toBe(1050)
    expect(parseRatePaisa('10.50')).toBe(1050)
    expect(parseRatePaisa('0.01')).toBe(1)
    expect(parseRatePaisa(' 10.5 ')).toBe(1050)
    expect(parseRatePaisa('1,000')).toBe(100_000)
    expect(parseRatePaisa('1,234.50')).toBe(123_450)
  })

  test('rejects more than 2 decimals, negatives, and blank input', () => {
    expect(() => parseRatePaisa('1.234')).toThrow(/2 decimal/)
    expect(() => parseRatePaisa('-1')).toThrow(/2 decimal/)
    expect(() => parseRatePaisa('')).toThrow(/2 decimal/)
    expect(() => parseRatePaisa('10.')).toThrow(/2 decimal/)
  })
})

describe('formatAmountInput', () => {
  test('inserts Pakistani thousand / lakh / crore separators while typing', () => {
    expect(formatAmountInput('1000')).toBe('1,000')
    expect(formatAmountInput('10000')).toBe('10,000')
    expect(formatAmountInput('100000')).toBe('1,00,000')
    expect(formatAmountInput('1234567')).toBe('12,34,567')
    expect(formatAmountInput('10000000')).toBe('1,00,00,000')
    expect(formatAmountInput('1000.')).toBe('1,000.')
    expect(formatAmountInput('1000.5')).toBe('1,000.5')
    expect(formatAmountInput('1000.50')).toBe('1,000.50')
    expect(formatAmountInput('1,00,000')).toBe('1,00,000')
  })

  test('caps fraction digits at two and ignores junk', () => {
    expect(formatAmountInput('12.345')).toBe('12.34')
    expect(formatAmountInput('12a3b')).toBe('123')
    expect(formatAmountInput('')).toBe('')
  })
})

describe('parseQuantityThousandths', () => {
  test('parses up to 3 decimal places into thousandths', () => {
    expect(parseQuantityThousandths('1')).toBe(1000)
    expect(parseQuantityThousandths('1.5')).toBe(1500)
    expect(parseQuantityThousandths('1.25')).toBe(1250)
    expect(parseQuantityThousandths('0.001')).toBe(1)
    expect(parseQuantityThousandths(' 0.5 ')).toBe(500)
  })

  test('rejects zero, extra decimals, and negatives', () => {
    expect(() => parseQuantityThousandths('0')).toThrow(/greater than zero/)
    expect(() => parseQuantityThousandths('0.000')).toThrow(/greater than zero/)
    expect(() => parseQuantityThousandths('1.2345')).toThrow(/3 decimal/)
    expect(() => parseQuantityThousandths('-1')).toThrow(/3 decimal/)
  })
})

describe('lineTotalPaisa', () => {
  test('rounds half up with integer math', () => {
    expect(lineTotalPaisa(1, 499)).toBe(0)
    expect(lineTotalPaisa(1, 500)).toBe(1)
    expect(lineTotalPaisa(1, 501)).toBe(1)
    expect(lineTotalPaisa(100, 1500)).toBe(150)
    expect(lineTotalPaisa(15000, 2500)).toBe(37500)
    expect(lineTotalPaisa(0, 1000)).toBe(0)
  })

  test('stays exact when the product does not fit in a float', () => {
    const rate = Number.MAX_SAFE_INTEGER
    expect(lineTotalPaisa(rate, 1000)).toBe(rate)
  })

  test('rejects a non-positive quantity and a negative rate', () => {
    expect(() => lineTotalPaisa(-1, 1000)).toThrow(/zero or greater/)
    expect(() => lineTotalPaisa(100, 0)).toThrow(/greater than zero/)
  })
})

describe('invoiceTotalPaisa', () => {
  test('sums line totals, including an empty invoice', () => {
    expect(invoiceTotalPaisa([])).toBe(0)
    expect(invoiceTotalPaisa([37500, 1, 0])).toBe(37501)
  })

  test('rejects an invalid line total', () => {
    expect(() => invoiceTotalPaisa([10, -1])).toThrow(/invalid/)
    expect(() => invoiceTotalPaisa([1.5])).toThrow(/invalid/)
  })
})

describe('formatting', () => {
  test('formats rupees with Pakistani thousand / lakh / crore separators', () => {
    expect(formatPaisa(0)).toBe('0.00')
    expect(formatPaisa(1)).toBe('0.01')
    expect(formatPaisa(100)).toBe('1.00')
    expect(formatPaisa(123456)).toBe('1,234.56')
    expect(formatPaisa(10000000)).toBe('1,00,000.00')
    expect(formatPaisa(123456789)).toBe('12,34,567.89')
    expect(formatPaisa(1000000000)).toBe('1,00,00,000.00')
    expect(formatPaisa(-1050)).toBe('-10.50')
    expect(formatRupees(123456)).toBe('Rs 1,234.56')
    expect(formatRupees(10000000)).toBe('Rs 1,00,000.00')
  })

  test('formats quantity and rate inputs without grouping', () => {
    expect(formatQuantityThousandths(0)).toBe('0')
    expect(formatQuantityThousandths(1000)).toBe('1')
    expect(formatQuantityThousandths(1500)).toBe('1.5')
    expect(formatQuantityThousandths(1)).toBe('0.001')
    expect(formatQuantityThousandths(1010)).toBe('1.01')
    expect(formatRatePaisa(0)).toBe('0.00')
    expect(formatRatePaisa(1050)).toBe('10.50')
  })
})
