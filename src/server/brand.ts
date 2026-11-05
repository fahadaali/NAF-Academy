import 'server-only'
/* قراءة الهوية من الإعدادات وتحويل معرّفات الصور إلى روابط — مصدر واحد لكل موضع في المنصة */
import { cache } from 'react'
import { db, schema as s } from './db'
import { getSetting } from './settings'
import { getObject } from './storage'
import { sanitizeSvg } from './svg'
import { LOGO_SLOTS, mergeBrand, pick, hasLogo, type BrandSettings, type BrandView, type LogoImg, type LogoPair } from '@/lib/brand'
import type { EmailBrand } from './notify/templates'
import { inList } from '@/server/db/limits'

export const brandSettings = async () => mergeBrand(await getSetting<Partial<BrandSettings> | null>('brand', null))

export const brandView = cache(async (): Promise<BrandView> => {
  const b = await brandSettings()
  const ids = [...LOGO_SLOTS.flatMap((k) => [b[k].light, b[k].dark, b[k].lightPng, b[k].darkPng]), b.icon].filter((x): x is string => !!x)
  const rows = ids.length ? await db.select().from(s.media).where(inList(s.media.id, ids)) : []
  const one = (id: string | null) => {
    const m = id ? rows.find((r) => r.id === id && !r.deletedAt) : undefined
    return m ? { url: `/media/${m.key}`, key: m.key, w: m.width, h: m.height, mime: m.mime } : null
  }
  const img = (id: string | null, png: string | null): LogoImg | null => {
    const m = one(id)
    if (!m) return null
    const svg = m.mime === 'image/svg+xml'
    const r = svg ? one(png) : m
    return { url: m.url, key: m.key, w: m.w, h: m.h, svg, raster: r && r.mime === 'image/png' ? { url: r.url, key: r.key, w: r.w, h: r.h } : null }
  }
  const pair = (k: (typeof LOGO_SLOTS)[number]): LogoPair => ({ light: img(b[k].light, b[k].lightPng), dark: img(b[k].dark, b[k].darkPng) })
  return {
    name: b.name, tagline: b.tagline, companyName: b.companyName, showName: b.showName,
    academy: pair('academy'), lockup: pair('lockup'), mark: pair('mark'),
    icon: (() => { const m = one(b.icon); return m ? { ...m, svg: false, raster: m } : null })(),
  }
})

/** الشعار المتجه نظيفاً ومهيّأً للحركة (--n لكل عنصر) — للإدراج داخل الصفحة في مواضع الحركة */
export const logoSvg = cache(async (key: string): Promise<string | null> => {
  const bytes = await getObject(key)
  return bytes ? sanitizeSvg(new TextDecoder().decode(bytes), { motion: true })?.svg ?? null : null
})

/** بايتات PNG للشعار (لملف PDF وصور المشاركة) — توأم الملف المتجه أو الملف نفسه */
export async function logoBytes(img: LogoImg | null) {
  const r = img?.raster
  if (!r) return null
  const bytes = await getObject(r.key)
  return bytes ? { bytes, w: r.w || 1, h: r.h || 1 } : null
}

/** الهوية للبريد: رأس داكن بصيغة الشريط (PNG — عملاء البريد لا يعرضون SVG) */
export async function emailBrand(site: string): Promise<EmailBrand> {
  const b = await brandView()
  const r = pick(b.academy, 'dark')?.raster
  return { name: b.name, tagline: b.tagline, companyName: b.companyName, showName: b.showName, logo: r && site ? `${site}${r.url}` : null }
}

/** الهوية لصور المشاركة (خلفية كحلية): الشعار الكامل الداكن، وإلا صيغة الشريط */
export async function ogBrand() {
  const b = await brandView()
  const full = hasLogo(b.lockup)
  return { name: b.name, showName: b.showName, full, logo: await logoBytes(pick(full ? b.lockup : b.academy, 'dark')) }
}
