import { useEffect, useRef } from 'react'
import { ApplicationScreen } from '@renderer/components/layout/ApplicationScreen'
import { Sidebar } from '@renderer/components/layout/Sidebar'
import { useScreenHandle } from '@renderer/components/layout/useScreenHandle'
import { useSidebar } from '@renderer/components/layout/useSidebar'
import styles from './AppShell.module.css'

function isTypingTarget(target: EventTarget | null): boolean {
  return (
    target instanceof HTMLInputElement ||
    target instanceof HTMLTextAreaElement ||
    target instanceof HTMLSelectElement ||
    (target instanceof HTMLElement && target.isContentEditable)
  )
}

export function AppShell(): React.JSX.Element {
  const { open, toggle } = useSidebar()
  const { title } = useScreenHandle()
  const sidebarRef = useRef<HTMLElement>(null)

  useEffect(() => {
    document.title = title === 'CredEx' ? 'CredEx' : `${title} · CredEx`
  }, [title])

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key.toLowerCase() !== 'b') return
      if (!event.ctrlKey && !event.metaKey) return
      if (event.altKey || event.shiftKey) return
      if (isTypingTarget(event.target)) return

      event.preventDefault()
      toggle()
    }

    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [toggle])

  return (
    <div className={styles.shell}>
      <button
        type="button"
        className={styles.skip}
        onClick={() => document.getElementById('app-content')?.focus()}
      >
        Skip to content
      </button>
      <Sidebar open={open} onToggle={toggle} sidebarRef={sidebarRef} />
      <ApplicationScreen />
    </div>
  )
}
