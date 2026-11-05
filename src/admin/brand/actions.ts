'use server'
/* الهوية — حفظ الشعارات والأسماء. يُعاد توليد الصفحات فوراً، وتُعلَّم ملفات الشهادات الصادرة
   لتُولَّد من جديد بالشعار الجديد عند أول تنزيل (نصّها ولقطتها كما هي). */
import { revalidatePath } from 'next/cache'
import { isNotNull } from 'drizzle-orm'
import { z } from 'zod'
import { db, schema as s } from '@/server/db'
import { requirePermission } from '@/server/auth'
import { audit } from '@/server/audit'
import { setSetting } from '@/server/settings'
import { LOGO_MIME, LOGO_SLOTS } from '@/lib/brand'
import { inList } from '@/server/db/limits'

const id = z.string().uuid().nullable()
/* لكل صيغة نسختان (فاتحة وداكنة)، ولكل ملف متجه توأم PNG للبريد وPDF وصور المشاركة */
const slot = z.object({ light: id, dark: id, lightPng: id, darkPng: id })
const input = z.object({
  name: z.string().trim().min(2, 'اسم الأكاديمية مطلوب').max(60),
  tagline: z.string().trim().max(80),
  companyName: z.string().trim().min(2, 'اسم الشركة مطلوب').max(80),
  showName: z.boolean(),
  academy: slot,
  lockup: slot,
  mark: slot,
  icon: id,
})
export type BrandInput = z.input<typeof input>

export async function saveBrand(raw: BrandInput): Promise<{ ok: boolean; error?: string }> {
  const st = await requirePermission('site.write')
  const p = input.safeParse(raw)
  if (!p.success) return { ok: false, error: p.error.issues[0]?.message ?? 'بيانات غير صالحة' }
  const v = p.data
  const shown = LOGO_SLOTS.flatMap((k) => [v[k].light, v[k].dark]).filter((x): x is string => !!x)
  const twins = LOGO_SLOTS.flatMap((k) => [v[k].lightPng, v[k].darkPng]).filter((x): x is string => !!x)
  const ids = [...shown, ...twins, ...(v.icon ? [v.icon] : [])]
  if (ids.length) {
    const rows = await db.select({ id: s.media.id, mime: s.media.mime, w: s.media.width, h: s.media.height }).from(s.media).where(inList(s.media.id, ids))
    if (rows.length !== new Set(ids).size) return { ok: false, error: 'صورة غير موجودة في المكتبة' }
    const mime = (x: string) => rows.find((r) => r.id === x)?.mime ?? ''
    if (shown.some((x) => !LOGO_MIME.includes(mime(x)))) return { ok: false, error: 'الشعار بصيغة SVG أو PNG بخلفية شفافة' }
    if (twins.some((x) => mime(x) !== 'image/png')) return { ok: false, error: 'النسخة النقطية للشعار بصيغة PNG' }
    /* الملف المتجه يحتاج توأمه النقطي — وإلا غاب الشعار عن البريد والشهادة وصور المشاركة */
    for (const k of LOGO_SLOTS) for (const t of ['light', 'dark'] as const) {
      const f = v[k][t]
      if (f && mime(f) === 'image/svg+xml' && !v[k][`${t}Png`]) return { ok: false, error: 'لكل شعار SVG نسخة PNG — أعد اختيار الملف ليولّدها المحرّر' }
      if (f && mime(f) === 'image/png') v[k][`${t}Png`] = null
      if (!f) v[k][`${t}Png`] = null
    }
    const icon = rows.find((r) => r.id === v.icon)
    if (icon && (icon.mime !== 'image/png' || icon.w !== icon.h || icon.w < 192)) return { ok: false, error: 'الأيقونة PNG مربعة بمقاس 192×192 على الأقل (يُفضَّل 512×512)' }
  }
  await setSetting('brand', v)
  /* الشهادات الصادرة: يُعاد توليد ملفها بالشعار الجديد عند أول تنزيل */
  await db.update(s.certificates).set({ pdfKey: null }).where(isNotNull(s.certificates.pdfKey))
  await audit(st.name, 'update', 'settings', 'brand', `${v.name} · شعارات: ${ids.length}`)
  revalidatePath('/', 'layout')
  return { ok: true }
}
