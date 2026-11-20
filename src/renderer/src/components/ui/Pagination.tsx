import { Icon } from '@renderer/components/icons/Icon'
import { tablePageCount, tablePageItems } from '../../../../core/pagination'
import styles from './Pagination.module.css'

export type PaginationProps = {
  page: number
  total: number
  pageSize: number
  onPageChange: (page: number) => void
}

export function Pagination({
  page,
  total,
  pageSize,
  onPageChange
}: PaginationProps): React.JSX.Element | null {
  if (total <= 0) return null

  const totalPages = tablePageCount(total, pageSize)
  const from = (page - 1) * pageSize + 1
  const to = Math.min(page * pageSize, total)
  const items = tablePageItems(page, total, pageSize)

  return (
    <div className={styles.bar} role="navigation" aria-label="Table pagination">
      <p className={styles.summary}>
        Showing{' '}
        <strong>
          {from}-{to}
        </strong>{' '}
        of <strong>{total}</strong>
      </p>
      <div className={styles.controls}>
        <button
          type="button"
          className={styles.navButton}
          aria-label="Previous page"
          disabled={page <= 1}
          onClick={() => onPageChange(page - 1)}
        >
          <Icon name="chevronLeft" />
        </button>
        {items.map((item, index) =>
          item === 'ellipsis' ? (
            <span key={`e-${index}`} className={styles.ellipsis} aria-hidden>
              …
            </span>
          ) : (
            <button
              key={item}
              type="button"
              className={
                item === page ? `${styles.pageButton} ${styles.active}` : styles.pageButton
              }
              aria-label={`Page ${item}`}
              aria-current={item === page ? 'page' : undefined}
              onClick={() => onPageChange(item)}
            >
              {item}
            </button>
          )
        )}
        <button
          type="button"
          className={styles.navButton}
          aria-label="Next page"
          disabled={page >= totalPages}
          onClick={() => onPageChange(page + 1)}
        >
          <Icon name="chevronRight" />
        </button>
      </div>
    </div>
  )
}
