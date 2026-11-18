-- ختم أكبر في القوالب ذات التخطيط المنقسم (بطلب المالك): من 62 نقطة إلى 92، بموضع لا يمسّ الإطار ولا التاريخ الإنجليزي.
-- يمسّ ما بقي على المقاس الافتراضي القديم (أو بلا عنصر ختم) وحده — مقاس عدّله صاحبه من المحرّر يبقى كما هو. الشهادات الصادرة لقطات لا تتغير.
UPDATE `certificate_templates`
SET `design` = json_set(`design`, '$.blocks.stamp', json('{"x":10.5,"y":83.5,"size":92,"show":true}')),
    `updated_at` = strftime('%Y-%m-%dT%H:%M:%fZ','now')
WHERE `deleted_at` IS NULL
  AND json_extract(`design`, '$.layout') = 'split'
  AND (json_extract(`design`, '$.blocks.stamp') IS NULL OR json_extract(`design`, '$.blocks.stamp.size') = 62);
--> statement-breakpoint
-- رمز التحقق يساراً قليلاً (بطلب المالك): من 91% إلى 88.5% — لما بقي على الموضع الافتراضي القديم وحده.
UPDATE `certificate_templates`
SET `design` = json_set(`design`, '$.blocks.qr.x', 88.5),
    `updated_at` = strftime('%Y-%m-%dT%H:%M:%fZ','now')
WHERE `deleted_at` IS NULL
  AND json_extract(`design`, '$.layout') = 'split'
  AND json_extract(`design`, '$.blocks.qr.x') = 91;
