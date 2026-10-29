CREATE TABLE `token_purchases` (
	`payment_id` text PRIMARY KEY NOT NULL,
	`token_id` text NOT NULL,
	`period` text NOT NULL,
	`expires_before` integer,
	`expires_after` integer NOT NULL,
	`created_at` integer DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`token_id`) REFERENCES `tokens`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
ALTER TABLE `media` ADD `price_month` integer;--> statement-breakpoint
ALTER TABLE `media` ADD `price_year` integer;--> statement-breakpoint
ALTER TABLE `media_groups` ADD `price_month` integer;--> statement-breakpoint
ALTER TABLE `media_groups` ADD `price_year` integer;