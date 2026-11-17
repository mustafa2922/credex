import { Link } from 'react-router'
import { Page } from '@renderer/components/layout/Page'
import styles from './NotFoundPage.module.css'

export function NotFoundPage(): React.JSX.Element {
  return (
    <Page>
      <p className={styles.text}>This screen does not exist.</p>
      <Link className={styles.link} to="/">
        Go to Home
      </Link>
    </Page>
  )
}
