const fs = require('fs')
const path = require('path')
const logFile = path.join(__dirname, 'tmp-boot-log.txt')
fs.writeFileSync(logFile, 'boot\n')
require('./out/main/index.js')
fs.appendFileSync(logFile, 'required\n')
const { app } = require('electron')
app.whenReady().then(() => {
  fs.appendFileSync(logFile, 'boot-ready\n')
  setTimeout(() => {
    fs.appendFileSync(logFile, 'boot-alive\n')
    app.exit(0)
  }, 8000)
})
