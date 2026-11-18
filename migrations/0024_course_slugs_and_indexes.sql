CREATE TABLE `course_slugs` (
	`slug` text PRIMARY KEY NOT NULL,
	`course_id` text NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	FOREIGN KEY (`course_id`) REFERENCES `courses`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `course_slugs_course` ON `course_slugs` (`course_id`);--> statement-breakpoint
CREATE INDEX `enroll_order_idx` ON `enrollments` (`order_id`);--> statement-breakpoint
CREATE INDEX `lessons_module_idx` ON `lessons` (`module_id`);--> statement-breakpoint
CREATE INDEX `modules_course_idx` ON `modules` (`course_id`);--> statement-breakpoint
CREATE INDEX `order_items_order_idx` ON `order_items` (`order_id`);--> statement-breakpoint
CREATE INDEX `order_items_course_idx` ON `order_items` (`course_id`);--> statement-breakpoint
CREATE INDEX `otp_ip_idx` ON `otp_codes` (`ip`,`created_at`);--> statement-breakpoint
CREATE INDEX `seat_grants_order_idx` ON `seat_grants` (`order_id`);--> statement-breakpoint
CREATE INDEX `seat_grants_course_idx` ON `seat_grants` (`course_id`);--> statement-breakpoint
CREATE INDEX `seat_grants_cohort_idx` ON `seat_grants` (`cohort_id`);