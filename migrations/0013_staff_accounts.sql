ALTER TABLE `members` ADD `password_hash` text;--> statement-breakpoint
ALTER TABLE `members` ADD `session_version` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `members` ADD `totp_secret` text;--> statement-breakpoint
ALTER TABLE `members` ADD `totp_enabled_at` integer;--> statement-breakpoint
ALTER TABLE `members` ADD `totp_last_step` integer;--> statement-breakpoint
ALTER TABLE `members` ADD `failed_logins` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `members` ADD `locked_until` integer;--> statement-breakpoint
ALTER TABLE `members` ADD `password_set_at` integer;