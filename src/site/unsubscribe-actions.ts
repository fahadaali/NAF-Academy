'use server'
/* تفضيلات الرسائل الاختيارية — من رابط البريد الموقّع أو من ملف المتدرب */
import { currentLearner } from '@/server/learner-auth'
import { readOptout, setOptout } from '@/server/notify/optout'

export async function setOptoutByToken(token: string, out: boolean): Promise<{ ok: boolean }> {
  const email = readOptout(token)
  if (!email) return { ok: false }
  await setOptout(email, out)
  return { ok: true }
}

export async function setMyOptout(out: boolean): Promise<{ ok: boolean }> {
  const me = await currentLearner()
  if (!me?.email) return { ok: false }
  await setOptout(me.email, out)
  return { ok: true }
}
