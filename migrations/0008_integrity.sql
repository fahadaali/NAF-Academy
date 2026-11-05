ALTER TABLE `orders` ADD `fulfilling_at` text;--> statement-breakpoint
CREATE UNIQUE INDEX `enroll_one_active` ON `enrollments` (`learner_id`,`course_id`) WHERE status = 'active';--> statement-breakpoint
CREATE UNIQUE INDEX `invoices_one_per_order` ON `invoices` (`order_id`) WHERE kind = 'invoice';