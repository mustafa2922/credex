import { contextBridge, ipcRenderer } from 'electron'

const api = {
  info: (): Promise<{ version: string; schema: number }> => ipcRenderer.invoke('app:info'),
  checkUpdates: (): Promise<void> => ipcRenderer.invoke('updates:check'),
  installUpdate: (): Promise<void> => ipcRenderer.invoke('updates:install'),
  onUpdateStatus: (cb: (s: string) => void): (() => void) => {
    const h = (_: unknown, s: string): void => cb(s)
    ipcRenderer.on('update-status', h)
    return () => ipcRenderer.removeListener('update-status', h)
  }
}
contextBridge.exposeInMainWorld('api', api)
export type Api = typeof api