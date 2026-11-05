# أكاديمية ناف

منصة التدريب القانوني لشركة ناف — منصة **خارجية** بهوية مستقلة (انظر `CLAUDE.md`).

## التشغيل

```
npm install
npm run dev      # http://localhost:3000
npm run check    # الأنواع والاختبارات
npm run db:reset # إعادة القاعدة المحلية إلى المحتوى المبدئي
```

لوحة الإدارة: `/admin` — في التطوير كلمة المرور `naf-dev`. في الإنتاج اضبط `ADMIN_PASSWORD` و`ADMIN_SECRET` (انظر `.env.example`).

## البنية

| المسار | المحتوى |
|---|---|
| `src/design/tokens.css` | الألوان والخط والمقاسات ورموز الحركة — المرجع الوحيد |
| `src/motion/` | محرّك الحركة: ناقل التمرير، الرموز، الكشف، تبديل الوضع |
| `src/scenes/` | مشاهد الرئيسية: الافتتاح (WebGL2)، سُلّم الكفاءة، رفّ المسارات، الخط الزمني، المدربون، الأرقام، المؤسسات |
| `src/components/` | المكوّنات المشتركة: الشريط، الستار، العلامة، بطاقة الدورة، عرض السعر |
| `src/content/` | أنواع المحتوى ومحتوى مبدئي (seed) — يُستبدل بلوحة الإدارة |
| `src/lib/` | التسعير والتواريخ وحالات الدورة |
| `src/server/` | القاعدة (`db/schema.ts`)، والقراءة العامة (`queries.ts`)، والتخزين، والدخول، والسجل |
| `src/admin/` | لوحة الإدارة: الإجراءات، ومخططات التحقق، والمحرّرات، وأدوات الحقول |
| `src/site/` | الصفحات الداخلية العامة: الدورة، والفهرس |
| `migrations/` | ترحيلات SQL (تصلح لـ D1 كما هي) |
| `public/boot.js` | يُقرأ قبل الرسم: الوضع والستار والمؤقّتات الاحتياطية |

## الخط

ملفات خط ثمانية الأصلية في `src/fonts/thmanyah/`، و`npm run dev` / `npm run build` يولّدان تعريفاتها تلقائياً
(`src/design/fonts.generated.css`). لإضافة وزن أو عائلة: ضع ملف woff2 بالاسم الأصلي وأعد التشغيل.

## النشر على Cloudflare

```
npx wrangler d1 create naf_academy          # ضع database_id في wrangler.jsonc
npx wrangler kv namespace create AUTH_KV     # ضع id في wrangler.jsonc
npx wrangler r2 bucket create naf-academy-media
npm run db:migrate:remote                    # الترحيلات
npm run db:seed:remote                       # المحتوى المبدئي (مرة واحدة)
npx wrangler secret put LEARNER_SECRET       # وبقية الأسرار في .env.example
npm run cf:deploy
```

اضبط في `wrangler.jsonc`: `AUTH_ISSUER` (عنوان مركز naf-id) و`PLATFORM_ID`، وأضف المنصة في المركز.
ثم من اللوحة: **إعدادات الدفع** و**قنوات الرسائل** و**الفريق**.

## الاختبار

`npm test` — وحدات وتكامل على قاعدة مؤقتة (التسعير، والكوبونات، والدفع، والإتمام، والاسترداد، والصلاحيات).
