-- جوال مكرّر من سباق قديم: يبقى لأقدم حساب ويُفرَّغ من غيره (يعيده صاحبه من «ملفي») — وإلا فشل إنشاء الفهرس
UPDATE `learners` SET `phone` = '' WHERE `phone` <> '' AND `rowid` NOT IN (SELECT min(`rowid`) FROM `learners` WHERE `phone` <> '' GROUP BY `phone`);--> statement-breakpoint
CREATE UNIQUE INDEX `learners_phone` ON `learners` (`phone`) WHERE "learners"."phone" <> '';
