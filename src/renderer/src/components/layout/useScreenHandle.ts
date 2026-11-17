import { useMatches } from 'react-router'
import { isScreenHandle, type ScreenHandle } from '@renderer/app/screen-handle'

export function useScreenHandle(): ScreenHandle {
  const matches = useMatches()

  for (let index = matches.length - 1; index >= 0; index -= 1) {
    const handle = matches[index]?.handle
    if (isScreenHandle(handle)) return handle
  }

  return { title: 'CredEx' }
}
