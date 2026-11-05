/* حدود D1: الاستعلام الواحد لا يقبل أكثر من 100 معامل مربوط (libsql المحلي يقبل آلافاً فلا يظهر الخطأ إلا في النشر).
   قاعدتان في كل المنصة:
   - قائمة معرّفات غير محدودة الطول ← inList(): معامل واحد (JSON) مهما طالت القائمة.
   - إدخال صفوف كثيرة ← chunksOf(): دفعات لا تتجاوز 100 معامل بحسب عدد أعمدة الجدول. */
import { getTableColumns, sql, type SQL, type SQLWrapper } from 'drizzle-orm'
import type { SQLiteTable } from 'drizzle-orm/sqlite-core'

export const MAX_PARAMS = 100

/** ‎`col IN (…)` بمعامل واحد عبر json_each — بديل inArray للقوائم التي قد تطول */
export function inList(col: SQLWrapper, values: readonly (string | number)[]): SQL {
  return sql`${col} in (select value from json_each(${JSON.stringify(values)}))`
}

/** يقسم صفوف الإدخال إلى دفعات آمنة لجدولها: كل عمود معامل محتمل في كل صف */
export function chunksOf<T>(table: SQLiteTable, rows: readonly T[]): T[][] {
  const cols = Math.max(1, Object.keys(getTableColumns(table)).length)
  const per = Math.max(1, Math.floor(MAX_PARAMS / cols))
  const out: T[][] = []
  for (let i = 0; i < rows.length; i += per) out.push(rows.slice(i, i + per))
  return out
}
