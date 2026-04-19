import Database from 'better-sqlite3'
import path from 'path'
import { fileURLToPath } from 'url'
import { dirname } from 'path'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

const dbPath = path.resolve(__dirname, '../data.sqlite')
const db = new Database(dbPath)

// Initialize schema
db.exec(`
  CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value TEXT
  );
  
  CREATE TABLE IF NOT EXISTS history (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    role TEXT,
    content TEXT,
    timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
  );
`)

export function getSetting(key: string, defaultValue: any = null) {
  const stmt = db.prepare('SELECT value FROM settings WHERE key = ?')
  const row = stmt.get(key) as any
  if (!row) return defaultValue
  try {
    return JSON.parse(row.value)
  } catch {
    return row.value
  }
}

export function setSetting(key: string, value: any) {
  const stmt = db.prepare('INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value')
  stmt.run(key, typeof value === 'object' ? JSON.stringify(value) : String(value))
}

export function getHistory(limit = 20) {
  const stmt = db.prepare('SELECT role, content FROM history ORDER BY timestamp DESC LIMIT ?')
  return stmt.all(limit).reverse()
}

export function addHistory(role: string, content: string) {
  const stmt = db.prepare('INSERT INTO history (role, content) VALUES (?, ?)')
  stmt.run(role, content)
}

export function clearHistory() {
  db.exec('DELETE FROM history')
}

export default db
