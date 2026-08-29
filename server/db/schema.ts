import { sql } from 'drizzle-orm';
import { integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';

export interface ProviderConfig<Provider extends string> {
  providerId: Provider
  // Provider-specific fields (e.g. Vimeo's `videoId`) are stored alongside.
  [key: string]: unknown
}

export interface VimeoConfig extends ProviderConfig<'vimeo'> {
  videoId: string
}

export const media = sqliteTable('media', {
  id: text('id').primaryKey(),
  title: text('title').notNull(),
  providerConfig: text('provider_config', { mode: 'json' }).$type<VimeoConfig>().notNull(),
  createdAt: integer('created_at', { mode: 'timestamp' }).default(sql`CURRENT_TIMESTAMP`).notNull(),
});

export const batches = sqliteTable('batches', {
  id: text('id').primaryKey(),
  mediaId: text('media_id').notNull().references(() => media.id),
  name: text('name').notNull(),
  createdAt: integer('created_at', { mode: 'timestamp' }).default(sql`CURRENT_TIMESTAMP`).notNull(),
});

export const tokens = sqliteTable('tokens', {
  id: text('id').primaryKey(),
  token: text('token').notNull().unique(),
  mediaId: text('media_id').notNull().references(() => media.id),
  batchId: text('batch_id').references(() => batches.id),
  name: text('name').notNull(),
  startsAt: integer('starts_at', { mode: 'timestamp' }),
  expiresAt: integer('expires_at', { mode: 'timestamp' }),
  usageLimit: integer('usage_limit'),
  usageCount: integer('usage_count').notNull().default(0),
  createdAt: integer('created_at', { mode: 'timestamp' }).default(sql`CURRENT_TIMESTAMP`).notNull(),
});

export type Media = typeof media.$inferSelect;
export type MediaInsert = typeof media.$inferInsert;
export type Batch = typeof batches.$inferSelect;
export type BatchInsert = typeof batches.$inferInsert;
export type Token = typeof tokens.$inferSelect;
export type TokenInsert = typeof tokens.$inferInsert;
