const Database = require('better-sqlite3')
const path = require('path')
const file = path.join(process.env.APPDATA, 'credex', 'ledger.db')
const db = new Database(file, { readonly: true })
console.log('version', db.prepare('select max(version) as v from schema_version').get())
console.log(
  'tables',
  db.prepare("select name from sqlite_master where type = 'table'").all()
)
