/* الهوية القابلة للتغيير من اللوحة — الشعارات والأسماء. لا شعار ولا اسم مكتوب في المكوّنات:
   كل موضع يقرأ BrandView، ومع غياب الشعار المرفوع يُرسم الرمز الافتراضي (Emblem: الكتاب المفتوح).

   ثلاث صيغ، لكل منها نسختان (للأرضيات الفاتحة والداكنة):
   - academy: «صيغة الشريط» — الشريط العلوي، واللوحة، والتذييل، والبريد، والفاتورة (بين 28 و120px)
   - lockup:  «الشعار الكامل» — المواضع الكبيرة (120px فأكثر): الستار الافتتاحي، والشهادة، وصور المشاركة
   - mark:    «الرمز» (الكتاب وحده) — مشهد الجسيمات، وحيث يكفي الرمز
   والملف المعروض SVG (متجه، ويتحرك في مواضع الحركة) أو PNG؛ وللـSVG توأم PNG تلقائي للبريد وPDF وصور المشاركة. */

/** صورة شعار جاهزة للعرض. `svg`: متجه (يُدرج داخل الصفحة للحركة). `raster`: نسخة PNG للبريد وPDF وصور المشاركة */
export type LogoImg = { url: string; key: string; w: number; h: number; svg: boolean; raster: { url: string; key: string; w: number; h: number } | null }

/** نسختان: للخلفيات الفاتحة وللداكنة — إن غابت إحداهما استُعملت الأخرى */
export type LogoPair = { light: LogoImg | null; dark: LogoImg | null }

/** معرّفات الوسائط لصيغة واحدة. lightPng/darkPng توأم PNG للملف المتجه (يولّده المحرّر عند اختيار SVG) */
export type LogoSlot = { light: string | null; dark: string | null; lightPng: string | null; darkPng: string | null }

export const LOGO_SLOTS = ['academy', 'lockup', 'mark'] as const
export type LogoSlotKey = (typeof LOGO_SLOTS)[number]

export type BrandSettings = {
  name: string
  tagline: string
  companyName: string
  /** يُكتب اسم الأكاديمية بجوار شعارها (للرمز وحده) أو يُكتفى بالشعار (إن كان يتضمن الاسم) */
  showName: boolean
  academy: LogoSlot
  lockup: LogoSlot
  mark: LogoSlot
  /** أيقونة مربعة للمتصفح والتطبيق المثبّت */
  icon: string | null
}

export type BrandView = Omit<BrandSettings, LogoSlotKey | 'icon'> & Record<LogoSlotKey, LogoPair> & { icon: LogoImg | null }

const EMPTY_SLOT: LogoSlot = { light: null, dark: null, lightPng: null, darkPng: null }

export const DEFAULT_BRAND: BrandSettings = {
  name: 'أكاديمية ناف',
  tagline: 'للتدريب القانوني',
  companyName: 'شركة ناف القانونية',
  showName: true,
  academy: EMPTY_SLOT,
  lockup: EMPTY_SLOT,
  mark: EMPTY_SLOT,
  icon: null,
}

/** المحفوظ قبل إضافة صيغة يُكمَّل بالفارغ (ويُهمل ما أُزيل مثل شعار شركة ناف) */
export function mergeBrand(v: Partial<BrandSettings> | null | undefined): BrandSettings {
  const slot = (x: Partial<LogoSlot> | undefined): LogoSlot => ({ ...EMPTY_SLOT, ...(x ?? {}) })
  return {
    name: v?.name || DEFAULT_BRAND.name, tagline: v?.tagline ?? DEFAULT_BRAND.tagline, companyName: v?.companyName || DEFAULT_BRAND.companyName,
    showName: v?.showName ?? DEFAULT_BRAND.showName,
    academy: slot(v?.academy), lockup: slot(v?.lockup), mark: slot(v?.mark), icon: v?.icon ?? null,
  }
}

/** النسخة المناسبة للسطح، مع الرجوع للأخرى إن غابت */
export const pick = (p: LogoPair, tone: 'light' | 'dark') => (tone === 'dark' ? p.dark ?? p.light : p.light ?? p.dark)

export const hasLogo = (p: LogoPair) => !!(p.light || p.dark)

/** الشعار الكامل للمواضع الكبيرة، وإلا صيغة الشريط */
export const large = (b: Pick<BrandView, 'lockup' | 'academy'>) => (hasLogo(b.lockup) ? b.lockup : b.academy)

/** الصيغ المقبولة للشعار: SVG (متجه ويتحرك) أو PNG بخلفية شفافة */
export const LOGO_MIME = ['image/svg+xml', 'image/png']
