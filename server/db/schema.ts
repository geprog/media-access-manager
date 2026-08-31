import { sql } from 'drizzle-orm';
import { integer, primaryKey, sqliteTable, text } from 'drizzle-orm/sqlite-core';

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

/**
 * A named set of media handed out through a single token. The token's limits
 * are then spent per media rather than once for the whole group, so a group is
 * only the membership list — every count lives on `tokenMediaUsage`.
 */
export const mediaGroups = sqliteTable('media_groups', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  createdAt: integer('created_at', { mode: 'timestamp' }).default(sql`CURRENT_TIMESTAMP`).notNull(),
});

export const mediaGroupItems = sqliteTable('media_group_items', {
  groupId: text('group_id').notNull().references(() => mediaGroups.id),
  mediaId: text('media_id').notNull().references(() => media.id),
  /** The order an admin arranged the media in; visitors see the same order. */
  position: integer('position').notNull().default(0),
}, table => [primaryKey({ columns: [table.groupId, table.mediaId] })]);

/**
 * Exactly one of `mediaId` and `groupId` is set: a batch either belongs to a
 * single media or to a group, and its tokens inherit that target.
 */
export const batches = sqliteTable('batches', {
  id: text('id').primaryKey(),
  mediaId: text('media_id').references(() => media.id),
  groupId: text('group_id').references(() => mediaGroups.id),
  name: text('name').notNull(),
  createdAt: integer('created_at', { mode: 'timestamp' }).default(sql`CURRENT_TIMESTAMP`).notNull(),
});

export const tokens = sqliteTable('tokens', {
  id: text('id').primaryKey(),
  /** Set on a single-media token, `null` on a group token. */
  mediaId: text('media_id').references(() => media.id),
  /** Set on a group token, `null` on a single-media token. */
  groupId: text('group_id').references(() => mediaGroups.id),
  token: text('token').notNull().unique(),
  batchId: text('batch_id').references(() => batches.id),
  name: text('name').notNull(),
  startsAt: integer('starts_at', { mode: 'timestamp' }),
  expiresAt: integer('expires_at', { mode: 'timestamp' }),
  /**
   * On a group token this is the limit for *each* media of the group, not for
   * the token as a whole.
   */
  usageLimit: integer('usage_limit'),
  /**
   * Views spent on a single-media token; on a group token the sum across its
   * media, kept only so the admin list can show a total. What a group token is
   * actually measured against is `tokenMediaUsage`.
   */
  usageCount: integer('usage_count').notNull().default(0),
  createdAt: integer('created_at', { mode: 'timestamp' }).default(sql`CURRENT_TIMESTAMP`).notNull(),
});

/**
 * Views a group token has spent on one media of its group. Rows appear on
 * first use, so a missing row simply means "not watched yet".
 */
export const tokenMediaUsage = sqliteTable('token_media_usage', {
  tokenId: text('token_id').notNull().references(() => tokens.id),
  mediaId: text('media_id').notNull().references(() => media.id),
  usageCount: integer('usage_count').notNull().default(0),
}, table => [primaryKey({ columns: [table.tokenId, table.mediaId] })]);

export type Media = typeof media.$inferSelect;
export type MediaInsert = typeof media.$inferInsert;
export type MediaGroup = typeof mediaGroups.$inferSelect;
export type MediaGroupItem = typeof mediaGroupItems.$inferSelect;
export type Batch = typeof batches.$inferSelect;
export type BatchInsert = typeof batches.$inferInsert;
export type Token = typeof tokens.$inferSelect;
export type TokenInsert = typeof tokens.$inferInsert;
export type TokenMediaUsage = typeof tokenMediaUsage.$inferSelect;
