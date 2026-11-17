const { app } = require('electron')
const which = process.argv[2]
if (which === 'zod') require('zod')
if (which === 'sqlite') require('better-sqlite3')
if (which === 'updater') require('electron-updater')
app.whenReady().then(() => {
  setTimeout(() => app.exit(0), 8000)
})
