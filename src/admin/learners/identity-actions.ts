'use server'
/* تصحيح هوية المتدرب من ملفه في اللوحة — الاسمان ورقم الهوية والجوال ثابتة على المتدرب بعد إكمالها، ويصحّحها الفريق هنا وحده.
   صلاحية learners.identity ← تحقق zod ← تفرّد الرقم والجوال (writeIdentity) ← سجل برقم مقنّع ← إعادة توليد. */
import { revalidatePath } from 'next/cache'
import { eq } from 'drizzle-orm'
import { z } from 'zod'
import { db, schema as s } from '@/server/db'
import { requirePermission } from '@/server/auth'
import { audit } from '@/server/audit'
import { writeIdentity } from '@/server/identity'
import { IDENTITY_LABEL, identityComplete, identityGaps, maskId, normalizeDigits, validArabicName, validEnglishName, validNationalId } from '@/lib/identity'
import { normalizePhone } from '@/lib/phone'

const input = z.object({
  id: z.string().uuid(),
  name: z.string().trim().max(120).refine(validArabicName, 'الاسم بالعربية بحروف عربية وكلمتين فأكثر'),
  nameEn: z.string().trim().max(120).refine((v) => v === '' || validEnglishName(v), 'الاسم بالإنجليزية بحروف لاتينية وكلمتين فأكثر'),
  nationalId: z.string().max(20).transform(normalizeDigits).refine((v) => v === '' || validNationalId(v), 'رقم الهوية غير صحيح — 10 أرقام تبدأ بـ 1 أو 2'),
  phone: z.string().trim().max(20),
  reason: z.string().trim().min(3, 'اذكر سبب التصحيح').max(300),
})

export async function setLearnerIdentity(raw: unknown): Promise<{ ok: boolean; error?: string }> {
  const st = await requirePermission('learners.identity')
  const p = input.safeParse(raw)
  if (!p.success) return { ok: false, error: p.error.issues[0]?.message }
  const v = p.data
  const phone = v.phone ? normalizePhone(v.phone) : ''
  if (v.phone && !phone) return { ok: false, error: 'رقم جوال غير صالح' }
  const [old] = await db.select().from(s.learners).where(eq(s.learners.id, v.id))
  if (!old) return { ok: false, error: 'المتدرب غير موجود' }
  /* الهوية المكتملة تبقى مكتملة: تفريغ حقل يفكّ ثبات الاسمين فيعيد تسميتها المتدرب */
  const gaps = identityGaps({ name: v.name, nameEn: v.nameEn, nationalId: v.nationalId, phone: phone ?? '' })
  if (identityComplete(old) && gaps.length) return { ok: false, error: `الهوية مكتملة — التصحيح يبقيها مكتملة: ${gaps.map((g) => IDENTITY_LABEL[g]).join('، ')}` }
  const r = await writeIdentity(v.id, { name: v.name, nameEn: v.nameEn, nationalId: v.nationalId, phone: phone ?? '' })
  if (!r.ok) return r
  /* السجل بلا رقم الهوية كاملاً: ما تغيّر وسببه */
  const changed = (['name', 'nameEn', 'nationalId', 'phone'] as const).filter((k) => (k === 'phone' ? phone ?? '' : v[k]) !== old[k])
  const shown = (k: (typeof changed)[number], x: string) => (k === 'nationalId' ? maskId(x) : x)
  await audit(st.name, 'identity', 'learner', v.id, `${changed.join('، ') || 'بلا تغيير'} — ${v.reason}`,
    Object.fromEntries(changed.map((k) => [k, { from: shown(k, old[k]), to: shown(k, k === 'phone' ? phone ?? '' : v[k]) }])))
  revalidatePath(`/admin/learners/${v.id}`)
  revalidatePath('/learn', 'layout')
  return { ok: true }
}
