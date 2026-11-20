import { formatPaisaParts, formatRupees } from '../../../../core/money'
import styles from './Money.module.css'

type MoneyProps = {
  /** Integer paisa. `null`/`undefined` renders an empty placeholder. */
  paisa: number | null | undefined
  /** Include the `Rs` prefix. Default true. */
  currency?: boolean
  className?: string
}

/**
 * Display money with a prominent whole part and a muted decimal part.
 * Use everywhere amounts are shown in the UI (tables, KPIs, summaries).
 * Keep plain `formatRupees` for strings (toasts, select labels, errors).
 */
export function Money({ paisa, currency = true, className }: MoneyProps): React.JSX.Element {
  if (paisa == null) {
    return <span className={[styles.root, styles.empty, className].filter(Boolean).join(' ')} />
  }

  const { sign, whole, fraction } = formatPaisaParts(paisa)
  const rootClass = [styles.root, className].filter(Boolean).join(' ')

  return (
    <span className={rootClass} aria-label={formatRupees(paisa)}>
      {currency ? <span className={styles.currency}>Rs </span> : null}
      <span className={styles.whole}>
        {sign}
        {whole}
      </span>
      <span className={styles.fraction}>.{fraction}</span>
    </span>
  )
}
