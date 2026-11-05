CREATE TABLE `assets` (
	`id` text PRIMARY KEY NOT NULL,
	`key` text NOT NULL,
	`name` text NOT NULL,
	`mime` text NOT NULL,
	`size` integer NOT NULL,
	`scope` text NOT NULL,
	`owner_learner_id` text,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `assets_key_unique` ON `assets` (`key`);--> statement-breakpoint
CREATE TABLE `attendance` (
	`learner_id` text NOT NULL,
	`lesson_id` text NOT NULL,
	`course_id` text NOT NULL,
	`method` text NOT NULL,
	`by` text DEFAULT '' NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	PRIMARY KEY(`learner_id`, `lesson_id`),
	FOREIGN KEY (`learner_id`) REFERENCES `learners`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`lesson_id`) REFERENCES `lessons`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `lesson_progress` (
	`learner_id` text NOT NULL,
	`lesson_id` text NOT NULL,
	`course_id` text NOT NULL,
	`position_sec` integer DEFAULT 0 NOT NULL,
	`watched_sec` integer DEFAULT 0 NOT NULL,
	`completed_at` text,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	PRIMARY KEY(`learner_id`, `lesson_id`),
	FOREIGN KEY (`learner_id`) REFERENCES `learners`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`lesson_id`) REFERENCES `lessons`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `progress_course_idx` ON `lesson_progress` (`learner_id`,`course_id`);--> statement-breakpoint
CREATE TABLE `notes` (
	`id` text PRIMARY KEY NOT NULL,
	`learner_id` text NOT NULL,
	`lesson_id` text NOT NULL,
	`at_sec` integer,
	`body` text NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	FOREIGN KEY (`learner_id`) REFERENCES `learners`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`lesson_id`) REFERENCES `lessons`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `notes_lesson_idx` ON `notes` (`learner_id`,`lesson_id`);--> statement-breakpoint
CREATE TABLE `questions` (
	`id` text PRIMARY KEY NOT NULL,
	`lesson_id` text NOT NULL,
	`course_id` text NOT NULL,
	`learner_id` text NOT NULL,
	`body` text NOT NULL,
	`answer` text,
	`answered_by` text,
	`answered_at` text,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	FOREIGN KEY (`lesson_id`) REFERENCES `lessons`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`learner_id`) REFERENCES `learners`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `questions_lesson_idx` ON `questions` (`lesson_id`);--> statement-breakpoint
CREATE TABLE `quiz_attempts` (
	`id` text PRIMARY KEY NOT NULL,
	`learner_id` text NOT NULL,
	`lesson_id` text NOT NULL,
	`answers` text DEFAULT '{}' NOT NULL,
	`score_pct` integer,
	`passed` integer,
	`started_at` text NOT NULL,
	`submitted_at` text,
	FOREIGN KEY (`learner_id`) REFERENCES `learners`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`lesson_id`) REFERENCES `lessons`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `attempts_idx` ON `quiz_attempts` (`learner_id`,`lesson_id`);--> statement-breakpoint
CREATE TABLE `submissions` (
	`id` text PRIMARY KEY NOT NULL,
	`learner_id` text NOT NULL,
	`lesson_id` text NOT NULL,
	`course_id` text NOT NULL,
	`asset_id` text,
	`note` text DEFAULT '' NOT NULL,
	`status` text DEFAULT 'submitted' NOT NULL,
	`feedback` text DEFAULT '' NOT NULL,
	`reviewed_by` text,
	`reviewed_at` text,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	FOREIGN KEY (`learner_id`) REFERENCES `learners`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`lesson_id`) REFERENCES `lessons`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`asset_id`) REFERENCES `assets`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `subs_lesson_idx` ON `submissions` (`lesson_id`);--> statement-breakpoint
ALTER TABLE `courses` ADD `sequential` integer DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `courses` ADD `complete_at` integer DEFAULT 90 NOT NULL;--> statement-breakpoint
ALTER TABLE `lessons` ADD `video` text DEFAULT '{"provider":"none"}' NOT NULL;--> statement-breakpoint
ALTER TABLE `lessons` ADD `chapters` text DEFAULT '[]' NOT NULL;--> statement-breakpoint
ALTER TABLE `lessons` ADD `body` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `lessons` ADD `attachments` text DEFAULT '[]' NOT NULL;--> statement-breakpoint
ALTER TABLE `lessons` ADD `quiz` text;--> statement-breakpoint
ALTER TABLE `lessons` ADD `assignment` text;--> statement-breakpoint
ALTER TABLE `lessons` ADD `drip` text DEFAULT '{"mode":"none","date":null,"days":null}' NOT NULL;--> statement-breakpoint
ALTER TABLE `lessons` ADD `starts_at` text;--> statement-breakpoint
ALTER TABLE `lessons` ADD `ends_at` text;--> statement-breakpoint
ALTER TABLE `lessons` ADD `join_url` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `lessons` ADD `location` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `lessons` ADD `recording` text;