CREATE TABLE `notifications` (
	`id` text PRIMARY KEY NOT NULL,
	`key` text NOT NULL,
	`event` text NOT NULL,
	`channel` text NOT NULL,
	`to` text NOT NULL,
	`learner_id` text,
	`course_id` text,
	`ref` text DEFAULT '{}' NOT NULL,
	`send_at` text NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`attempts` integer DEFAULT 0 NOT NULL,
	`error` text DEFAULT '' NOT NULL,
	`message_id` text,
	`sent_at` text,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `notifications_key_unique` ON `notifications` (`key`);--> statement-breakpoint
CREATE INDEX `notify_due_idx` ON `notifications` (`status`,`send_at`);--> statement-breakpoint
CREATE INDEX `notify_learner_idx` ON `notifications` (`learner_id`);--> statement-breakpoint
CREATE TABLE `notify_optouts` (
	`email` text PRIMARY KEY NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL
);
