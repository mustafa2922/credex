import { useState } from 'react'

export type Theme = 'dark' | 'light'

const STORAGE_KEY = 'credex.theme'

export const themeCaption: Record<Theme, { color: string; symbolColor: string }> = {
  dark: { color: '#1b1b1f', symbolColor: '#f2f2ea' },
  light: { color: '#f4f4f1', symbolColor: '#1b1b1f' }
}

export function readTheme(): Theme {
  try {
    return localStorage.getItem(STORAGE_KEY) === 'light' ? 'light' : 'dark'
  } catch {
    return 'dark'
  }
}

export function applyTheme(theme: Theme): void {
  document.documentElement.dataset.theme = theme

  try {
    localStorage.setItem(STORAGE_KEY, theme)
  } catch {
    // The theme still applies when preference storage is unavailable.
  }

  window.api?.setWindowTheme?.(themeCaption[theme])
}

export function useTheme(): {
  theme: Theme
  setTheme: (theme: Theme) => void
} {
  const [theme, setThemeState] = useState<Theme>(readTheme)

  function setTheme(next: Theme): void {
    applyTheme(next)
    setThemeState(next)
  }

  return { theme, setTheme }
}
