import path from 'node:path';
import { defineConfig } from 'drizzle-kit';

export default defineConfig({
  schema: './server/db/schema.ts',
  out: './server/db/migrations',
  dialect: 'sqlite',
  dbCredentials: {
    url: path.resolve(process.cwd(), 'data', 'mam.db'),
  },
});
