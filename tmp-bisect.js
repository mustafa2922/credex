const fs = require('fs')
const path = require('path')
const logFile = path.join(__dirname, 'tmp-bisect-log.txt')
const step = process.argv[2] || 'window'
function mark(message) {
  fs.appendFileSync(logFile, message + '\n')
}
mark('start ' + step)
const { app, BrowserWindow, protocol } = require('electron')
mark('electron imported')

if (step === 'scheme' || step === 'all') {
  mark('before scheme')
  protocol.registerSchemesAsPrivileged([
    {
      scheme: 'credex-file',
      privileges: {
        standard: true,
        secure: true,
        supportFetchAPI: true,
        corsEnabled: true,
        stream: true
      }
    }
  ])
  mark('after scheme')
}

app.whenReady().then(() => {
  mark('ready')
  if (step === 'db' || step === 'all') {
    mark('before db')
    const Database = require('better-sqlite3')
    const file = path.join(app.getPath('userData'), 'ledger.db')
    const db = new Database(file)
    mark('db opened ' + db.prepare('select max(version) as v from schema_version').get().v)
  }
  if (step === 'scheme' || step === 'all') {
    mark('before handle')
    protocol.handle('credex-file', () => new Response('ok'))
    mark('after handle')
  }
  mark('before window')
  const win = new BrowserWindow({
    width: 900,
    height: 670,
    show: false,
    autoHideMenuBar: true,
    backgroundColor: '#1b1b1f',
    titleBarStyle: 'hidden',
    webPreferences: {
      preload: path.join(__dirname, 'out/preload/index.js'),
      sandbox: false
    }
  })
  mark('window created')
  win.loadFile(path.join(__dirname, 'out/renderer/index.html')).catch((error) => {
    mark('load failed ' + error.message)
  })
  mark('load called')
  setTimeout(() => {
    mark('alive')
    app.exit(0)
  }, 3000)
})
