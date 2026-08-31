CREATE TABLE `media_groups` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`created_at` integer DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE TABLE `media_group_items` (
	`group_id` text NOT NULL,
	`media_id` text NOT NULL,
	`position` integer DEFAULT 0 NOT NULL,
	PRIMARY KEY(`group_id`, `media_id`),
	FOREIGN KEY (`group_id`) REFERENCES `media_groups`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`media_id`) REFERENCES `media`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_batches` (
	`id` text PRIMARY KEY NOT NULL,
	`media_id` text,
	`group_id` text,
	`name` text NOT NULL,
	`created_at` integer DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`media_id`) REFERENCES `media`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`group_id`) REFERENCES `media_groups`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
INSERT INTO `__new_batches`("id", "media_id", "group_id", "name", "created_at") SELECT "id", "media_id", NULL, "name", "created_at" FROM `batches`;--> statement-breakpoint
DROP TABLE `batches`;--> statement-breakpoint
ALTER TABLE `__new_batches` RENAME TO `batches`;--> statement-breakpoint
CREATE TABLE `__new_tokens` (
	`id` text PRIMARY KEY NOT NULL,
	`media_id` text,
	`group_id` text,
	`token` text NOT NULL,
	`batch_id` text,
	`name` text NOT NULL,
	`starts_at` integer,
	`expires_at` integer,
	`usage_limit` integer,
	`usage_count` integer DEFAULT 0 NOT NULL,
	`created_at` integer DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`media_id`) REFERENCES `media`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`group_id`) REFERENCES `media_groups`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`batch_id`) REFERENCES `batches`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
INSERT INTO `__new_tokens`("id", "media_id", "group_id", "token", "batch_id", "name", "starts_at", "expires_at", "usage_limit", "usage_count", "created_at") SELECT "id", "media_id", NULL, "token", "batch_id", "name", "starts_at", "expires_at", "usage_limit", "usage_count", "created_at" FROM `tokens`;--> statement-breakpoint
DROP TABLE `tokens`;--> statement-breakpoint
ALTER TABLE `__new_tokens` RENAME TO `tokens`;--> statement-breakpoint
CREATE UNIQUE INDEX `tokens_token_unique` ON `tokens` (`token`);--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE TABLE `token_media_usage` (
	`token_id` text NOT NULL,
	`media_id` text NOT NULL,
	`usage_count` integer DEFAULT 0 NOT NULL,
	PRIMARY KEY(`token_id`, `media_id`),
	FOREIGN KEY (`token_id`) REFERENCES `tokens`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`media_id`) REFERENCES `media`(`id`) ON UPDATE no action ON DELETE no action
);
