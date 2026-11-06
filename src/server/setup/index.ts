import 'server-only'
/* التهيئة في النشر: الترحيلات من التطبيق، والبذرة، وحزمة الهوية إلى R2، والمالك الأول — من صفحة /setup بلا طرفية.
   محلياً يطبّق db-setup الترحيلات (drizzle) فلا تُطبَّق هنا. */
import { and, count, eq } from 'drizzle-orm'
import { db, schema as s } from '../db'
import { cfEnv } from '../runtime'
import { putObject } from '../storage'
import { applyMigrations, d1Runner, migrationStatus, MIGRATION_COUNT, type Runner } from './migrate'
import { isEmpty, seedContent } from './seed'
import { applyBrandKit, KIT_VERSION, type KitIO } from './brand-kit'

/** على D1 (النشر)؟ — الترحيلات من التطبيق هناك وحده */
export const onD1 = () => !!cfEnv()?.DB
const runner = (): Runner => d1Runner(cfEnv()!.DB as Parameters<typeof d1Runner>[0])

/** الحزمة: من ASSETS في النشر (public/_kit)، ومن المستودع محلياً؛ والكتابة إلى التخزين (R2 أو .data/media) */
const kitIO: KitIO = {
  async load(p) {
    const assets = cfEnv()?.ASSETS as { fetch(r: Request): Promise<Response> } | undefined
    if (assets) {
      const r = await assets.fetch(new Request(`https://assets.local/_kit/${p}`))
      return r.ok ? new Uint8Array(await r.arrayBuffer()) : null
    }
    try {
      const { readFile } = await import('node:fs/promises')
      return new Uint8Array(await readFile(`${process.cwd()}/src/content/brand-kit/${p}`))
    } catch {
      return null
    }
  },
  put: (key, bytes, mime) => putObject(key, bytes, mime),
}

export type SetupStatus = {
  d1: boolean
  migrations: { applied: number; pending: string[]; total: number }
  seeded: boolean
  brandKit: boolean
  owner: boolean
}

export async function setupStatus(): Promise<SetupStatus> {
  const d1 = onD1()
  const m = d1 ? await migrationStatus(runner()) : { applied: [] as string[], pending: [] as string[] }
  /* قبل الترحيلات لا جداول — كل ما بعدها «لم يتم» */
  const ready = !m.pending.length || m.applied.length > 0
  let seeded = false, brandKit = false, owner = false
  if (ready) {
    try {
      seeded = !(await isEmpty(db))
      const [k] = await db.select().from(s.settings).where(eq(s.settings.key, 'brand_kit'))
      brandKit = (k?.value as { version?: string } | undefined)?.version === KIT_VERSION
      const [o] = await db.select({ n: count() }).from(s.members).where(and(eq(s.members.role, 'owner'), eq(s.members.isActive, 1)))
      owner = o.n > 0
    } catch { /* جداول ناقصة: الترحيلات لم تكتمل */ }
  }
  return { d1, migrations: { applied: d1 ? m.applied.length : MIGRATION_COUNT, pending: m.pending, total: MIGRATION_COUNT }, seeded, brandKit, owner }
}

export type SetupResult = { ok: boolean; steps: string[]; error?: string }

/** التهيئة كاملة — كل خطوة لا تتكرر إن تمّت (آمنة لإعادة الضغط) */
export async function runSetup(o: { ownerEmail?: string; seed: boolean }): Promise<SetupResult> {
  const steps: string[] = []
  if (onD1()) {
    const r = await applyMigrations(runner())
    if (r.applied.length) steps.push(`طُبّق ${r.applied.length} ترحيل`)
    if (r.error) return { ok: false, steps, error: `تعذّر الترحيل — ${r.error}` }
    if (!r.applied.length) steps.push('الترحيلات مطبّقة من قبل')
  }
  if (o.seed) {
    const r = await seedContent(db)
    steps.push(r ? `بُذر ${r.tracks} مسار و${r.courses} دورة و${r.instructors} مدرب` : 'المحتوى موجود من قبل — لم يُبذر شيء')
  }
  const k = await applyBrandKit(db, kitIO)
  steps.push(k === 'applied' ? 'طُبّقت حزمة الهوية ورُفعت ملفاتها' : k === 'current' ? 'حزمة الهوية مطبّقة من قبل' : 'ملفات حزمة الهوية غير موجودة في النشر')
  if (o.ownerEmail) {
    const [has] = await db.select({ n: count() }).from(s.members).where(and(eq(s.members.role, 'owner'), eq(s.members.isActive, 1)))
    if (has.n) steps.push('للمنصة مالك من قبل — لم يُضف غيره')
    else {
      const email = o.ownerEmail
      const [existing] = await db.select().from(s.members).where(eq(s.members.email, email))
      /* دخل من قبل بالدخول الموحّد («بانتظار التفعيل»)؟ يُرقّى. وإلا دعوة تُربط بحسابه عند أول دخول */
      if (existing) await db.update(s.members).set({ role: 'owner', isActive: 1 }).where(eq(s.members.userId, existing.userId))
      else await db.insert(s.members).values({ userId: `invite:${email}`, email, role: 'owner', isActive: 1, createdAt: Math.floor(Date.now() / 1000) })
      steps.push(`${email} مالكاً — ادخل ببريده من /admin`)
    }
  }
  await db.insert(s.auditLog).values({ actor: 'setup', action: 'setup', entity: 'site', entityId: '-', summary: steps.join(' · ').slice(0, 500) })
  return { ok: true, steps }
}

/** للمشغّل الدوري واللوحة: ترحيلات معلّقة بعد نشر جديد تُطبَّق وحدها */
export async function autoMigrate() {
  if (!onD1()) return null
  const { pending } = await migrationStatus(runner())
  if (!pending.length) return null
  return applyMigrations(runner())
}
