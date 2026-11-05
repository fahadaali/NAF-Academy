ALTER TABLE `orders` ADD `vat_rate` real DEFAULT 15 NOT NULL;--> statement-breakpoint
ALTER TABLE `orders` ADD `fulfilled_at` text;--> statement-breakpoint
CREATE UNIQUE INDEX `redemptions_order_uq` ON `coupon_redemptions` (`order_id`);