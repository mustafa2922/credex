const { app, protocol, BrowserWindow } = require('electron')
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
app.whenReady().then(() => {
  protocol.handle('credex-file', () => new Response('ok'))
  const win = new BrowserWindow({ show: true, width: 400, height: 300 })
  win.loadURL('data:text/html,<h1>scheme</h1>')
  setTimeout(() => {
    console.log('scheme-alive')
    app.exit(0)
  }, 8000)
})
