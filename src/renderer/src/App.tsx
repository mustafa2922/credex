import { useEffect, useState } from 'react'
import { RouterProvider } from 'react-router'
import { router } from '@renderer/app/router'
import { DataDirRecoveryPage } from '@renderer/pages/startup/DataDirRecoveryPage'
import type { StartupState } from '../../shared/settings'

export default function App(): React.JSX.Element {
  const [startup, setStartup] = useState<StartupState | null>(null)

  useEffect(() => {
    let active = true
    const load = window.api?.startup
    if (!load) {
      const timer = window.setTimeout(() => {
        if (active) setStartup({ ok: true })
      }, 0)
      return () => {
        active = false
        window.clearTimeout(timer)
      }
    }
    void load().then((state) => {
      if (active) setStartup(state)
    })
    return () => {
      active = false
    }
  }, [])

  if (!startup) {
    return <div style={{ padding: 24, color: 'var(--color-text-muted)' }}>Starting…</div>
  }

  if (!startup.ok) {
    return <DataDirRecoveryPage initial={startup} />
  }

  return <RouterProvider router={router} />
}
