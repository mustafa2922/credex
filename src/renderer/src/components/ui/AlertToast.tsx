import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { Icon } from '@renderer/components/icons/Icon'
import styles from './AlertToast.module.css'

export type AlertTone = 'error' | 'success'

export type AlertToastProps = {
  title: string
  message: string
  tone?: AlertTone
  durationMs?: number
  onClose: () => void
}

export function AlertToast({
  title,
  message,
  tone = 'error',
  durationMs = 5200,
  onClose
}: AlertToastProps): React.JSX.Element {
  const [visible, setVisible] = useState(false)
  const [paused, setPaused] = useState(false)

  useEffect(() => {
    const frame = requestAnimationFrame(() => setVisible(true))
    return () => cancelAnimationFrame(frame)
  }, [])

  useEffect(() => {
    if (!window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
    const timer = window.setTimeout(() => {
      setVisible(false)
      window.setTimeout(onClose, 180)
    }, durationMs)
    return () => window.clearTimeout(timer)
  }, [durationMs, onClose])

  function dismiss(): void {
    setVisible(false)
    window.setTimeout(onClose, 180)
  }

  return createPortal(
    <div
      className={[
        styles.toast,
        styles[tone],
        visible ? styles.visible : null,
        paused ? styles.paused : null
      ]
        .filter(Boolean)
        .join(' ')}
      role="alert"
      aria-live="assertive"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
    >
      <div className={styles.icon} aria-hidden="true">
        {tone === 'success' ? (
          <Icon name="check" width={16} height={16} />
        ) : (
          <span className={styles.bang}>!</span>
        )}
      </div>
      <div className={styles.copy}>
        <p className={styles.title}>{title}</p>
        <p className={styles.message}>{message}</p>
      </div>
      <button type="button" className={styles.close} aria-label="Dismiss" onClick={dismiss}>
        <Icon name="close" width={14} height={14} />
      </button>
      <div className={styles.progressTrack} aria-hidden="true">
        <div
          className={styles.progressBar}
          style={{ animationDuration: `${durationMs}ms` }}
          onAnimationEnd={dismiss}
        />
      </div>
    </div>,
    document.body
  )
}
