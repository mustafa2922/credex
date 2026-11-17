import { useEffect, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import styles from './Modal.module.css'

type ModalProps = {
  labelledBy: string
  children: ReactNode
  busy?: boolean
  onClose: () => void
}

export function Modal({
  labelledBy,
  children,
  busy = false,
  onClose
}: ModalProps): React.JSX.Element {
  useEffect(() => {
    const { overflow } = document.body.style
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = overflow
    }
  }, [])

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape' && !busy) {
        onClose()
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [busy, onClose])

  function handleBackdropClick(): void {
    if (!busy) {
      onClose()
    }
  }

  return createPortal(
    <div className={styles.backdrop} role="presentation" onClick={handleBackdropClick}>
      <div
        className={styles.panel}
        role="dialog"
        aria-modal="true"
        aria-labelledby={labelledBy}
        onClick={(event) => event.stopPropagation()}
      >
        {children}
      </div>
    </div>,
    document.body
  )
}