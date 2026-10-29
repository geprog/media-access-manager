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

/**
 * What buying access again costs, in the currency's minor unit (cents), for
 * media and groups alike. `null` means that period is not for sale. Only an
 * expired token's own target is priced — a group is never the sum of its media.
 */
const purchasePrices = {
  priceMonth: integer('price_month'),
  priceYear: integer('price_year'),
};

export const media = sqliteTable('media', {
  id: text('id').primaryKey(),
  title: text('title').notNull(),
  providerConfig: text('provider_config', { mode: 'json' }).$type<VimeoConfig>().notNull(),
  ...purchasePrices,
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
  ...purchasePrices,
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
  /**
   * The Mollie payment the visitor started to buy this token again, until
   * Mollie reports it paid, expired, canceled or failed. Buying again leads
   * back to it instead of starting a second payment. See `docs/purchase.md`.
   */
  openPaymentId: text('open_payment_id'),
  /**
   * Where that payment is paid. Kept because Mollie's API stops handing the
   * checkout link out once an attempt failed or was canceled, while the page
   * itself still lets the visitor try again.
   */
  openPaymentCheckoutUrl: text('open_payment_checkout_url'),
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

/**
 * One row per *paid* Mollie payment that extended a token — and nothing about
 * who paid or how much: that stays with Mollie. The payment id is kept because
 * it is the only thing that stops a retried webhook from extending twice.
 */
export const tokenPurchases = sqliteTable('token_purchases', {
  paymentId: text('payment_id').primaryKey(),
  tokenId: text('token_id').notNull().references(() => tokens.id),
  period: text('period', { enum: ['month', 'year'] }).notNull(),
  /**
   * The token's end and view limit before the purchase, so the extension can
   * be undone when the money goes back — a refund or a chargeback.
   */
  expiresBefore: integer('expires_before', { mode: 'timestamp' }),
  usageLimitBefore: integer('usage_limit_before'),
  expiresAfter: integer('expires_after', { mode: 'timestamp' }).notNull(),
  createdAt: integer('created_at', { mode: 'timestamp' }).default(sql`CURRENT_TIMESTAMP`).notNull(),
  /** When the money went back and the token was set back to what it was. */
  revertedAt: integer('reverted_at', { mode: 'timestamp' }),
});

/**
 * Payments that need an admin's eye: one that was paid after its token was
 * deleted and so bought nothing (to be refunded in Mollie), and one that was
 * refunded or charged back, whose access the app withdrew. Shown in the admin
 * UI until dismissed. Holds the payment's description and its Mollie link,
 * nothing about the payer.
 */
export const paymentNotices = sqliteTable('payment_notices', {
  paymentId: text('payment_id').primaryKey(),
  kind: text('kind', { enum: ['unapplied', 'reverted'] }).notNull(),
  /** What the payment was for, as Mollie's checkout showed it. */
  description: text('description').notNull(),
  dashboardUrl: text('dashboard_url'),
  createdAt: integer('created_at', { mode: 'timestamp' }).default(sql`CURRENT_TIMESTAMP`).notNull(),
  dismissedAt: integer('dismissed_at', { mode: 'timestamp' }),
});

export type Media = typeof media.$inferSelect;
export type MediaInsert = typeof media.$inferInsert;
export type MediaGroup = typeof mediaGroups.$inferSelect;
export type MediaGroupItem = typeof mediaGroupItems.$inferSelect;
export type Batch = typeof batches.$inferSelect;
export type BatchInsert = typeof batches.$inferInsert;
export type Token = typeof tokens.$inferSelect;
export type TokenInsert = typeof tokens.$inferInsert;
export type TokenMediaUsage = typeof tokenMediaUsage.$inferSelect;
export type TokenPurchase = typeof tokenPurchases.$inferSelect;
export type PaymentNotice = typeof paymentNotices.$inferSelect;
export type TokenView = typeof tokenViews.$inferSelect;
