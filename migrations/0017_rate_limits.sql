CREATE TABLE `rate_limits` (
	`key` text PRIMARY KEY NOT NULL,
	`n` integer DEFAULT 0 NOT NULL,
	`reset_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `rate_limits_reset_idx` ON `rate_limits` (`reset_at`);