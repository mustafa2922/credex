/**
 * Bundles scripts/seed-ledger.ts and runs it under Electron (nativeImage + paths).
 * Seed tooling stays outside the app modules.
 */
import { build } from 'esbuild'
import { spawn } from 'node:child_process'
import { createRequire } from 'node:module'
import { mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const require = createRequire(import.meta.url)
const electronPath = require('electron')
const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const outfile = join(root, 'scripts', '.tmp', 'seed-ledger.cjs')

mkdirSync(dirname(outfile), { recursive: true })

await build({
  entryPoints: [join(root, 'scripts', 'seed-ledger.ts')],
  outfile,
  bundle: true,
  platform: 'node',
  format: 'cjs',
  target: 'node20',
  sourcemap: false,
  logLevel: 'warning',
  external: ['electron', 'better-sqlite3']
})

const child = spawn(electronPath, [outfile], {
  cwd: root,
  stdio: 'inherit',
  env: {
    ...process.env,
    ELECTRON_DISABLE_SECURITY_WARNINGS: 'true'
  }
})

child.on('exit', (code, signal) => {
  if (signal) {
    console.error(`Seed exited via signal ${signal}`)
    process.exit(1)
  }
  process.exit(code ?? 1)
})
