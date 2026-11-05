/* محتوى الصفحات العامة غير الرئيسية — يُخزَّن في settings['pages'] ويُحرَّر من «الصفحات العامة» في اللوحة.
   هذه القيم الافتراضية فقط (أول نشر)، مطابقة لما كان مكتوباً في الصفحات. */

export type PageHeadContent = { eyebrow: string; title: string; body: string }

export type PagesContent = {
  /** وصف الموقع: نتائج البحث، وبيان التطبيق المثبّت */
  site: { title: string; description: string }
  home: { seoDescription: string }
  courses: PageHeadContent & { seoDescription: string }
  /** «{{count}}» في العنوان أو الوصف = عدد المسارات الظاهرة الآن */
  tracks: PageHeadContent & { seoDescription: string }
  login: PageHeadContent
  /** صفحة السياسات (/policies). سياسة الاسترداد تُقرأ من «إعدادات الدفع» فلا تُكتب مرتين.
      الفارغ من الشروط والخصوصية لا يظهر — لا نص قانوني افتراضي */
  policies: PageHeadContent & { terms: string; privacy: string }
}

export const DEFAULT_PAGES: PagesContent = {
  site: {
    title: 'أكاديمية ناف — للتدريب القانوني',
    description: 'أكاديمية متخصصة في التدريب القانوني: مسارات ودورات مباشرة وحضورية ومسجّلة، من الممارسة إلى الخبرة.',
  },
  home: { seoDescription: '' },
  courses: {
    eyebrow: 'الدورات', title: 'كل دورة درج~3ة في سُلّمك.',
    body: 'اختر بالمسار أو النمط أو الدرجة — والدورات المنتهية تبقى ظاهرة لتُبلَّغ بدفعتها القادمة.',
    seoDescription: 'دورات قانونية متخصصة: مباشرة وحضورية ومسجّلة، من الممارسة إلى الخبرة.',
  },
  tracks: {
    eyebrow: 'المسارات', title: '{{count}} طرق إلى الخبرة.',
    body: 'كل مسار يبدأ من درجة الممارس ويصعد بك إلى الخبير.',
    seoDescription: '',
  },
  login: { eyebrow: 'حسابك', title: 'أهلاً بعودت~3ك.', body: 'ادخل برمز يصلك على بريدك أو جوالك — بلا كلمة مرور.' },
  policies: { eyebrow: 'السياسات', title: 'شروط واضحة قبل التسجيل.', body: '', terms: '', privacy: '' },
}

/** يدمج المحفوظ بالافتراضي حقلاً حقلاً — ما حُفظ قبل إضافة حقل جديد يأخذ قيمته الافتراضية */
export function mergePages(v: Partial<PagesContent> | null | undefined): PagesContent {
  const out = { ...DEFAULT_PAGES } as Record<keyof PagesContent, unknown>
  for (const k of Object.keys(DEFAULT_PAGES) as (keyof PagesContent)[]) out[k] = { ...DEFAULT_PAGES[k], ...(v?.[k] ?? {}) }
  return out as PagesContent
}

/** «{{count}}» ← العدد */
export const withCount = (t: string, n: number) => t.replace(/\{\{\s*count\s*\}\}/g, String(n))
