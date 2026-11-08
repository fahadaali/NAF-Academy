import 'server-only'
/* اتصال القاعدة: D1 داخل Cloudflare (ارتباط DB)، وlibsql بملف محلي في التطوير (.data/academy.db).
   المخطط والاستعلامات نفسها في الحالتين — `db` وكيل يختار المشغّل لكل نداء. */
import { createClient } from '@libsql/client'
import { drizzle as libsql, type LibSQLDatabase } from 'drizzle-orm/libsql'
import { drizzle as d1 } from 'drizzle-orm/d1'
import * as schema from './schema'
import { cfEnv } from '../runtime'

export type DB = LibSQLDatabase<typeof schema>

const g = globalThis as unknown as { __academyLocal?: DB; __academyD1?: WeakMap<object, DB> }

function local(): DB {
  if (g.__academyLocal) return g.__academyLocal
  /* timeout: مهلة انتظار قفل الملف (ملّي ثانية) لكل اتصال في مجمّع العميل. خادم التطوير يشغّل أكثر من خيط،
     لكلٍّ مجمّعه، فتتزامن كتابتان أحياناً (عدّاد الزيارات مع إجراء في اللوحة) — وبلا مهلة تفشل الثانية فوراً
     بـ «database is locked» (ظهر في CI). الانتظار متزامن فلا يصلح إلا لأن الشيفرة لا تُبقي معاملة مفتوحة عبر await. */
  const client = createClient({ url: process.env.DATABASE_URL ?? 'file:.data/academy.db', timeout: 3000 })
  /* D1 يفرض المفاتيح الأجنبية — نفرضها محلياً أيضاً كي لا يختلف السلوك */
  void client.execute('PRAGMA foreign_keys = ON')
  return (g.__academyLocal = libsql(client, { schema }))
}

function current(): DB {
  const binding = cfEnv()?.DB as object | undefined
  if (!binding) return local()
  const cache = (g.__academyD1 ??= new WeakMap())
  let inst = cache.get(binding)
  if (!inst) {
    inst = d1(binding as Parameters<typeof d1>[0], { schema }) as unknown as DB
    cache.set(binding, inst)
  }
  return inst
}

export const db: DB = new Proxy({} as DB, {
  get(_, key) {
    const inst = current() as unknown as Record<PropertyKey, unknown>
    const v = inst[key]
    return typeof v === 'function' ? (v as (...a: unknown[]) => unknown).bind(inst) : v
  },
})

export { schema }
