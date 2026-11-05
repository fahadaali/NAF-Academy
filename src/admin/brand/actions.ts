'use server'
/* الهوية — حفظ الشعارات والأسماء. يُعاد توليد الصفحات فوراً، وتُعلَّم ملفات الشهادات الصادرة
   لتُولَّد من جديد بالشعار الجديد عند أول تنزيل (نصّها ولقطتها كما هي). */
import { revalidatePath } from 'next/cache'
import { inArray, isNotNull } from 'drizzle-orm'
import { z } from 'zod'
import { db, schema as s } from '@/server/db'
import { requirePermission } from '@/server/auth'
import { audit } from '@/server/audit'
import { setSetting } from '@/server/settings'
import { LOGO_MIME } from '@/lib/brand'

const id = z.string().uuid().nullable()
const input = z.object({
  name: z.string().trim().min(2, 'اسم الأكاديمية مطلوب').max(60),
  tagline: z.string().trim().max(80),
  companyName: z.string().trim().min(2, 'اسم الشركة مطلوب').max(80),
  showName: z.boolean(),
  academy: z.object({ light: id, dark: id }),
  naf: z.object({ light: id, dark: id }),
  icon: id,
})
export type BrandInput = z.input<typeof input>

export async function saveBrand(raw: BrandInput): Promise<{ ok: boolean; error?: string }> {
  const st = await requirePermission('site.write')
  const p = input.safeParse(raw)
  if (!p.success) return { ok: false, error: p.error.issues[0]?.message ?? 'بيانات غير صالحة' }
  const v = p.data
  const ids = [v.academy.light, v.academy.dark, v.naf.light, v.naf.dark, v.icon].filter((x): x is string => !!x)
  if (ids.length) {
    const rows = await db.select({ id: s.media.id, mime: s.media.mime, w: s.media.width, h: s.media.height }).from(s.media).where(inArray(s.media.id, ids))
    if (rows.length !== new Set(ids).size) return { ok: false, error: 'صورة غير موجودة في المكتبة' }
    if (rows.some((r) => !LOGO_MIME.includes(r.mime))) return { ok: false, error: 'الشعارات بصيغة PNG فقط (بخلفية شفافة) — لتعمل في البريد والشهادة وصور المشاركة' }
    const icon = rows.find((r) => r.id === v.icon)
    if (icon && (icon.w !== icon.h || icon.w < 192)) return { ok: false, error: 'الأيقونة مربعة بمقاس 192×192 على الأقل (يُفضَّل 512×512)' }
  }
  await setSetting('brand', v)
  /* الشهادات الصادرة: يُعاد توليد ملفها بالشعار الجديد عند أول تنزيل */
  await db.update(s.certificates).set({ pdfKey: null }).where(isNotNull(s.certificates.pdfKey))
  await audit(st.name, 'update', 'settings', 'brand', `${v.name} · شعارات: ${ids.length}`)
  revalidatePath('/', 'layout')
  return { ok: true }
}
