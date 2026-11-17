export type ScreenHandle = {
  title: string
  description?: string
}

export function isScreenHandle(value: unknown): value is ScreenHandle {
  if (typeof value !== 'object' || value === null || !('title' in value)) return false
  return typeof value.title === 'string'
}
