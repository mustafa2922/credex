import { useCallback, useEffect, useState } from 'react'

const STORAGE_KEY = 'credex.sidebar.open'

function readOpen(): boolean {
  try {
    return localStorage.getItem(STORAGE_KEY) !== 'false'
  } catch {
    return true
  }
}

export function useSidebar(): { open: boolean; toggle: () => void } {
  const [open, setOpen] = useState(readOpen)

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, String(open))
    } catch {
      // The sidebar still works when preference storage is unavailable.
    }
  }, [open])

  const toggle = useCallback(() => {
    setOpen((current) => !current)
  }, [])

  return { open, toggle }
}
