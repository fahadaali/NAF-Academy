CREATE TABLE `certificate_templates` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`design` text NOT NULL,
	`is_default` integer DEFAULT false NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	`deleted_at` text
);
--> statement-breakpoint
CREATE TABLE `certificates` (
	`id` text PRIMARY KEY NOT NULL,
	`code` text,
	`learner_id` text NOT NULL,
	`course_id` text NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`name` text NOT NULL,
	`course_title` text NOT NULL,
	`hours` real DEFAULT 0 NOT NULL,
	`criteria` text DEFAULT '[]' NOT NULL,
	`template_id` text,
	`design` text,
	`pdf_key` text,
	`issued_at` text,
	`decided_by` text,
	`reason` text DEFAULT '' NOT NULL,
	`revoked_at` text,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	FOREIGN KEY (`learner_id`) REFERENCES `learners`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`course_id`) REFERENCES `courses`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `certificates_code_unique` ON `certificates` (`code`);--> statement-breakpoint
CREATE UNIQUE INDEX `cert_learner_course` ON `certificates` (`learner_id`,`course_id`);--> statement-breakpoint
CREATE INDEX `cert_status_idx` ON `certificates` (`status`);--> statement-breakpoint
ALTER TABLE `courses` ADD `certificate` text DEFAULT '{}' NOT NULL;