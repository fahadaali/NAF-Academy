import 'server-only'
/* اتصال قاعدة البيانات — libsql بملف محلي في التطوير (.data/academy.db).
   في النشر على Cloudflare يُستبدل المشغّل بـ drizzle-orm/d1 والمخطط نفسه. */
import { createClient } from '@libsql/client'
import { drizzle } from 'drizzle-orm/libsql'
import * as schema from './schema'

export type DB = ReturnType<typeof make>

function make() {
  const url = process.env.DATABASE_URL ?? 'file:.data/academy.db'
  const client = createClient({ url })
  /* D1 يفرض المفاتيح الأجنبية — نفرضها محلياً أيضاً كي لا يختلف السلوك */
  void client.execute('PRAGMA foreign_keys = ON')
  return drizzle(client, { schema })
}

const g = globalThis as unknown as { __academyDb?: DB }
export const db: DB = g.__academyDb ?? (g.__academyDb = make())
export { schema }
