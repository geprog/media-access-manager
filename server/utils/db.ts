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
    migrate(db, { migrationsFolder });
  }
  return db;
}
