import type { ValidityDuration } from '../../utils/accessWindow';
import { sql } from 'drizzle-orm';
import { index, integer, primaryKey, sqliteTable, text } from 'drizzle-orm/sqlite-core';

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
  /**
   * Stays `null` on a token waiting for its first use until that use sets it
   * from `validFor`.
   */
  expiresAt: integer('expires_at', { mode: 'timestamp' }),
  /**
   * How long the token lasts from its first use, set only on a token whose
   * validity starts then instead of on creation.
   */
  validFor: text('valid_for', { mode: 'json' }).$type<ValidityDuration>(),
  /**
   * When the token was first opened, so a first-use duration changed later can
   * still be counted from that view. Stays `null` until then.
   */
  firstUsedAt: integer('first_used_at', { mode: 'timestamp' }),
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

/**
 * One spent view: which token opened which media, and when. This is the
 * history behind every `usageCount` — what an admin reads when a visitor asks
 * where their views went — and the source of the usage statistics. Deliberately
 * nothing about the visitor: no address, no device, only the moment.
 */
export const tokenViews = sqliteTable('token_views', {
  id: text('id').primaryKey(),
  tokenId: text('token_id').notNull().references(() => tokens.id),
  /** The media opened: a single-media token's own, or the one picked from a group. */
  mediaId: text('media_id').notNull().references(() => media.id),
  viewedAt: integer('viewed_at', { mode: 'timestamp' }).notNull(),
}, table => [
  index('token_views_token_id_idx').on(table.tokenId),
  index('token_views_viewed_at_idx').on(table.viewedAt),
]);

export type Media = typeof media.$inferSelect;
export type MediaInsert = typeof media.$inferInsert;
export type MediaGroup = typeof mediaGroups.$inferSelect;
export type MediaGroupItem = typeof mediaGroupItems.$inferSelect;
export type Batch = typeof batches.$inferSelect;
export type BatchInsert = typeof batches.$inferInsert;
export type Token = typeof tokens.$inferSelect;
export type TokenInsert = typeof tokens.$inferInsert;
export type TokenMediaUsage = typeof tokenMediaUsage.$inferSelect;
export type TokenView = typeof tokenViews.$inferSelect;
