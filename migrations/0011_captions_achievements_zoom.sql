CREATE TABLE `achievements` (
	`id` text PRIMARY KEY NOT NULL,
	`learner_id` text NOT NULL,
	`kind` text NOT NULL,
	`ref` text DEFAULT '' NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	FOREIGN KEY (`learner_id`) REFERENCES `learners`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `achievement_once` ON `achievements` (`learner_id`,`kind`,`ref`);--> statement-breakpoint
CREATE TABLE `inbox` (
	`id` text PRIMARY KEY NOT NULL,
	`key` text NOT NULL,
	`learner_id` text NOT NULL,
	`kind` text NOT NULL,
	`title` text NOT NULL,
	`body` text DEFAULT '' NOT NULL,
	`url` text DEFAULT '' NOT NULL,
	`read_at` text,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	FOREIGN KEY (`learner_id`) REFERENCES `learners`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `inbox_key_unique` ON `inbox` (`key`);--> statement-breakpoint
CREATE INDEX `inbox_learner_idx` ON `inbox` (`learner_id`,`created_at`);--> statement-breakpoint
ALTER TABLE `cohort_sessions` ADD `zoom_meeting_id` text;--> statement-breakpoint
CREATE INDEX `cohort_sessions_zoom_idx` ON `cohort_sessions` (`zoom_meeting_id`);--> statement-breakpoint
ALTER TABLE `lessons` ADD `captions` text DEFAULT '[]' NOT NULL;--> statement-breakpoint
ALTER TABLE `lessons` ADD `zoom_meeting_id` text;