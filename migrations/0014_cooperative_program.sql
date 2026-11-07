CREATE TABLE `invitations` (
	`id` text PRIMARY KEY NOT NULL,
	`course_id` text NOT NULL,
	`cohort_id` text,
	`email` text NOT NULL,
	`name` text DEFAULT '' NOT NULL,
	`phone` text DEFAULT '' NOT NULL,
	`nonce` text NOT NULL,
	`expires_at` text NOT NULL,
	`invited_by` text DEFAULT '' NOT NULL,
	`sent_at` text,
	`accepted_at` text,
	`revoked_at` text,
	`enrollment_id` text,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	FOREIGN KEY (`course_id`) REFERENCES `courses`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`cohort_id`) REFERENCES `cohorts`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `invites_course_idx` ON `invitations` (`course_id`);--> statement-breakpoint
CREATE INDEX `invites_cohort_idx` ON `invitations` (`cohort_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `invites_one_open` ON `invitations` (`course_id`,`email`) WHERE accepted_at is null and revoked_at is null;--> statement-breakpoint
ALTER TABLE `courses` ADD `visibility` text DEFAULT 'public' NOT NULL;--> statement-breakpoint
ALTER TABLE `lessons` ADD `slides` text;