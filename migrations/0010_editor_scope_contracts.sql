CREATE TABLE `drafts` (
	`key` text PRIMARY KEY NOT NULL,
	`value` text NOT NULL,
	`expires_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `org_contracts` (
	`id` text PRIMARY KEY NOT NULL,
	`org_id` text NOT NULL,
	`number` text DEFAULT '' NOT NULL,
	`title` text NOT NULL,
	`status` text DEFAULT 'draft' NOT NULL,
	`starts_at` text,
	`ends_at` text,
	`seats` integer NOT NULL,
	`scope` text DEFAULT 'all' NOT NULL,
	`course_ids` text DEFAULT '[]' NOT NULL,
	`total` integer DEFAULT 0 NOT NULL,
	`file_id` text,
	`notes` text DEFAULT '' NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	`deleted_at` text,
	FOREIGN KEY (`org_id`) REFERENCES `organizations`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `contracts_org_idx` ON `org_contracts` (`org_id`);--> statement-breakpoint
ALTER TABLE `courses` ADD `content` text;--> statement-breakpoint
ALTER TABLE `enrollments` ADD `contract_id` text;--> statement-breakpoint
ALTER TABLE `instructors` ADD `scene_id` text REFERENCES media(id);--> statement-breakpoint
ALTER TABLE `members` ADD `instructor_id` text;