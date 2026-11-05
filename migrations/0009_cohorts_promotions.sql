CREATE TABLE `cohort_sessions` (
	`cohort_id` text NOT NULL,
	`lesson_id` text NOT NULL,
	`starts_at` text,
	`ends_at` text,
	`join_url` text DEFAULT '' NOT NULL,
	`location` text DEFAULT '' NOT NULL,
	`recording` text,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	PRIMARY KEY(`cohort_id`, `lesson_id`),
	FOREIGN KEY (`cohort_id`) REFERENCES `cohorts`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`lesson_id`) REFERENCES `lessons`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `cohort_sessions_start_idx` ON `cohort_sessions` (`starts_at`);--> statement-breakpoint
CREATE TABLE `cohorts` (
	`id` text PRIMARY KEY NOT NULL,
	`course_id` text NOT NULL,
	`title` text NOT NULL,
	`status` text DEFAULT 'open' NOT NULL,
	`starts_at` text,
	`ends_at` text,
	`seats_total` integer,
	`seats_taken` integer DEFAULT 0 NOT NULL,
	`city` text DEFAULT '' NOT NULL,
	`venue` text DEFAULT '' NOT NULL,
	`sort_order` integer DEFAULT 0 NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	`deleted_at` text,
	FOREIGN KEY (`course_id`) REFERENCES `courses`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `cohorts_course_idx` ON `cohorts` (`course_id`);--> statement-breakpoint
CREATE TABLE `promotions` (
	`id` text PRIMARY KEY NOT NULL,
	`label` text NOT NULL,
	`scope` text DEFAULT 'all' NOT NULL,
	`track_ids` text DEFAULT '[]' NOT NULL,
	`course_ids` text DEFAULT '[]' NOT NULL,
	`kind` text DEFAULT 'percent' NOT NULL,
	`value` integer NOT NULL,
	`starts_at` text,
	`ends_at` text,
	`active` integer DEFAULT true NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	`deleted_at` text
);
--> statement-breakpoint
ALTER TABLE `courses` ADD `sale_starts_at` text;--> statement-breakpoint
ALTER TABLE `courses` ADD `access_days` integer;--> statement-breakpoint
ALTER TABLE `courses` ADD `teaser` text DEFAULT '{"provider":"none"}' NOT NULL;--> statement-breakpoint
ALTER TABLE `enrollments` ADD `cohort_id` text REFERENCES cohorts(id);--> statement-breakpoint
ALTER TABLE `enrollments` ADD `access_until` text;--> statement-breakpoint
CREATE INDEX `enroll_cohort_idx` ON `enrollments` (`cohort_id`);--> statement-breakpoint
ALTER TABLE `order_items` ADD `cohort_id` text REFERENCES cohorts(id);--> statement-breakpoint
ALTER TABLE `seat_grants` ADD `cohort_id` text REFERENCES cohorts(id);