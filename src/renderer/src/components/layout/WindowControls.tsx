import { useEffect, useState } from 'react'
import { Icon } from '@renderer/components/icons/Icon'
import styles from './WindowControls.module.css'

export function WindowControls(): React.JSX.Element | null {
  const [maximized, setMaximized] = useState(false)
  const windows = window.api?.platform === 'win32'

  useEffect(() => {
    if (!windows || !window.api) return
    let active = true
    void window.api.isWindowMaximized().then((value) => {
      if (active) setMaximized(value)
    })
    const stop = window.api.onWindowMaximized((value) => {
      if (active) setMaximized(value)
    })
    return () => {
      active = false
      stop()
    }
  }, [windows])

  if (!windows) return null

  return (
    <div className={styles.controls}>
      <button
        type="button"
        className={styles.control}
        aria-label="Minimize"
        onClick={() => window.api.minimizeWindow()}
      >
        <Icon name="minimize" width={14} height={14} />
      </button>
      <button
        type="button"
        className={styles.control}
        aria-label={maximized ? 'Restore' : 'Maximize'}
        onClick={() => window.api.toggleMaximizeWindow()}
      >
        <Icon name={maximized ? 'restore' : 'maximize'} width={14} height={14} />
      </button>
      <button
        type="button"
        className={`${styles.control} ${styles.close}`}
        aria-label="Close"
        onClick={() => window.api.closeWindow()}
      >
        <Icon name="close" width={14} height={14} />
      </button>
    </div>
  )
}
