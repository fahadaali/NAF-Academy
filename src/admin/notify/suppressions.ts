'use server'
/* قائمة الكتم — العنوان الذي ارتدّ بريده ارتداداً دائماً أو اشتكى صاحبه لا يُرسل إليه (src/server/notify/channels.ts).
   رفع الكتم بعد تصحيح العنوان أو طلب صاحبه — بصلاحية القنوات، ويُدقَّق. */
import { revalidatePath } from 'next/cache'
import { eq } from 'drizzle-orm'
import { z } from 'zod'
import { db, schema as s } from '@/server/db'
import { requirePermission } from '@/server/auth'
import { audit } from '@/server/audit'

export async function unsuppress(email: string): Promise<{ ok: boolean; error?: string }> {
  const st = await requirePermission('channels.manage')
  const e = z.string().trim().toLowerCase().email().safeParse(email)
  if (!e.success) return { ok: false, error: 'بريد غير صالح' }
  const [row] = await db.select().from(s.mailSuppressions).where(eq(s.mailSuppressions.email, e.data))
  if (!row) return { ok: false, error: 'العنوان غير مكتوم' }
  await db.delete(s.mailSuppressions).where(eq(s.mailSuppressions.email, e.data))
  await audit(st.name, 'unsuppress', 'mail', e.data, `رفع الكتم عن ${e.data}`, row)
  revalidatePath('/admin/messages')
  return { ok: true }
}
