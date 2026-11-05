/* حزمة الهوية المعتمدة (src/content/brand-kit) ← مكتبة الوسائط وإعداد «الهوية والشعارات».
   تُطبَّق مرة لكل إصدار من الحزمة (العلامة settings['brand_kit'])، فما يغيّره المدير من اللوحة بعدها يبقى.
   الملفات تُنسخ كما هي حرفياً بمفاتيح ومعرّفات ثابتة، فيصدّرها export-seed إلى D1 ويرفعها media-r2 إلى R2 بالأسماء نفسها.
   يُستدعى من db-setup، أو مباشرة: tsx scripts/brand-kit.ts [--force] */
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { eq } from 'drizzle-orm'
import type { LibSQLDatabase } from 'drizzle-orm/libsql'
import * as s from '../src/server/db/schema'
import { sanitizeSvg } from '../src/server/svg'
import { mergeBrand, type BrandSettings, type LogoSlot } from '../src/lib/brand'

/** غيّره عند استلام حزمة جديدة معتمدة لتُطبَّق مرة أخرى */
export const KIT_VERSION = '2026-11-05'
const DIR = join(process.cwd(), 'src/content/brand-kit')
const MEDIA = join(process.cwd(), '.data/media')

/** معرّف ثابت بصيغة UUID (الإصدار 5) من اسم الملف — نفسه في كل قاعدة */
function stableId(name: string) {
  const h = createHash('sha1').update(`naf-academy-brand-kit:${name}`).digest('hex')
  const v = `5${h.slice(13, 16)}`
  const r = ((parseInt(h[16], 16) & 0x3) | 0x8).toString(16) + h.slice(17, 20)
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${v}-${r}-${h.slice(20, 32)}`
}

type Entry = { file: string; alt: string }
const FILES = {
  lockupLight: { file: 'logo/naf-academy-logo-light', alt: 'شعار أكاديمية ناف الكامل — للخلفيات الفاتحة' },
  lockupDark: { file: 'logo/naf-academy-logo-dark', alt: 'شعار أكاديمية ناف الكامل — للخلفيات الداكنة' },
  compactLight: { file: 'compact/naf-academy-compact-light', alt: 'شعار أكاديمية ناف (صيغة الشريط) — للخلفيات الفاتحة' },
  compactDark: { file: 'compact/naf-academy-compact-dark', alt: 'شعار أكاديمية ناف (صيغة الشريط) — للخلفيات الداكنة' },
  iconLight: { file: 'icon/naf-academy-icon-light', alt: 'رمز أكاديمية ناف — للخلفيات الفاتحة' },
  iconDark: { file: 'icon/naf-academy-icon-dark', alt: 'رمز أكاديمية ناف — للخلفيات الداكنة' },
} satisfies Record<string, Entry>

const pngSize = (b: Uint8Array) => {
  const v = new DataView(b.buffer, b.byteOffset, b.byteLength)
  return { width: v.getUint32(16), height: v.getUint32(20) }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function applyBrandKit(db: LibSQLDatabase<any>, opts: { force?: boolean; local?: boolean } = {}) {
  if (!existsSync(DIR)) return
  const [mark] = await db.select().from(s.settings).where(eq(s.settings.key, 'brand_kit'))
  if (!opts.force && (mark?.value as { version?: string } | undefined)?.version === KIT_VERSION) return

  /* يضع الملف (كما هو) في التخزين المحلي ويُدرج صفّه في المكتبة إن غاب — ويعيد معرّفه */
  const put = async (name: string, path: string, mime: string, alt: string) => {
    const bytes = new Uint8Array(readFileSync(join(DIR, path)))
    let width: number, height: number
    if (mime === 'image/svg+xml') {
      const c = sanitizeSvg(new TextDecoder().decode(bytes))
      if (!c) throw new Error(`brand-kit: ${path} ليس SVG صالحاً`)
      width = Math.round(c.w); height = Math.round(c.h)
    } else ({ width, height } = pngSize(bytes))
    const id = stableId(name)
    const key = `brand-${name}.${mime === 'image/png' ? 'png' : 'svg'}`
    if (opts.local !== false) { mkdirSync(MEDIA, { recursive: true }); writeFileSync(join(MEDIA, key), bytes) }
    await db.insert(s.media).values({ id, key, mime, width, height, size: bytes.length, alt }).onConflictDoUpdate({ target: s.media.id, set: { deletedAt: null, size: bytes.length, width, height } })
    return id
  }
  const both = async (k: keyof typeof FILES) => {
    const e = FILES[k]
    const svg = await put(`${k}-svg`, `${e.file}.svg`, 'image/svg+xml', e.alt)
    const png = await put(`${k}-png`, `${e.file}.png`, 'image/png', `${e.alt} (PNG)`)
    return { svg, png }
  }
  const slot = async (light: keyof typeof FILES, dark: keyof typeof FILES): Promise<LogoSlot> => {
    const [l, d] = [await both(light), await both(dark)]
    return { light: l.svg, lightPng: l.png, dark: d.svg, darkPng: d.png }
  }

  const [row] = await db.select().from(s.settings).where(eq(s.settings.key, 'brand'))
  const cur = mergeBrand(row?.value as Partial<BrandSettings> | null)
  const next: BrandSettings = {
    ...cur,
    lockup: await slot('lockupLight', 'lockupDark'),
    academy: await slot('compactLight', 'compactDark'),
    mark: await slot('iconLight', 'iconDark'),
    icon: await put('icon-square-512', 'icon-square-512.png', 'image/png', 'أيقونة أكاديمية ناف المربعة'),
    /* الاسم والوصف داخل ملفات الشعار */
    showName: false,
  }
  await db.insert(s.settings).values({ key: 'brand', value: next }).onConflictDoUpdate({ target: s.settings.key, set: { value: next } })
  await db.insert(s.settings).values({ key: 'brand_kit', value: { version: KIT_VERSION } }).onConflictDoUpdate({ target: s.settings.key, set: { value: { version: KIT_VERSION } } })
  /* الشهادات الصادرة تُولَّد ملفاتها من جديد بالشعار الجديد عند أول تنزيل */
  await db.update(s.certificates).set({ pdfKey: null })
  await db.insert(s.auditLog).values({ actor: 'system', action: 'update', entity: 'settings', entityId: 'brand', summary: `تطبيق حزمة الهوية ${KIT_VERSION}` })
  console.log(`brand-kit: applied ${KIT_VERSION}`)
}

if (process.argv[1]?.endsWith('brand-kit.ts')) {
  const { createClient } = await import('@libsql/client')
  const { drizzle } = await import('drizzle-orm/libsql')
  const url = process.env.DATABASE_URL ?? 'file:.data/academy.db'
  await applyBrandKit(drizzle(createClient({ url }), { schema: s }), { force: process.argv.includes('--force'), local: url.startsWith('file:') })
}
