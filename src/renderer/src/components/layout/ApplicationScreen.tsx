import { Outlet } from 'react-router'
import { useScreenHandle } from '@renderer/components/layout/useScreenHandle'
import { WindowControls } from '@renderer/components/layout/WindowControls'
import styles from './ApplicationScreen.module.css'

export function ApplicationScreen(): React.JSX.Element {
  const { title } = useScreenHandle()

  return (
    <div className={styles.screen}>
      <header className={styles.toolbar}>
        <h1 className={styles.title}>{title}</h1>
        <WindowControls />
      </header>
      <main id="app-content" className={styles.content} tabIndex={-1}>
        <Outlet />
      </main>
    </div>
  )
}
