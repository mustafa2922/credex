import { useEffect, useState } from 'react'

export default function App(): React.JSX.Element {
  const [info, setInfo] = useState<{ version: string; schema: number }>()
  const [status, setStatus] = useState('')
  useEffect(() => {
    window.api.info().then(setInfo)
    return window.api.onUpdateStatus(setStatus)
  }, [])
  return (
    <div style={{ padding: 32, fontFamily: 'system-ui' }}>
      <h1>Welcome to Credex</h1>
      <p>Version {info?.version} · DB schema {info?.schema}</p>
      <button onClick={() => window.api.checkUpdates()}>Check for updates</button>{' '}
      {status.includes('ready') && <button onClick={() => window.api.installUpdate()}>Restart & update</button>}
      <p>{status}</p>
    </div>
  )
}