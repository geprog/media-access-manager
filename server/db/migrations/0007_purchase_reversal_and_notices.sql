CREATE TABLE `payment_notices` (
	`payment_id` text PRIMARY KEY NOT NULL,
	`kind` text NOT NULL,
	`description` text NOT NULL,
	`dashboard_url` text,
	`created_at` integer DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`dismissed_at` integer
);
--> statement-breakpoint
ALTER TABLE `token_purchases` ADD `usage_limit_before` integer;--> statement-breakpoint
ALTER TABLE `token_purchases` ADD `reverted_at` integer;