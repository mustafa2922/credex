export const migrations: { version: number; sql: string }[] = [
  {
    version: 1,
    sql: `CREATE TABLE app_meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);
          INSERT INTO app_meta VALUES ('created_at', datetime('now'));`
  },
  {
    version: 2,
    sql: `CREATE TABLE clients (
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            phone TEXT,
            status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','inactive')),
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL
          );
          CREATE INDEX idx_clients_name ON clients(name);`
  },
  {
    version: 3,
    sql: `CREATE TABLE units (
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','inactive')),
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL
          );
          CREATE UNIQUE INDEX idx_units_name ON units(name COLLATE NOCASE);`
  },
  {
    version: 4,
    sql: `CREATE TABLE invoices (
            id TEXT PRIMARY KEY,
            number TEXT,
            client_id TEXT NOT NULL REFERENCES clients(id),
            invoice_date TEXT NOT NULL, -- YYYY-MM-DD local date
            status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','issued','void')),
            total INTEGER NOT NULL DEFAULT 0,
            void_reason TEXT,
            issued_at TEXT,
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL
          );
          CREATE UNIQUE INDEX idx_invoices_number ON invoices(number) WHERE number IS NOT NULL;
          CREATE INDEX idx_invoices_client ON invoices(client_id);
          CREATE INDEX idx_invoices_status ON invoices(status);
          CREATE TABLE invoice_lines (
            id TEXT PRIMARY KEY,
            invoice_id TEXT NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
            position INTEGER NOT NULL,
            name TEXT NOT NULL,
            image_path TEXT,
            unit_id TEXT NOT NULL REFERENCES units(id),
            unit_name TEXT NOT NULL,
            quantity INTEGER NOT NULL,
            rate INTEGER NOT NULL,
            total INTEGER NOT NULL
          );
          CREATE TABLE IF NOT EXISTS app_meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);
          INSERT INTO app_meta (key, value)
          SELECT 'invoice_counter', '0'
          WHERE NOT EXISTS (SELECT 1 FROM app_meta WHERE key = 'invoice_counter');`
  }
]
