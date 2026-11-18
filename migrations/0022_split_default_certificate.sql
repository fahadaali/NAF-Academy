-- قالب الشهادة الثنائية (عربي يمين، إنجليزي يسار) قالباً افتراضياً — بقرار المالك.
-- يأخذ نصوص القالب الافتراضي الحالي وموقّعيه وخلفيته ولونه، ويبدّل التخطيط ومواضع العناصر وحدها.
-- القاعدة الجديدة بلا قوالب لا يمسّها (البذرة تُنشئ هذا القالب نفسه). الشهادات الصادرة لقطات فلا تتغير.
INSERT INTO `certificate_templates` (`id`, `name`, `design`, `is_default`)
SELECT '4009e14e-7009-4d28-b3c9-64c2581e6099', 'شهادة ثنائية — عربي وإنجليزي',
  json_set(`design`, '$.layout', 'split', '$.bilingual', json('true'), '$.blocks', json('{"brand":{"x":50,"y":12.5,"size":13,"show":true},"title":{"x":50,"y":29,"size":30,"show":true},"lead":{"x":50,"y":38,"size":12.5,"show":true},"name":{"x":50,"y":46.5,"size":22,"show":true},"idNumber":{"x":50,"y":53,"size":12,"show":true},"course":{"x":50,"y":63.5,"size":15,"show":true},"hours":{"x":50,"y":70.5,"size":11,"show":true},"date":{"x":50,"y":77,"size":9.5,"show":true},"signatures":{"x":50,"y":87.5,"size":10.5,"show":true},"qr":{"x":91,"y":84,"size":46,"show":true}}')),
  1
FROM `certificate_templates`
WHERE `deleted_at` IS NULL AND NOT EXISTS (SELECT 1 FROM `certificate_templates` WHERE `id` = '4009e14e-7009-4d28-b3c9-64c2581e6099')
ORDER BY `is_default` DESC, `created_at` ASC
LIMIT 1;--> statement-breakpoint
UPDATE `certificate_templates` SET `is_default` = 0, `updated_at` = strftime('%Y-%m-%dT%H:%M:%fZ','now')
WHERE `id` <> '4009e14e-7009-4d28-b3c9-64c2581e6099' AND `is_default` = 1 AND EXISTS (SELECT 1 FROM `certificate_templates` WHERE `id` = '4009e14e-7009-4d28-b3c9-64c2581e6099');
