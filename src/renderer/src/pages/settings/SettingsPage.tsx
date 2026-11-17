import { Page } from '@renderer/components/layout/Page'
import { useTheme } from '@renderer/theme'
import styles from './SettingsPage.module.css'

export function SettingsPage(): React.JSX.Element {
  const { theme, setTheme } = useTheme()
  const light = theme === 'light'

  return (
    <Page fullWidth>
      <section className={styles.card} aria-labelledby="theme-heading">
        <div className={styles.row}>
          <div className={styles.copy}>
            <h2 id="theme-heading" className={styles.heading}>
              Theme
            </h2>
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
    </Page>
  )
}
