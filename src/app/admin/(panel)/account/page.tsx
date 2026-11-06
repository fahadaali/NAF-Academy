import { eq } from 'drizzle-orm'
import { requireAdmin } from '@/server/auth'
import { db, schema as s } from '@/server/db'
import { ROLE_LABEL } from '@/lib/permissions'
import { AccountBoard } from '@/admin/account/AccountBoard'

const fmt = (sec: number | null) => sec ? new Intl.DateTimeFormat('ar-SA-u-nu-latn', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Riyadh' }).format(sec * 1000) : null

export default async function Account() {
  const me = await requireAdmin()
  const [m] = await db.select({ passwordSetAt: s.members.passwordSetAt }).from(s.members).where(eq(s.members.userId, me.id))
  return <AccountBoard name={me.name} email={me.email} role={ROLE_LABEL[me.role]} totp={me.totp} passwordSetAt={fmt(m?.passwordSetAt ?? null)} />
}
