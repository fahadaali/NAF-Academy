/* إعداد الدخول الموحّد (naf-auth) لفريق ناف — لا منطق مصادقة هنا، كله في الحزمة.
   المحمي: /admin وحده. الموقع العام ومساحة المتدربين خارج الوسيط تماماً. */
import { createConfig, type AuthConfig, type Claims } from 'naf-auth'

export function ssoConfig(env: Record<string, unknown>): AuthConfig {
  return createConfig(env, {
    publicPaths: ['/auth/callback', '/auth/backchannel-logout', '/auth/logout', '/denied', '/admin/login'],
    publicPrefixes: [],
    deniedPath: '/denied',
    /* من يدخل أول مرة بلا دعوة: «بانتظار التفعيل» — ليس دوراً، فلا يرى من اللوحة شيئاً
       حتى يمنحه المالك دوراً من «الفريق والصلاحيات». المدعوّ بالبريد يحتفظ بدوره (linkInvite قبل الإدراج) */
    defaultRole: 'pending',
    timeFormat: 'epoch',
    onClaims: linkInvite,
  })
}

/** دعوة مسبقة بالبريد: صفّ members بمعرّف invite:<email> يُربط بـ sub عند أول دخول فيحتفظ بدوره */
async function linkInvite(claims: Claims, env: Record<string, unknown>, config: AuthConfig) {
  const email = typeof claims.email === 'string' ? claims.email.toLowerCase() : ''
  if (!email) return
  const db = env[config.dbBinding] as { prepare(q: string): { bind(...a: unknown[]): { run(): Promise<unknown>; first(): Promise<unknown> } } }
  const exists = await db.prepare('SELECT user_id FROM members WHERE user_id = ?').bind(claims.sub).first()
  if (exists) return
  await db.prepare('UPDATE members SET user_id = ?, display_name = COALESCE(?, display_name) WHERE user_id = ?')
    .bind(claims.sub, typeof claims.name === 'string' ? claims.name : null, `invite:${email}`).run()
}
