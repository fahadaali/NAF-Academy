/* قائمة المشاركين — تحليل ما يُلصق أو يُرفع (CSV من Excel، أو أعمدة منسوخة من جدول) إلى صفوف مُتحقَّق منها.
   دالة نقية مختبرة، يستعملها المتصفح للمعاينة والخادم للتحقق مرة ثانية. */
import { normalizePhone } from './phone'

export type RosterRow = { line: number; email: string; name: string; phone: string; error?: string }

export const ROSTER_MAX = 500
/** صفوف كل استدعاء للخادم (حدود D1 لكل طلب) — المتصفح يرسل القائمة دفعات */
export const ROSTER_BATCH = 25

const EMAIL = /^[^\s@,;]+@[^\s@,;]+\.[^\s@,;]+$/
const HEAD: Record<'email' | 'name' | 'phone', RegExp> = {
  email: /^(e-?mail|mail|البريد|البريد الإلكتروني|البريد الالكتروني|الإيميل|الايميل)$/i,
  name: /^(name|full ?name|الاسم|الاسم الكامل|اسم المشارك|اسم الطالب|اسم المتدرب)$/i,
  phone: /^(phone|mobile|tel|الجوال|رقم الجوال|الهاتف|رقم الهاتف|الموبايل)$/i,
}

/** سطر CSV بعلامات اقتباس ("…""…") — الفاصل المعطى */
function cells(line: string, sep: string): string[] {
  const out: string[] = []
  let cur = ''
  let q = false
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]
    if (q) {
      if (ch === '"' && line[i + 1] === '"') { cur += '"'; i++ }
      else if (ch === '"') q = false
      else cur += ch
    } else if (ch === '"' && !cur.trim()) q = true
    else if (ch === sep) { out.push(cur); cur = '' }
    else cur += ch
  }
  out.push(cur)
  return out.map((c) => c.replace(/^﻿/, '').trim())
}

/** الفاصل: Tab (نسخ من جدول) ثم الفاصلة المنقوطة ثم الفاصلة (العربية أو اللاتينية) */
function separator(lines: string[]): string {
  const probe = lines.slice(0, 5).join('\n')
  if (probe.includes('\t')) return '\t'
  const count = (c: string) => probe.split(c).length - 1
  if (count(';') > count(',') && count(';') >= count('،')) return ';'
  return count('،') > count(',') ? '،' : ','
}

/**
 * يحلّل القائمة: برأس أعمدة (البريد/الاسم/الجوال بالعربية أو الإنجليزية) أو بلا رأس (يُعرف البريد بـ@ والجوال بأرقامه).
 * البريد شرط، والجوال اختياري ويُطبَّع، والمكرر يُعلَّم. يقف عند ROSTER_MAX صفاً.
 */
export function parseRoster(text: string): { rows: RosterRow[]; truncated: boolean } {
  const lines = text.replace(/\r\n?/g, '\n').split('\n')
  const filled = lines.map((l, i) => ({ l, i })).filter((x) => x.l.trim())
  if (!filled.length) return { rows: [], truncated: false }
  const sep = separator(filled.map((x) => x.l))
  let map: Partial<Record<'email' | 'name' | 'phone', number>> | null = null
  const first = cells(filled[0].l, sep)
  if (!first.some((c) => c.includes('@'))) {
    const m: Partial<Record<'email' | 'name' | 'phone', number>> = {}
    first.forEach((c, i) => { for (const k of ['email', 'name', 'phone'] as const) if (m[k] === undefined && HEAD[k].test(c.trim())) m[k] = i })
    if (m.email !== undefined) { map = m; filled.shift() }
  }
  const seen = new Set<string>()
  const rows: RosterRow[] = []
  for (const { l, i } of filled) {
    if (rows.length >= ROSTER_MAX) return { rows, truncated: true }
    const c = cells(l, sep)
    let email = '', name = '', phone = ''
    if (map) {
      email = c[map.email!] ?? ''
      name = map.name !== undefined ? c[map.name] ?? '' : ''
      phone = map.phone !== undefined ? c[map.phone] ?? '' : ''
    } else {
      for (const x of c) {
        if (!email && x.includes('@')) email = x
        else if (!phone && /^[+\d٠-٩][\d٠-٩\s\-()]{7,}$/.test(x)) phone = x
        else if (!name && x) name = x
      }
    }
    email = email.trim().toLowerCase()
    const row: RosterRow = { line: i + 1, email, name: name.replace(/\s+/g, ' ').trim().slice(0, 120), phone: '' }
    if (!email) row.error = 'لا بريد في هذا السطر'
    else if (!EMAIL.test(email) || email.length > 160) row.error = 'بريد غير صالح'
    else if (seen.has(email)) row.error = 'مكرر في القائمة'
    if (phone.trim()) {
      const p = normalizePhone(phone)
      if (p) row.phone = p
      else row.error ??= 'رقم جوال غير صالح'
    }
    if (!row.error) seen.add(email)
    rows.push(row)
  }
  return { rows, truncated: false }
}
