# دليل النشر والتشغيل — أكاديمية ناف

النطاق: **`academy.naflaw.sa`**. كل الخطوات من واجهات المواقع مباشرة؛ والطرفية لقاعدة البيانات وحدها (الخطوة ٥).
كل قناة خارجية (الدفع، البريد، الجوال، الفيديو، Zoom، إشعارات المتصفح) **مبنية كاملة ومقفلة** حتى تُضاف مفاتيحها ثم تُفعَّل من اللوحة.

## ٠) قبل البدء
1. **Cloudflare ← Manage Account ← Billing:** اشترك في **Workers Paid** (5$ شهرياً) — المجانية تحدّ وقت المعالج بـ10ms، والمنصة تتجاوزه.
2. **Cloudflare ← Websites:** تأكد أن النطاق `naflaw.sa` مضاف ونشط (Active).
3. **GitHub:** ادمج فرع العمل في `main` من صفحة طلب الدمج، وتأكد أن فحص **CI** أخضر.

## ١) موارد التخزين (لوحة Cloudflare)
1. **Storage & Databases ← D1 SQL Database ← Create:** الاسم `naf_academy` ← Create. انسخ **Database ID** من صفحتها.
2. **Storage & Databases ← KV ← Create a namespace:** الاسم `AUTH_KV` ← Add. انسخ **ID**.
3. **R2 Object Storage ← Create bucket:** الاسم `naf-academy-media` ← Create bucket.
4. **GitHub ← المستودع ← `wrangler.jsonc` ← ✏️ (تعديل):** ضع `REPLACE_WITH_D1_ID` ← معرّف D1، و`REPLACE_WITH_KV_ID` ← معرّف KV،
   و`REPLACE_WITH_NAF_ID_ISSUER_URL` ← عنوان مركز naf-id ← **Commit changes** على `main`. (`SITE_URL` مضبوط على `https://academy.naflaw.sa`.)

## ٢) ربط المستودع بالنشر التلقائي (Workers Builds)
1. **Workers & Pages ← Create ← Import a repository ← GitHub:** اسمح لـCloudflare بالمستودع `fahadaali/NAF-Academy` واختره.
2. الإعداد:
   - **Project name:** `naf-academy` (يطابق `name` في `wrangler.jsonc`).
   - **Production branch:** `main`.
   - **Build command:** `npm run cf:build`
   - **Deploy command:** `npx wrangler d1 migrations apply naf_academy --remote && npx wrangler deploy`
     (الترحيلات تُطبَّق تلقائياً قبل كل نشر — لا حاجة لتطبيقها يدوياً أبداً.)
   - **Build variables:** `SITE_URL` = `https://academy.naflaw.sa`، و`NODE_VERSION` = `22`.
3. **Save and Deploy.** بعدها كل دمج في `main` ينشر وحده، وسجل كل نشر في تبويب **Deployments**.
4. **naf-academy ← Settings ← Domains & Routes ← Add ← Custom domain:** `academy.naflaw.sa` ← Add domain (الشهادة تُصدر تلقائياً خلال دقائق).
5. **Settings ← Trigger Events:** تأكد أن المشغّل `*/5 * * * *` ظاهر — منه تخرج الرسائل الآلية.

## ٣) الأسرار (لوحة Cloudflare)
**naf-academy ← Settings ← Variables and Secrets ← Add ← Type: Secret** لكل واحد، ثم **Deploy**.
القيم العشوائية: ولّدها من مدير كلمات المرور (iCloud Passwords أو 1Password…) بطول 48 حرفاً على الأقل.

| السرّ | القيمة | لماذا |
|---|---|---|
| `LEARNER_SECRET` | عشوائي 48 | جلسات المتدربين وتذاكر الحضور — **الموقع لا يعمل بدونه** |
| `ADMIN_SECRET` | عشوائي 48 | جلسة دخول كلمة المرور |
| `CRON_SECRET` | عشوائي 48 | يحمي المشغّل الدوري — بدونه لا رسائل آلية |
| `ADMIN_PASSWORD` | كلمة مرور قوية | دخول الطوارئ للوحة حين يُعطَّل الدخول الموحّد |
| `AUTH_CLIENT_SECRET` | من مركز naf-id (الخطوة ٤) | الدخول الموحّد لفريق ناف |
| مفاتيح الخدمات | الخطوة ٦ | كل قناة مقفلة حتى يُضاف مفتاحها |

## ٤) دخول فريق ناف (لوحة naf-id)
1. أضف منصة بالمعرّف `naf-academy`، برابط العودة `https://academy.naflaw.sa/auth/callback`
   ورابط الخروج الخلفي `https://academy.naflaw.sa/auth/backchannel-logout`.
2. انسخ سرّ المنصة ← `AUTH_CLIENT_SECRET` في الخطوة ٣.

## ٥) قاعدة البيانات — الجزء الوحيد بالطرفية
الترحيلات تُطبَّق تلقائياً مع النشر (الخطوة ٢). يبقى البذر الأول للمحتوى، مرة واحدة، من جهاز عليه Node 22 ونسخة من المستودع:
```
npm ci
npx wrangler login
npm run db:setup          # يبني المحتوى المبدئي وحزمة الهوية محلياً
npm run db:seed:remote    # ينقله إلى D1 — مرة واحدة على قاعدة فارغة
```
**تنبيه:** البذر ينقل ما في القاعدة المحلية كما هو؛ للبدء نظيفاً `npm run db:reset` قبل `db:setup`.

**الصور والشعارات إلى R2 (واجهة):** Cloudflare ← R2 ← `naf-academy-media` ← **Upload** ← اسحب كل ملفات المجلد `.data/media`
(أسماؤها كما هي — `brand-…` وغيرها). أو `npm run media:r2` إن كانت الطرفية مفتوحة.

**المالك الأول (واجهة):** الدخول الموحّد يعطّل كلمة المرور، والداخل أول مرة «بانتظار التفعيل».
Cloudflare ← D1 ← `naf_academy` ← **Console** ← الصق ونفّذ (ببريدك):
```sql
INSERT INTO members (user_id, email, role, is_active, created_at) VALUES ('invite:you@naflaw.sa', 'you@naflaw.sa', 'owner', 1, strftime('%s','now'));
```
أول دخول ببريدك يربط الدعوة بحسابك بدور «مالك».

## ٦) الخدمات الخارجية (من مواقعها) — كلٌّ مستقل
كل مفتاح يُضاف في **Variables and Secrets** (الخطوة ٣): السرّ بنوع Secret، والقيمة العامة (`MAIL_FROM`، `SMS_SENDER`، `VAPID_PUBLIC_KEY`، `VAPID_SUBJECT`) بنوع Text.

**البريد — resend.com** (ابدأ به: رموز الدخول تعتمد عليه)
1. **Domains ← Add Domain:** `naflaw.sa` ← انسخ سجلات DNS المعروضة إلى Cloudflare ← DNS ← Records ← Add record، حتى تصير Verified.
   ومن صفحة النطاق فعّل **Open tracking** و**Click tracking**.
2. **API Keys ← Create API Key** (Sending access) ← `RESEND_API_KEY`. و`MAIL_FROM` = `أكاديمية ناف <academy@naflaw.sa>`.
3. **Webhooks ← Add Webhook:** `https://academy.naflaw.sa/api/mail/webhook` بالأحداث email.delivered وopened وclicked وbounced وcomplained
   ← انسخ **Signing Secret** ← `RESEND_WEBHOOK_SECRET`.

**الدفع — dashboard.moyasar.com**
1. **Settings ← API Keys:** مفاتيح الاختبار أولاً ← `MOYASAR_PUBLISHABLE_KEY` (`pk_test_…`) و`MOYASAR_SECRET_KEY` (`sk_test_…`).
2. **Settings ← Webhooks ← Add:** `https://academy.naflaw.sa/api/payments/webhook`، وفي **Secret Token** قيمة عشوائية ← ضع القيمة نفسها في `MOYASAR_WEBHOOK_SECRET`.
3. بعد نجاح شراء تجريبي استبدل بمفاتيح الإنتاج (`pk_live_` · `sk_live_`). ميسر يطلب صفحة السياسات قبل تفعيل الإنتاج.

**الجوال — taqnyat.sa:** اسم مرسل معتمد (طلبه من حسابك — يستغرق أياماً) ← `SMS_SENDER`، و**API ← Bearer Token** ← `TAQNYAT_API_KEY`.

**الفيديو — Cloudflare Stream**
1. Cloudflare ← **Stream** ← فعّل الخدمة. `CF_ACCOUNT_ID` من صفحة الحساب (Account ID في الشريط الجانبي).
2. **My Profile ← API Tokens ← Create Token ← Custom:** صلاحية Account ← Stream ← Edit ← `CF_STREAM_TOKEN`.
3. `CF_STREAM_CUSTOMER` = الجزء بعد `customer-` في رابط أي فيديو في Stream (Embed).

**تسجيلات Zoom التلقائية — marketplace.zoom.us** (تحتاج Stream)
1. zoom.us ← Settings ← Recording: فعّل **Cloud recording**.
2. **Develop ← Build App ← General App ← Features ← Event Subscriptions ← Add:** الرابط `https://academy.naflaw.sa/api/zoom/webhook`،
   الحدث **Recording ← All Recordings have completed** ← انسخ **Secret Token** ← `ZOOM_WEBHOOK_SECRET`.
3. من لوحة المنصة: «الجلسات والحضور» ← فعّل Zoom، وضع روابط `zoom.us/j/…` في الدروس أو جلسات الدفعات.

**إشعارات المتصفح (اختيارية):** تحتاج زوج مفاتيح VAPID (`VAPID_PUBLIC_KEY` و`VAPID_PRIVATE_KEY`، و`VAPID_SUBJECT` = `mailto:academy@naflaw.sa`).
يولّدها `node scripts/vapid.mjs` — أو اطلب زرّ توليدها من لوحة المنصة.

## ٧) بعد النشر — من اللوحة

1. **الفريق والصلاحيات:** ادعُ أعضاء ناف بالبريد بأدوارهم (مالك، محتوى، مالية، مدرب، دعم)، واربط كل مدرب بملفه؛
   ومن يدخل بلا دعوة يظهر «بانتظار التفعيل» حتى تمنحه دوراً.
2. **الصفحات العامة:** وصف الموقع ورؤوس الصفحات، و**الشروط والخصوصية** في «السياسات» (يراجعها مستشارك).
3. **إعدادات الدفع:** بيانات المنشأة (الرقم الضريبي والسجل والعنوان) وسياسة الاسترداد، ثم مفتاح التفعيل.
4. **قنوات الرسائل:** فعّل البريد ثم الجوال ثم إشعارات المتصفح — كل قناة تُرفض إن لم تكن مفاتيحها مضافة.
5. **الرسائل الآلية:** راجع القوالب والتوقيتات، وأرسل تجربة لنفسك.
6. **قوالب الشهادات:** الموقّعون وصور التوقيع، ثم «معاينة PDF».
7. **المحتوى:** الدورات ودفعاتها ومواعيدها ومدة الوصول، والمسارات والمدربون والرئيسية.
8. **الهوية والشعارات:** مضبوطة من الحزمة؛ للتغيير ثلاث صيغ (الكامل، الشريط، الرمز)، لكلٍّ نسخة للفاتح وأخرى للداكن، والأيقونة 512×512.
9. **طلبات المؤسسات:** بريد من يُبلَّغ بالطلبات الجديدة.

## ٨) التحقق بعد أول نشر

- [ ] فحص GitHub Actions (`CI`) أخضر على الالتزام المنشور.
- [ ] `/robots.txt` و`/sitemap.xml` بروابط مطلقة على النطاق الحقيقي، وصورة مشاركة دورة (`/courses/<slug>/opengraph-image`) سليمة بالعربية.
- [ ] دخول الفريق عبر naf-id يعود إلى اللوحة بدور «مالك».
- [ ] رسالة دخول بالبريد (والجوال إن فُعّل) تصل.
- [ ] شراء تجريبي بمفتاح `sk_test_` ← Webhook ← تسجيل ← فاتورة PDF في البريد.
- [ ] تسجيل في دورة بدفعة: موعد الدفعة في «دوراتي» والتقويم والتذكير.
- [ ] شهادة تجريبية: اعتماد ← PDF ← مسح رمز QR يفتح صفحة التحقق.
- [ ] «طابور الرسائل» يتحرك كل 5 دقائق، و«سجل الرسائل» يعرض التسليم والفتح بعد ربط Resend.
- [ ] (مع Zoom) جلسة تجريبية مسجّلة ← يظهر التسجيل للمتدرب بعد انتهائها.
- [ ] إشعار متصفح حقيقي يصل (بعد VAPID) من «ملفي ← تنبيهات هذا الجهاز».
- [ ] طلب جماعي فوق 20 مقعداً يكتمل بفاتورته (حد D1 للمعاملات).
- [ ] `/policies` تعرض الاسترداد والشروط والخصوصية.

## ٩) التشغيل اليومي

| المهمة | أين |
|---|---|
| ما يحتاج تدخّلاً (تسجيل لم يُنسخ، مشترٍ مسجّل من قبل…) | نظرة عامة ← التنبيه، أو سجل التعديلات ← «ما يحتاج تدخّلاً» |
| مراجعة الواجبات والإجابة عن الأسئلة | الواجبات والأسئلة |
| تسجيل الحضور عند الباب | الجلسات والحضور ← مسح التذاكر |
| جلسات انتهت بلا تسجيل | الجلسات والحضور |
| اعتماد الشهادات | الشهادات ← بانتظار المراجعة |
| الإشراف على التقييمات | التقييمات |
| متابعة الرسائل الفاشلة والعناوين المكتومة | طابور الرسائل ← فشلت · سجل الرسائل ← العناوين المكتومة |
| التحويل ونقاط التوقف | التحليلات |

**النسخ الاحتياطي:** D1 Time Travel يحفظ 30 يوماً تلقائياً (`npx wrangler d1 time-travel restore naf_academy --timestamp=…`)،
وللنسخ الدورية خارج Cloudflare: `npx wrangler d1 export naf_academy --remote --output=backup.sql`.
