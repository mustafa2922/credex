import { useEffect, useState } from 'react'
import type { StartupState } from '../../../../shared/settings'
import { Button } from '@renderer/components/ui/Button'
import styles from './DataDirRecoveryPage.module.css'

type Props = {
  initial?: Extract<StartupState, { ok: false }>
}

export function DataDirRecoveryPage({ initial }: Props): React.JSX.Element {
  const [state, setState] = useState<Extract<StartupState, { ok: false }> | null>(initial ?? null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (initial) return
    let active = true
    void window.api?.startup().then((next) => {
      if (!active) return
      if (!next.ok) setState(next)
    })
    return () => {
      active = false
    }
  }, [initial])

  async function retry(): Promise<void> {
    if (!window.api?.retryStartup) return
    setBusy(true)
    try {
      const next = await window.api.retryStartup()
      if (!next.ok) setState(next)
    } finally {
      setBusy(false)
    }
  }

  async function choose(): Promise<void> {
    if (!window.api?.chooseDataDir) return
    setBusy(true)
    try {
      const next = await window.api.chooseDataDir()
      if (!next.ok) setState(next)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className={styles.page}>
      <div className={styles.card}>
        <h1 className={styles.title}>Data folder unavailable</h1>
        <p className={styles.message}>
          CredEx could not open the data folder. A new empty database was not created.
        </p>
        <dl className={styles.meta}>
          <div>
            <dt>Path</dt>
            <dd>{state?.path ?? '…'}</dd>
          </div>
          <div>
            <dt>Reason</dt>
            <dd>{state?.reason ?? 'Loading…'}</dd>
          </div>
        </dl>
        <div className={styles.actions}>
          <Button variant="primary" disabled={busy} onClick={() => void retry()}>
            Retry
          </Button>
          <Button disabled={busy} onClick={() => void choose()}>
            Choose folder
          </Button>
          <Button disabled={busy} onClick={() => void window.api?.quitApp()}>
            Quit
          </Button>
        </div>
      </div>
    </div>
  )
}
