/* حزمة الهوية المعتمدة (src/content/brand-kit) ← مكتبة الوسائط وإعداد «الهوية والشعارات».
   تُطبَّق مرة لكل إصدار من الحزمة (العلامة settings['brand_kit'])، فما يغيّره المدير من اللوحة بعدها يبقى.
   الملفات تُنسخ كما هي حرفياً بمفاتيح ومعرّفات ثابتة. مشتركة بين db-setup (القرص) وصفحة /setup في النشر (ASSETS وR2)
   — لذلك بلا server-only ولا fs. */
import { createHash } from 'node:crypto'
import { eq } from 'drizzle-orm'
import type { LibSQLDatabase } from 'drizzle-orm/libsql'
import * as s from '../db/schema'
import { sanitizeSvg } from '../svg'
import { mergeBrand, type BrandSettings, type LogoSlot } from '@/lib/brand'

/** غيّره عند استلام حزمة جديدة معتمدة لتُطبَّق مرة أخرى */
export const KIT_VERSION = '2026-11-05'

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

/** قارئ ملفات الحزمة (مسار نسبي داخلها ← البايتات أو null) وكاتب التخزين (المفتاح ← البايتات) — القرص محلياً، وASSETS وR2 في النشر */
export type KitIO = { load(path: string): Promise<Uint8Array | null>; put(key: string, bytes: Uint8Array, mime: string): Promise<void> }

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function applyBrandKit(db: LibSQLDatabase<any>, io: KitIO, opts: { force?: boolean } = {}): Promise<'applied' | 'current' | 'missing'> {
  if (!(await io.load('icon-square-512.png'))) return 'missing'
  const [mark] = await db.select().from(s.settings).where(eq(s.settings.key, 'brand_kit'))
  if (!opts.force && (mark?.value as { version?: string } | undefined)?.version === KIT_VERSION) return 'current'

  /* يضع الملف (كما هو) في التخزين المحلي ويُدرج صفّه في المكتبة إن غاب — ويعيد معرّفه */
  const put = async (name: string, path: string, mime: string, alt: string) => {
    const bytes = await io.load(path)
    if (!bytes) throw new Error(`brand-kit: ${path} غير موجود`)
    let width: number, height: number
    if (mime === 'image/svg+xml') {
      const c = sanitizeSvg(new TextDecoder().decode(bytes))
      if (!c) throw new Error(`brand-kit: ${path} ليس SVG صالحاً`)
      width = Math.round(c.w); height = Math.round(c.h)
    } else ({ width, height } = pngSize(bytes))
    const id = stableId(name)
    const key = `brand-${name}.${mime === 'image/png' ? 'png' : 'svg'}`
    await io.put(key, bytes, mime)
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
  return 'applied'
}
