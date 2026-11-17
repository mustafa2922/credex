import styles from './ScreenFallback.module.css'

export function ScreenFallback(): React.JSX.Element {
  return (
    <p className={styles.fallback} role="status">
      Loading…
    </p>
  )
}
