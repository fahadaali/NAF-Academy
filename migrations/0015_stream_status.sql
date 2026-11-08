CREATE TABLE `stream_videos` (
	`uid` text PRIMARY KEY NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`pct` integer DEFAULT 0 NOT NULL,
	`duration_seconds` integer,
	`thumbnail_url` text,
	`error` text DEFAULT '' NOT NULL,
	`lesson_id` text,
	`name` text DEFAULT '' NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL
);
--> statement-breakpoint
CREATE INDEX `stream_videos_status` ON `stream_videos` (`status`);--> statement-breakpoint
ALTER TABLE `lessons` ADD `stream_uid` text;--> statement-breakpoint
ALTER TABLE `lessons` ADD `stream_status` text;--> statement-breakpoint
ALTER TABLE `lessons` ADD `duration_seconds` integer;--> statement-breakpoint
ALTER TABLE `lessons` ADD `thumbnail_url` text;