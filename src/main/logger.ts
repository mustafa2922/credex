import { appendFileSync, mkdirSync, readFileSync, existsSync } from 'fs'
import { join } from 'path'
import { logsDir } from './paths'

const LOG_FILE = 'credex.log'

function logPath(): string {
  return join(logsDir(), LOG_FILE)
}

function write(level: string, message: string): void {
  try {
    const dir = logsDir()
    mkdirSync(dir, { recursive: true })
    const line = `${new Date().toISOString()} [${level}] ${message}\n`
    appendFileSync(logPath(), line, 'utf8')
  } catch {
    // Logging must never crash the app.
  }
}

export const logger = {
  info(message: string): void {
    write('INFO', message)
  },
  warn(message: string): void {
    write('WARN', message)
  },
  error(message: string): void {
    write('ERROR', message)
  },
  readTail(lines = 50): string {
    try {
      if (!existsSync(logPath())) return ''
      const content = readFileSync(logPath(), 'utf8')
      return content.split(/\r?\n/).filter(Boolean).slice(-lines).join('\n')
    } catch {
      return ''
    }
  }
}
