import { randomBytes } from 'node:crypto';
import { existsSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import * as schema from '../db/schema';

const dataDir = path.resolve(process.cwd(), 'data');
const dbPath = path.join(dataDir, 'mam.db');
const migrationsFolder = path.resolve(process.cwd(), 'server', 'db', 'migrations');

let db: ReturnType<typeof drizzle<typeof schema>>;

export function useDb() {
  if (!db) {
    if (!existsSync(dataDir)) {
      mkdirSync(dataDir, { recursive: true });
    }
    const sqlite = new Database(dbPath);
    db = drizzle(sqlite, { schema });
    // SQLite can only relax a column constraint by rebuilding the table, which
    // means dropping tables that others point at. `PRAGMA foreign_keys` is
    // ignored inside a transaction and drizzle wraps every migration in one,
    // so enforcement is lifted around the run instead — the way SQLite's own
    // "other kinds of table schema changes" recipe prescribes.
    sqlite.pragma('foreign_keys = OFF');
    migrate(db, { migrationsFolder });
    sqlite.pragma('foreign_keys = ON');
  }
  return db;
}

export function generateId(): string {
  return randomBytes(12).toString('hex');
}
