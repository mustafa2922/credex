/** Unwrap Electron IPC invoke errors into the readable business message. */
export function ipcErrorMessage(error: unknown): string {
  if (!(error instanceof Error) && typeof error !== 'string') {
    return 'Something went wrong'
  }

  let message = (error instanceof Error ? error.message : error).trim()
  if (!message) return 'Something went wrong'

  const invokeMatch = message.match(
    /^Error invoking remote method '[^']+':\s*(?:Error:\s*)?([\s\S]+)$/i
  )
  if (invokeMatch?.[1]) {
    message = invokeMatch[1].trim()
  }

  if (/^Error:\s*/i.test(message)) {
    message = message.replace(/^Error:\s*/i, '').trim()
  }

  return message || 'Something went wrong'
}
