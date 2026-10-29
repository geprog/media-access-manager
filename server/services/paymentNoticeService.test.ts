import path from 'node:path';
import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as schema from '../db/schema';

const sqlite = new Database(':memory:');
const db = drizzle(sqlite, { schema });
migrate(db, { migrationsFolder: path.resolve(process.cwd(), 'server', 'db', 'migrations') });

vi.mock('../utils/db', () => ({ useDb: () => db }));

const { dismissPaymentNotice, listOpenPaymentNotices, recordPaymentNotice } = await import('./paymentNoticeService');

beforeEach(() => {
  sqlite.prepare('DELETE FROM payment_notices').run();
});

describe('payment notices', () => {
  it('keeps a payment in view until an admin dismisses it', async () => {
    recordPaymentNotice({ paymentId: 'tr_1', kind: 'unapplied', description: 'Yoga – 1 year access', dashboardUrl: 'https://mollie.example/tr_1' });

    expect(await listOpenPaymentNotices()).toMatchObject([{ paymentId: 'tr_1', kind: 'unapplied', dismissedAt: null }]);

    expect(dismissPaymentNotice('tr_1')).toBe(true);
    expect(await listOpenPaymentNotices()).toEqual([]);
    // Dismissed is dismissed; a second click or an unknown id changes nothing.
    expect(dismissPaymentNotice('tr_1')).toBe(false);
    expect(dismissPaymentNotice('tr_nope')).toBe(false);
  });

  it('records a payment once, however often the webhook repeats it', async () => {
    recordPaymentNotice({ paymentId: 'tr_1', kind: 'reverted', description: 'Yoga – 1 month access', dashboardUrl: null });
    recordPaymentNotice({ paymentId: 'tr_1', kind: 'reverted', description: 'Yoga – 1 month access', dashboardUrl: null });

    expect(await listOpenPaymentNotices()).toHaveLength(1);
  });
});
