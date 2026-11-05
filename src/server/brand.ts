import 'server-only'
/* قراءة الهوية من الإعدادات وتحويل معرّفات الصور إلى روابط — مصدر واحد لكل موضع في المنصة */
import { cache } from 'react'
import { db, schema as s } from './db'
import { getSetting } from './settings'
import { getObject } from './storage'
import { DEFAULT_BRAND, pick, type BrandSettings, type BrandView, type LogoImg } from '@/lib/brand'
import type { EmailBrand } from './notify/templates'
import { inList } from '@/server/db/limits'

export const brandSettings = () => getSetting<BrandSettings>('brand', DEFAULT_BRAND)

export const brandView = cache(async (): Promise<BrandView> => {
  const b = await brandSettings()
  const ids = [b.academy.light, b.academy.dark, b.naf.light, b.naf.dark, b.icon].filter((x): x is string => !!x)
  const rows = ids.length ? await db.select().from(s.media).where(inList(s.media.id, ids)) : []
  const img = (id: string | null): LogoImg | null => {
    const m = id ? rows.find((r) => r.id === id && !r.deletedAt) : undefined
    return m ? { url: `/media/${m.key}`, key: m.key, w: m.width, h: m.height } : null
  }
  return {
    name: b.name || DEFAULT_BRAND.name, tagline: b.tagline, companyName: b.companyName || DEFAULT_BRAND.companyName, showName: b.showName,
    academy: { light: img(b.academy.light), dark: img(b.academy.dark) },
    naf: { light: img(b.naf.light), dark: img(b.naf.dark) },
    icon: img(b.icon),
  }
})

/** بايتات الشعار (لملف PDF وصور المشاركة) */
export async function logoBytes(img: LogoImg | null) {
  return img ? getObject(img.key) : null
}

/** الهوية للبريد: رأس داكن (النسخة الداكنة لشعار الأكاديمية) وتذييل فاتح (النسخة الفاتحة لشعار ناف) */
export async function emailBrand(site: string): Promise<EmailBrand> {
  const b = await brandView()
  const abs = (img: LogoImg | null) => (img && site ? `${site}${img.url}` : null)
  return { name: b.name, tagline: b.tagline, companyName: b.companyName, showName: b.showName, logo: abs(pick(b.academy, 'dark')), naf: abs(pick(b.naf, 'light')) }
}

/** الهوية لصور المشاركة (خلفية كحلية ← النسخ الداكنة) */
export async function ogBrand() {
  const b = await brandView()
  const load = async (img: LogoImg | null) => { const bytes = await logoBytes(img); return bytes && img ? { bytes, w: img.w || 1, h: img.h || 1 } : null }
  return { name: b.name, showName: b.showName, academy: await load(pick(b.academy, 'dark')), naf: await load(pick(b.naf, 'dark')) }
}
