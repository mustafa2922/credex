export const migrations: { version: number; sql: string }[] = [
    {
      version: 1,
      sql: `CREATE TABLE app_meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);
            INSERT INTO app_meta VALUES ('created_at', datetime('now'));`
    }
  ]