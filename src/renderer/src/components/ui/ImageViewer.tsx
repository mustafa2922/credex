import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { Icon } from '@renderer/components/icons/Icon'
import styles from './ImageViewer.module.css'

type ImageViewerProps = {
  images: string[]
  initialIndex?: number
  title?: string
  onClose: () => void
}

export function ImageViewer({
  images,
  initialIndex = 0,
  title = 'Attachment',
  onClose
}: ImageViewerProps): React.JSX.Element | null {
  const count = images.length
  const [index, setIndex] = useState(() =>
    count === 0 ? 0 : Math.min(Math.max(initialIndex, 0), count - 1)
  )

  useEffect(() => {
    const { overflow } = document.body.style
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = overflow
    }
  }, [])

  useEffect(() => {
    if (count === 0) return
    setIndex((current) => Math.min(Math.max(current, 0), count - 1))
  }, [count])

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent): void {
      if (event.key === 'Escape') {
        event.preventDefault()
        onClose()
        return
      }
      if (count <= 1) return
      if (event.key === 'ArrowLeft') {
        event.preventDefault()
        setIndex((current) => (current - 1 + count) % count)
      } else if (event.key === 'ArrowRight') {
        event.preventDefault()
        setIndex((current) => (current + 1) % count)
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [count, onClose])

  if (count === 0) return null

  const src = images[index]
  const multi = count > 1

  return createPortal(
    <div className={styles.backdrop} role="presentation" onClick={onClose}>
      <div
        className={styles.panel}
        role="dialog"
        aria-modal="true"
        aria-labelledby="image-viewer-title"
        onClick={(event) => event.stopPropagation()}
      >
        <div className={styles.header}>
          <h2 id="image-viewer-title" className={styles.title}>
            {title}
            {multi ? (
              <span className={styles.counter}>
                {index + 1} / {count}
              </span>
            ) : null}
          </h2>
          <button
            type="button"
            className={styles.close}
            aria-label="Close"
            onClick={onClose}
          >
            <Icon name="close" width={16} height={16} />
          </button>
        </div>

        <div className={styles.stage}>
          {multi ? (
            <button
              type="button"
              className={styles.nav}
              aria-label="Previous image"
              onClick={() => setIndex((current) => (current - 1 + count) % count)}
            >
              <Icon name="chevronLeft" width={18} height={18} />
            </button>
          ) : (
            <span className={styles.navSpacer} aria-hidden />
          )}

          <div className={styles.frame}>
            <img className={styles.image} src={src} alt="" />
          </div>

          {multi ? (
            <button
              type="button"
              className={styles.nav}
              aria-label="Next image"
              onClick={() => setIndex((current) => (current + 1) % count)}
            >
              <Icon name="chevronRight" width={18} height={18} />
            </button>
          ) : (
            <span className={styles.navSpacer} aria-hidden />
          )}
        </div>
      </div>
    </div>,
    document.body
  )
}
