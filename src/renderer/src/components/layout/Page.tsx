import type { ReactNode } from 'react'
import { useScreenHandle } from '@renderer/components/layout/useScreenHandle'
import styles from './Page.module.css'

type PageProps = {
  children: ReactNode
  fullWidth?: boolean
  hideDescription?: boolean
}

export function Page({
  children,
  fullWidth = false,
  hideDescription = false
}: PageProps): React.JSX.Element {
  const { description } = useScreenHandle()

  const pageClass = fullWidth ? `${styles.page} ${styles.fullWidth}` : styles.page

  return (
    <div className={pageClass}>
      {!hideDescription && description ? <p className={styles.description}>{description}</p> : null}
      {children}
    </div>
  )
}
