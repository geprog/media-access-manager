CREATE TABLE `batches` (
	`id` text PRIMARY KEY NOT NULL,
	`media_id` text NOT NULL,
	`name` text NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`media_id`) REFERENCES `media`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `media` (
	`id` text PRIMARY KEY NOT NULL,
	`provider_id` text NOT NULL,
	`title` text NOT NULL,
	`provider_config` text NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `tokens` (
	`id` text PRIMARY KEY NOT NULL,
	`token` text NOT NULL,
	`media_id` text NOT NULL,
	`batch_id` text,
	`name` text NOT NULL,
	`starts_at` integer,
	`expires_at` integer,
	`usage_limit` integer,
	`usage_count` integer DEFAULT 0 NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`media_id`) REFERENCES `media`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`batch_id`) REFERENCES `batches`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `tokens_token_unique` ON `tokens` (`token`);