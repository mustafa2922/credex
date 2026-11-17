const { app, BrowserWindow } = require('electron')
app.whenReady().then(() => {
  const win = new BrowserWindow({ show: true, width: 400, height: 300 })
  win.loadURL('data:text/html,<h1>ok</h1>')
  setTimeout(() => {
    console.log('still-alive')
    app.exit(0)
  }, 8000)
})
app.on('window-all-closed', () => app.quit())
