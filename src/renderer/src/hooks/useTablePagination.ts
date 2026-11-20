import { useState } from 'react'
import {
  TABLE_PAGE_SIZE,
  clampTablePage,
  sliceTablePage,
  tablePageRange
} from '../../../core/pagination'

export function useTablePagination<T>(
  items: readonly T[],
  resetKey: string | number
): {
  page: number
  setPage: (page: number) => void
  rows: T[]
  total: number
  from: number
  to: number
  pageSize: number
} {
  const [page, setPage] = useState(1)
  const [seenKey, setSeenKey] = useState(resetKey)

  if (resetKey !== seenKey) {
    setSeenKey(resetKey)
    setPage(1)
  }

  const total = items.length
  const safePage = clampTablePage(page, total)
  const rows = sliceTablePage(items, safePage)
  const range = tablePageRange(safePage, total)

  return {
    page: safePage,
    setPage,
    rows,
    total,
    from: range.from,
    to: range.to,
    pageSize: TABLE_PAGE_SIZE
  }
}
