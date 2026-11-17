import { useEffect, useState } from 'react'
import { Page } from '@renderer/components/layout/Page'
import { Button } from '@renderer/components/ui/Button'
import styles from './HomePage.module.css'

type AppInfo = Awaited<ReturnType<Window['api']['info']>>

export function HomePage(): React.JSX.Element {
  const [info, setInfo] = useState<AppInfo | null>(null)
  const [infoError, setInfoError] = useState(false)
  const [status, setStatus] = useState('')

  useEffect(() => {
    const loadInfo = window.api?.info
    if (!loadInfo) return

    let active = true
    loadInfo().then(
      (value) => {
        if (active) setInfo(value)
      },
      () => {
        if (active) setInfoError(true)
      }
    )

    return () => {
      active = false
    }
  }, [])

  useEffect(() => window.api?.onUpdateStatus(setStatus), [])

  const unavailable = infoError || !window.api?.info
  const version = info ? info.version : unavailable ? 'Unavailable' : 'Loading…'
  const schema = info ? String(info.schema) : unavailable ? 'Unavailable' : 'Loading…'

  return (
    <Page>
      <section className={styles.card} aria-labelledby="app-status-heading">
        <h2 id="app-status-heading" className={styles.heading}>
          Status
        </h2>
        <dl className={styles.meta}>
          <dt>Version</dt>
          <dd>{version}</dd>
          <dt>Database schema</dt>
          <dd>{schema}</dd>
        </dl>
        <div className={styles.actions}>
          <Button
            variant="primary"
            disabled={!window.api?.checkUpdates}
            onClick={() => void window.api.checkUpdates()}
          >
            Check for updates
          </Button>
          {status.includes('ready') ? (
            <Button
              disabled={!window.api?.installUpdate}
              onClick={() => void window.api.installUpdate()}
            >
              Restart and update
            </Button>
          ) : null}
        </div>
        <p role="status" className={styles.status}>
          {status}
        </p>
      </section>
    </Page>
  )
}
