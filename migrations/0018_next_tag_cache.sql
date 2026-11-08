-- وسوم ذاكرة الصفحات (OpenNext d1-next-mode-tag-cache): revalidatePath يكتب الوسم ووقته، والصفحة المخزّنة في R2 تُعدّ قديمة إن سبقته.
-- الجدول خارج مخطط Drizzle عمداً (يملكه OpenNext بهذه الصيغة نفسها: UNIQUE … ON CONFLICT REPLACE لأن كتابته INSERT مجرّد).
CREATE TABLE IF NOT EXISTS `revalidations` (
	`tag` text NOT NULL,
	`revalidatedAt` integer NOT NULL,
	`stale` integer,
	`expire` integer DEFAULT NULL,
	UNIQUE(`tag`) ON CONFLICT REPLACE
);
