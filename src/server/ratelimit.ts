import 'server-only'
/* حدّ المحاولات — عدّاد بنافذة ثابتة في جدول rate_limits (D1 في النشر، libsql محلياً)، فيصمد عبر نسخ العامل.
   كل احتساب upsert ذرّي واحد يعيد العدد بعده؛ وما انتهت نافذته يبدأ من 1. والجدول نفسه يحفظ أحداث Webhook
   المستلمة (`seen:…`) فلا يُعاد تنفيذ حدث مكرر.
   قبل التهيئة (لا جداول بعد) أو عند تعذّر القاعدة: عدّاد في الذاكرة لكل نسخة — لا يُرجع خطأً. */
import { headers } from 'next/headers'
import { after } from 'next/server'
import { eq, lt, sql } from 'drizzle-orm'
import { db, schema as s } from './db'
import { notMigrated } from './settings'

const mem = new Map<string, { n: number; reset: number }>()

function fallback(e: unknown) {
  if (!notMigrated(e)) console.error('ratelimit', e)
}

function memBump(key: string, windowMs: number, now: number) {
  const cur = mem.get(key)
  if (!cur || cur.reset <= now) {
    mem.set(key, { n: 1, reset: now + windowMs })
    if (mem.size > 5000) for (const [k, v] of mem) if (v.reset <= now) mem.delete(k)
    return 1
  }
  return ++cur.n
}

/** يحتسب محاولة على المفتاح ويعيد عددها في النافذة الحالية (ذرّياً) */
export async function bump(key: string, windowMs: number, now = Date.now()): Promise<number> {
  const t = s.rateLimits
  try {
    const [r] = await db.insert(t).values({ key, n: 1, resetAt: now + windowMs })
      .onConflictDoUpdate({
        target: t.key,
        set: {
          n: sql`case when ${t.resetAt} <= ${now} then 1 else ${t.n} + 1 end`,
          resetAt: sql`case when ${t.resetAt} <= ${now} then ${now + windowMs} else ${t.resetAt} end`,
        },
      })
      .returning({ n: t.n })
    /* تنظيف عابر: المنتهي لا يؤثر في العدّ (يبدأ من 1) لكنه يشغل مكاناً */
    if (Math.random() < 0.02) await db.delete(t).where(lt(t.resetAt, now)).catch(() => {})
    return r?.n ?? 1
  } catch (e) {
    fallback(e)
    return memBump(key, windowMs, now)
  }
}

/** العدد الحالي في النافذة دون احتساب */
export async function peek(key: string, now = Date.now()): Promise<number> {
  try {
    const [r] = await db.select().from(s.rateLimits).where(eq(s.rateLimits.key, key))
    return r && r.resetAt > now ? r.n : 0
  } catch (e) {
    fallback(e)
    const cur = mem.get(key)
    return cur && cur.reset > now ? cur.n : 0
  }
}

/** يمحو المفتاح (مثلاً: حدث Webhook تعذّرت معالجته فيُقبل إن أُعيد) */
export async function forget(key: string): Promise<void> {
  mem.delete(key)
  await db.delete(s.rateLimits).where(eq(s.rateLimits.key, key)).catch((e) => fallback(e))
}

/** نافذة إسقاط أحداث Webhook المكررة: ضعف مهلة التوقيع (خمس دقائق) — وما بعدها يرفضه التوقيع نفسه */
export const REPLAY_WINDOW = 10 * 60e3

/** أول مرة يُرى فيها المفتاح خلال النافذة؟ — لإسقاط أحداث Webhook المكررة (إعادة الإرسال) */
export async function firstSeen(key: string, windowMs: number, now = Date.now()): Promise<boolean> {
  return (await bump(`seen:${key}`, windowMs, now)) === 1
}
export const forgetSeen = (key: string) => forget(`seen:${key}`)

async function clientIp() {
  const h = await headers()
  return h.get('cf-connecting-ip') ?? h.get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'local'
}

/** كل نداء يُحتسب؛ true إن تجاوز العنوان الحدّ في النافذة */
export async function limited(bucket: string, max: number, windowMs: number): Promise<boolean> {
  return (await bump(`${bucket}:${await clientIp()}`, windowMs)) > max
}

/** حدّ تقريبي في ذاكرة النسخة وحدها — لما يكثر جداً ولا يحمي سراً (عدّاد الزيارات): لا كتابة في القاعدة لكل زيارة */
export async function limitedLocal(bucket: string, max: number, windowMs: number): Promise<boolean> {
  return memBump(`${bucket}:${await clientIp()}`, windowMs, Date.now()) > max
}

/** يُبقي الكتابة حيّة بعد الردّ (waitUntil في Workers) لمن لا ينتظرها */
function keep(p: Promise<unknown>) {
  try { after(p) } catch { /* خارج طلب (الاختبارات) */ }
}

/** للمحاولات الخاطئة وحدها: blocked يسأل دون أن يحتسب، وfail يحتسب محاولة فاشلة — فالدخول الناجح لا يستهلك الحدّ.
    scope «global» عدّاد واحد لكل العناوين (لما لا يجوز تخمينه موزّعاً، ككلمة مرور الإعداد). */
export async function failures(bucket: string, max: number, windowMs: number, scope: 'ip' | 'global' = 'ip') {
  const key = scope === 'global' ? `${bucket}:*` : `${bucket}:${await clientIp()}`
  const seen = await peek(key)
  return {
    blocked() {
      return seen >= max
    },
    fail(): Promise<void> {
      const p = bump(key, windowMs).then(() => {})
      keep(p)
      return p
    },
  }
}
