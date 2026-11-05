CREATE TABLE `mail_suppressions` (
	`email` text PRIMARY KEY NOT NULL,
	`reason` text NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL
);
--> statement-breakpoint
ALTER TABLE `certificates` ADD `name_en` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `certificates` ADD `course_title_en` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `courses` ADD `title_en` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `learners` ADD `name_en` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `media` ADD `og_key` text;--> statement-breakpoint
ALTER TABLE `message_log` ADD `delivered_at` text;--> statement-breakpoint
ALTER TABLE `message_log` ADD `opened_at` text;--> statement-breakpoint
ALTER TABLE `message_log` ADD `clicked_at` text;--> statement-breakpoint
ALTER TABLE `message_log` ADD `bounced_at` text;--> statement-breakpoint
ALTER TABLE `message_log` ADD `complained_at` text;--> statement-breakpoint
ALTER TABLE `message_log` ADD `opens` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
CREATE INDEX `msg_provider_idx` ON `message_log` (`provider_id`);