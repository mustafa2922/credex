import { describe, expect, it } from 'vitest'
import {
  TABLE_PAGE_SIZE,
  clampTablePage,
  sliceTablePage,
  tablePageCount,
  tablePageItems,
  tablePageRange
} from './pagination'

describe('tablePageCount', () => {
  it('returns at least one page', () => {
    expect(tablePageCount(0)).toBe(1)
    expect(tablePageCount(-1)).toBe(1)
  })

  it('ceil-divides by page size', () => {
    expect(tablePageCount(20)).toBe(1)
    expect(tablePageCount(21)).toBe(2)
    expect(tablePageCount(100, 20)).toBe(5)
  })
})

describe('clampTablePage', () => {
  it('keeps page within bounds', () => {
    expect(clampTablePage(0, 50)).toBe(1)
    expect(clampTablePage(99, 50)).toBe(3)
    expect(clampTablePage(2, 50)).toBe(2)
  })
})

describe('tablePageRange', () => {
  it('reports inclusive 1-based bounds', () => {
    expect(tablePageRange(1, 45)).toEqual({ from: 1, to: 20 })
    expect(tablePageRange(3, 45)).toEqual({ from: 41, to: 45 })
    expect(tablePageRange(1, 0)).toEqual({ from: 0, to: 0 })
  })
})

describe('sliceTablePage', () => {
  it('slices twenty items by default', () => {
    const items = Array.from({ length: 45 }, (_, i) => i + 1)
    expect(sliceTablePage(items, 1)).toEqual(items.slice(0, TABLE_PAGE_SIZE))
    expect(sliceTablePage(items, 3)).toEqual(items.slice(40, 45))
  })
})

describe('tablePageItems', () => {
  it('lists every page when few', () => {
    expect(tablePageItems(1, 60)).toEqual([1, 2, 3])
  })

  it('inserts ellipses for large sets', () => {
    expect(tablePageItems(1, 3365)).toEqual([1, 2, 3, 'ellipsis', 169])
    expect(tablePageItems(5, 3365)).toEqual([1, 'ellipsis', 4, 5, 6, 'ellipsis', 169])
    expect(tablePageItems(169, 3365)).toEqual([1, 'ellipsis', 167, 168, 169])
  })
})
