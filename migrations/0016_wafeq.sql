ALTER TABLE `invoices` ADD `wafeq_status` text DEFAULT 'off' NOT NULL;--> statement-breakpoint
ALTER TABLE `invoices` ADD `wafeq_step` text DEFAULT 'contact' NOT NULL;--> statement-breakpoint
ALTER TABLE `invoices` ADD `wafeq_contact_id` text;--> statement-breakpoint
ALTER TABLE `invoices` ADD `wafeq_id` text;--> statement-breakpoint
ALTER TABLE `invoices` ADD `wafeq_number` text;--> statement-breakpoint
ALTER TABLE `invoices` ADD `wafeq_payment_id` text;--> statement-breakpoint
ALTER TABLE `invoices` ADD `wafeq_tax` text;--> statement-breakpoint
ALTER TABLE `invoices` ADD `wafeq_error` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `invoices` ADD `wafeq_attempts` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `invoices` ADD `wafeq_next_at` text;--> statement-breakpoint
ALTER TABLE `invoices` ADD `wafeq_at` text;--> statement-breakpoint
CREATE INDEX `invoices_wafeq_idx` ON `invoices` (`wafeq_status`,`wafeq_next_at`);