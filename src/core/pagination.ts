/** Default rows per page for list tables. */
export const TABLE_PAGE_SIZE = 20

export function tablePageCount(total: number, pageSize = TABLE_PAGE_SIZE): number {
  if (!Number.isFinite(total) || total <= 0) return 1
  if (!Number.isFinite(pageSize) || pageSize <= 0) return 1
  return Math.ceil(total / pageSize)
}

export function clampTablePage(page: number, total: number, pageSize = TABLE_PAGE_SIZE): number {
  const pages = tablePageCount(total, pageSize)
  if (!Number.isFinite(page) || page < 1) return 1
  return Math.min(Math.floor(page), pages)
}

export function tablePageRange(
  page: number,
  total: number,
  pageSize = TABLE_PAGE_SIZE
): { from: number; to: number } {
  if (total <= 0) return { from: 0, to: 0 }
  const safe = clampTablePage(page, total, pageSize)
  const from = (safe - 1) * pageSize + 1
  const to = Math.min(safe * pageSize, total)
  return { from, to }
}

export function sliceTablePage<T>(
  items: readonly T[],
  page: number,
  pageSize = TABLE_PAGE_SIZE
): T[] {
  const safe = clampTablePage(page, items.length, pageSize)
  const start = (safe - 1) * pageSize
  return items.slice(start, start + pageSize)
}

export type TablePageItem = number | 'ellipsis'

/** Compact page list: 1 … 4 5 6 … 225 */
export function tablePageItems(
  page: number,
  total: number,
  pageSize = TABLE_PAGE_SIZE
): TablePageItem[] {
  const totalPages = tablePageCount(total, pageSize)
  const current = clampTablePage(page, total, pageSize)
  if (totalPages <= 7) {
    return Array.from({ length: totalPages }, (_, index) => index + 1)
  }

  const pages = new Set<number>([1, totalPages, current])
  for (const offset of [-1, 1]) {
    const neighbor = current + offset
    if (neighbor >= 1 && neighbor <= totalPages) pages.add(neighbor)
  }
  if (current <= 3) {
    pages.add(2)
    pages.add(3)
  }
  if (current >= totalPages - 2) {
    pages.add(totalPages - 1)
    pages.add(totalPages - 2)
  }

  const sorted = [...pages].sort((a, b) => a - b)
  const items: TablePageItem[] = []
  for (let i = 0; i < sorted.length; i += 1) {
    if (i > 0 && sorted[i]! - sorted[i - 1]! > 1) items.push('ellipsis')
    items.push(sorted[i]!)
  }
  return items
}
