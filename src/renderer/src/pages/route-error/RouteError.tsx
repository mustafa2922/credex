import { isRouteErrorResponse, useRouteError } from 'react-router'
import { Page } from '@renderer/components/layout/Page'
import styles from './RouteError.module.css'

function errorMessage(error: unknown): string {
  if (isRouteErrorResponse(error)) return `${error.status} ${error.statusText}`
  if (error instanceof Error) return error.message
  return 'Something went wrong while opening this screen.'
}

export function RouteError(): React.JSX.Element {
  const error = useRouteError()

  return (
    <Page>
      <h2 className={styles.title}>This screen failed to load</h2>
      <p className={styles.text}>{errorMessage(error)}</p>
    </Page>
  )
}
