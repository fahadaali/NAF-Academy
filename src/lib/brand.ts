/* الهوية القابلة للتغيير من اللوحة — الشعارات والأسماء. لا شعار ولا اسم مكتوب في المكوّنات:
   كل موضع يقرأ BrandView، ومع غياب الشعار المرفوع يُرسم الرمز الافتراضي (Emblem). */

/** صورة شعار جاهزة للعرض */
export type LogoImg = { url: string; key: string; w: number; h: number }

/** نسختان: للخلفيات الفاتحة وللداكنة — إن غابت إحداهما استُعملت الأخرى */
export type LogoPair = { light: LogoImg | null; dark: LogoImg | null }

export type BrandSettings = {
  name: string
  tagline: string
  companyName: string
  /** يُكتب اسم الأكاديمية بجوار شعارها (للشعار الرمزي) أو يُكتفى بالشعار (إن كان يتضمن الاسم) */
  showName: boolean
  academy: { light: string | null; dark: string | null }
  naf: { light: string | null; dark: string | null }
  /** أيقونة مربعة للمتصفح والتطبيق المثبّت */
  icon: string | null
}

export type BrandView = Omit<BrandSettings, 'academy' | 'naf' | 'icon'> & { academy: LogoPair; naf: LogoPair; icon: LogoImg | null }

export const DEFAULT_BRAND: BrandSettings = {
  name: 'أكاديمية ناف',
  tagline: 'للتدريب القانوني',
  companyName: 'شركة ناف القانونية',
  showName: true,
  academy: { light: null, dark: null },
  naf: { light: null, dark: null },
  icon: null,
}

/** النسخة المناسبة للسطح، مع الرجوع للأخرى إن غابت */
export const pick = (p: LogoPair, tone: 'light' | 'dark') => (tone === 'dark' ? p.dark ?? p.light : p.light ?? p.dark)

export const hasLogo = (p: LogoPair) => !!(p.light || p.dark)

/** الصيغ المقبولة للشعار: PNG (شفافية، وتعمل في البريد وPDF وصور المشاركة) */
export const LOGO_MIME = ['image/png']
