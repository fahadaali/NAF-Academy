/* الترحيلات من التطبيق نفسه — بلا طرفية. الملفات محزومة عند البناء (migrations.generated.ts)، والسجل جدول d1_migrations
   بصيغة wrangler نفسها (id، name، applied_at): ما طبّقه `wrangler d1 migrations apply` يُعرف فلا يُكرَّر، والعكس.
   كل ملف دفعة واحدة — ذرّية على D1: إما يُطبَّق كاملاً أو لا شيء. بلا server-only (يختبره node:test). */
import type { Client } from '@libsql/client'
import { MIGRATIONS } from './migrations.generated'

/** منفّذ SQL خام: ارتباط D1 الأصلي في النشر، وعميل libsql في الاختبار */
export type Runner = {
  names(): Promise<string[]>
  /** الجمل كلها + سطر السجل في دفعة واحدة */
  apply(name: string, statements: string[]): Promise<void>
}

const TABLE = 'CREATE TABLE IF NOT EXISTS d1_migrations (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT UNIQUE, applied_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL)'

type D1Stmt = { bind(...v: unknown[]): D1Stmt; all(): Promise<{ results: Record<string, unknown>[] }>; run(): Promise<unknown> }
type D1 = { prepare(q: string): D1Stmt; batch(s: D1Stmt[]): Promise<unknown> }

export function d1Runner(d1: D1): Runner {
  return {
    async names() {
      await d1.prepare(TABLE).run()
      return (await d1.prepare('SELECT name FROM d1_migrations').all()).results.map((r) => String(r.name))
    },
    async apply(name, statements) {
      await d1.batch([...statements.map((q) => d1.prepare(q)), d1.prepare('INSERT INTO d1_migrations (name) VALUES (?)').bind(name)])
    },
  }
}

export function libsqlRunner(c: Client): Runner {
  return {
    async names() {
      await c.execute(TABLE)
      return (await c.execute('SELECT name FROM d1_migrations')).rows.map((r) => String(r.name))
    },
    async apply(name, statements) {
      await c.batch([...statements, { sql: 'INSERT INTO d1_migrations (name) VALUES (?)', args: [name] }], 'write')
    },
  }
}

/** المطبّقة والمعلّقة بالأسماء */
export async function migrationStatus(r: Runner): Promise<{ applied: string[]; pending: string[] }> {
  const done = new Set(await r.names())
  return { applied: MIGRATIONS.filter((m) => done.has(m.name)).map((m) => m.name), pending: MIGRATIONS.filter((m) => !done.has(m.name)).map((m) => m.name) }
}

/** يطبّق المعلّق بالترتيب، ويقف عند أول خطأ (فلا يُطبَّق ما بعده على أساس ناقص) */
export async function applyMigrations(r: Runner): Promise<{ applied: string[]; error?: string }> {
  const { pending } = await migrationStatus(r)
  const applied: string[] = []
  for (const name of pending) {
    const m = MIGRATIONS.find((x) => x.name === name)!
    try {
      await r.apply(name, m.statements)
      applied.push(name)
    } catch (e) {
      return { applied, error: `${name}: ${e instanceof Error ? e.message : String(e)}`.slice(0, 400) }
    }
  }
  return { applied }
}

export const MIGRATION_COUNT = MIGRATIONS.length
