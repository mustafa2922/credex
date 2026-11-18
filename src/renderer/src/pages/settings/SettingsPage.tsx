import { useEffect, useState } from 'react'
import { Page } from '@renderer/components/layout/Page'
import { Button } from '@renderer/components/ui/Button'
import { useTheme } from '@renderer/theme'
import styles from './SettingsPage.module.css'

type AppInfo = Awaited<ReturnType<Window['api']['info']>>

export function SettingsPage(): React.JSX.Element {
  const { theme, setTheme } = useTheme()
  const light = theme === 'light'
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
    <Page fullWidth hideDescription>
      <div className={styles.pageHeading}>
        <h2 className={styles.pageTitle}>Settings</h2>
        <p className={styles.pageSubtitle}>Appearance and application status.</p>
      </div>

      <div className={styles.stack}>
        <section className={styles.card} aria-labelledby="theme-heading">
          <div className={styles.row}>
            <div className={styles.copy}>
              <h3 id="theme-heading" className={styles.heading}>
                Theme
              </h3>
              <p className={styles.hint}>Dark or light appearance.</p>
            </div>
            <div className={styles.control}>
              <button
                type="button"
                className={styles.choice}
                aria-pressed={!light}
                onClick={() => setTheme('dark')}
              >
                Dark
              </button>
              <button
                type="button"
                className={styles.switch}
                role="switch"
                aria-checked={light}
                aria-label="Light theme"
                onClick={() => setTheme(light ? 'dark' : 'light')}
              >
                <span className={styles.knob} />
              </button>
              <button
                type="button"
                className={styles.choice}
                aria-pressed={light}
                onClick={() => setTheme('light')}
              >
                Light
              </button>
            </div>
          </div>
        </section>

        <section className={styles.card} aria-labelledby="status-heading">
          <h3 id="status-heading" className={styles.heading}>
            Status
          </h3>
          <p className={styles.hint}>Application version and updates.</p>
          <dl className={styles.meta}>
            <div className={styles.metaRow}>
              <dt>Version</dt>
              <dd>{version}</dd>
            </div>
            <div className={styles.metaRow}>
              <dt>Database schema</dt>
              <dd>{schema}</dd>
            </div>
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
          {status ? (
            <p role="status" className={styles.status}>
              {status}
            </p>
          ) : null}
        </section>
      </div>
    </Page>
  )
}
