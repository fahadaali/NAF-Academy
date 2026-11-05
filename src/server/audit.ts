import 'server-only'
import { db, schema as s } from './db'

export async function audit(actor: string, action: string, entity: string, entityId: string, summary: string, snapshot?: unknown) {
  await db.insert(s.auditLog).values({ actor, action, entity, entityId, summary, snapshot: snapshot ?? null })
}
