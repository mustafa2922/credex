import { useCallback, useEffect, useState } from 'react'
import type { SettingsSnapshot } from '../../../../shared/settings'
import { Page } from '@renderer/components/layout/Page'
import { AlertToast, type AlertTone } from '@renderer/components/ui/AlertToast'
import { Button } from '@renderer/components/ui/Button'
import { useTheme } from '@renderer/theme'
import styles from './SettingsPage.module.css'

function formatBytes(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return '—'
  if (value < 1024) return `${value} B`
  const units = ['KB', 'MB', 'GB', 'TB']
  let size = value / 1024
  let index = 0
  while (size >= 1024 && index < units.length - 1) {
    size /= 1024
    index += 1
  }
  return `${size.toFixed(size >= 10 ? 0 : 1)} ${units[index]}`
}

function statusLabel(status: string): string {
  if (status === 'ok') return 'OK'
  if (status === 'missing') return 'Missing'
  if (status === 'not_writable') return 'Not writable'
  return 'Not set'
}

function statusClass(status: string): string {
  if (status === 'ok') return styles.chipOk
  if (status === 'not_set') return styles.chipMuted
  return styles.chipBad
}

export function SettingsPage(): React.JSX.Element {
  const { theme, setTheme } = useTheme()
  const light = theme === 'light'
  const [snap, setSnap] = useState<SettingsSnapshot | null>(null)
  const [loadError, setLoadError] = useState('')
  const [status, setStatus] = useState('')
  const [busy, setBusy] = useState(false)
  const [alert, setAlert] = useState<{
    id: number
    title: string
    message: string
    tone: AlertTone
  } | null>(null)
  const showAlert = useCallback((message: string, title: string, tone: AlertTone): void => {
    setAlert((prev) => ({ id: (prev?.id ?? 0) + 1, title, message, tone }))
  }, [])

  const refresh = useCallback(async (): Promise<void> => {
    if (!window.api?.settings) {
      setLoadError('Settings are unavailable')
      return
    }
    try {
      const next = await window.api.settings.get()
      setSnap(next)
      setLoadError('')
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : 'Could not load settings')
    }
  }, [])

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void refresh()
    }, 0)
    return () => window.clearTimeout(timer)
  }, [refresh])

  useEffect(() => window.api?.onUpdateStatus(setStatus), [])

  async function changeExports(): Promise<void> {
    if (!window.api?.settings) return
    const picked = await window.api.settings.pickDirectory('Choose exports folder')
    if (!picked) return
    setBusy(true)
    try {
      const next = await window.api.settings.changeExportsDir({ path: picked })
      setSnap(next)
      showAlert('Exports folder updated.', 'Success', 'success')
    } catch (error) {
      showAlert(
        error instanceof Error ? error.message : 'Could not change exports folder',
        'Settings',
        'error'
      )
    } finally {
      setBusy(false)
    }
  }

  async function changeBackups(): Promise<void> {
    if (!window.api?.settings) return
    const picked = await window.api.settings.pickDirectory('Choose backup folder')
    if (!picked) return
    setBusy(true)
    try {
      try {
        const next = await window.api.settings.changeBackupDir({ path: picked })
        setSnap(next)
        showAlert('Backup folder updated.', 'Success', 'success')
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        // Electron wraps IPC errors: "... Error: SAME_DRIVE_CONFIRM"
        if (message.includes('SAME_DRIVE_CONFIRM')) {
          const ok = window.confirm(
            'Backup folder is on the same drive as data. This does not protect against disk failure. Continue?'
          )
          if (!ok) return
          const next = await window.api.settings.changeBackupDir({
            path: picked,
            confirmSameDrive: true
          })
          setSnap(next)
          showAlert('Backup folder updated.', 'Success', 'success')
        } else {
          throw error
        }
      }
    } catch (error) {
      showAlert(
        error instanceof Error ? error.message : 'Could not change backup folder',
        'Settings',
        'error'
      )
    } finally {
      setBusy(false)
    }
  }

  async function changeData(): Promise<void> {
    if (!window.api?.settings) return
    const picked = await window.api.settings.pickDirectory('Choose data folder')
    if (!picked) return
    setBusy(true)
    try {
      const inspection = await window.api.settings.inspectDataDir(picked)
      if (inspection.syncFolder) {
        const ok = window.confirm(
          'This folder looks like a cloud sync location (OneDrive/Dropbox/Google Drive/iCloud). Continue anyway?'
        )
        if (!ok) return
      }

      let mode: 'copy' | 'use_existing' = 'copy'
      if (inspection.hasLedger) {
        const useExisting = window.confirm(
          'This folder already contains ledger.db. Click OK to use this existing data folder, or Cancel to abort.'
        )
        if (!useExisting) return
        mode = 'use_existing'
      } else if (!inspection.empty) {
        showAlert('Target folder must be empty, or contain a valid ledger.db.', 'Settings', 'error')
        return
      } else {
        const ok = window.confirm(
          `Copy all data to:\n${inspection.path}\n\nThe current data folder will not be deleted. Continue?`
        )
        if (!ok) return
      }

      await window.api.settings.changeDataDir({
        targetPath: inspection.path,
        mode,
        confirmSyncFolder: inspection.syncFolder
      })
    } catch (error) {
      showAlert(
        error instanceof Error ? error.message : 'Could not change data folder',
        'Settings',
        'error'
      )
    } finally {
      setBusy(false)
    }
  }

  async function copyDiagnostics(): Promise<void> {
    if (!window.api?.settings) return
    try {
      await window.api.settings.copyDiagnostics()
      showAlert('Diagnostics copied to the clipboard.', 'Success', 'success')
    } catch (error) {
      showAlert(
        error instanceof Error ? error.message : 'Could not copy diagnostics',
        'Settings',
        'error'
      )
    }
  }

  const folders = snap?.folders

  return (
    <Page fullWidth hideDescription>
      <div className={styles.pageHeading}>
        <h2 className={styles.pageTitle}>Settings</h2>
        <p className={styles.pageSubtitle}>Folders, appearance, and application status.</p>
      </div>

      <div className={styles.stack}>
        <section className={styles.card} aria-labelledby="folders-heading">
          <h3 id="folders-heading" className={styles.heading}>
            Folders
          </h3>
          <p className={styles.hint}>
            Data defaults to the app userData folder; exports to Downloads\credex; backups to
            Downloads\credex\backups. Paths are saved in config.json and stay put if defaults change
            later.
          </p>
          {loadError ? <p className={styles.warning}>{loadError}</p> : null}

          {folders ? (
            <div className={styles.folderList}>
              {(
                [
                  { key: 'data', label: 'Data', folder: folders.data, onChange: changeData },
                  {
                    key: 'exports',
                    label: 'Exports',
                    folder: folders.exports,
                    onChange: changeExports
                  },
                  {
                    key: 'backups',
                    label: 'Backups',
                    folder: folders.backups,
                    onChange: changeBackups
                  }
                ] as const
              ).map((row) => (
                <div key={row.key} className={styles.folderRow}>
                  <div className={styles.folderCopy}>
                    <div className={styles.folderTitle}>
                      <span>{row.label}</span>
                      <span className={statusClass(row.folder.status)}>
                        {statusLabel(row.folder.status)}
                      </span>
                    </div>
                    <p className={styles.path}>{row.folder.path ?? 'Not set'}</p>
                    <p className={styles.folderMeta}>
                      Free {formatBytes(row.folder.freeBytes)}
                      {row.key === 'data' ? ` · Size ${formatBytes(row.folder.sizeBytes)}` : ''}
                    </p>
                    {row.folder.warning ? (
                      <p className={styles.warning}>{row.folder.warning}</p>
                    ) : null}
                  </div>
                  <div className={styles.actions}>
                    {row.folder.path ? (
                      <Button
                        disabled={busy}
                        onClick={() =>
                          void window.api?.settings.openPath(row.folder.path as string)
                        }
                      >
                        Open
                      </Button>
                    ) : null}
                    <Button variant="primary" disabled={busy} onClick={() => void row.onChange()}>
                      Change
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          ) : null}
        </section>

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

        <section className={styles.card} aria-labelledby="app-heading">
          <h3 id="app-heading" className={styles.heading}>
            Application
          </h3>
          <p className={styles.hint}>Version, database, diagnostics, and updates.</p>
          <dl className={styles.meta}>
            <div className={styles.metaRow}>
              <dt>Version</dt>
              <dd>{snap?.version ?? '…'}</dd>
            </div>
            <div className={styles.metaRow}>
              <dt>Database schema</dt>
              <dd>{snap ? String(snap.schema) : '…'}</dd>
            </div>
            <div className={styles.metaRow}>
              <dt>Database file</dt>
              <dd>
                {snap?.dbPath ?? '…'}
                {snap ? ` (${formatBytes(snap.dbSizeBytes)})` : ''}
              </dd>
            </div>
            <div className={styles.metaRow}>
              <dt>Config file</dt>
              <dd>{snap?.configPath ?? '…'}</dd>
            </div>
            <div className={styles.metaRow}>
              <dt>Logs</dt>
              <dd>{snap?.logsPath ?? '…'}</dd>
            </div>
          </dl>
          <div className={styles.actions}>
            <Button disabled={busy || !snap} onClick={() => void window.api?.settings.openConfig()}>
              Open config
            </Button>
            <Button disabled={busy || !snap} onClick={() => void window.api?.settings.openLogs()}>
              Open logs
            </Button>
            <Button disabled={busy} onClick={() => void copyDiagnostics()}>
              Copy diagnostics
            </Button>
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

      {alert ? (
        <AlertToast
          key={alert.id}
          title={alert.title}
          message={alert.message}
          tone={alert.tone}
          onClose={() => setAlert(null)}
        />
      ) : null}
    </Page>
  )
}
