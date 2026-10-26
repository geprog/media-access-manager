CREATE TABLE `token_views` (
	`id` text PRIMARY KEY NOT NULL,
	`token_id` text NOT NULL,
	`media_id` text NOT NULL,
	`viewed_at` integer NOT NULL,
	FOREIGN KEY (`token_id`) REFERENCES `tokens`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`media_id`) REFERENCES `media`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `token_views_token_id_idx` ON `token_views` (`token_id`);--> statement-breakpoint
CREATE INDEX `token_views_viewed_at_idx` ON `token_views` (`viewed_at`);