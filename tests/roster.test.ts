import { test } from 'node:test'
import assert from 'node:assert/strict'
import { parseRoster, ROSTER_MAX } from '../src/lib/roster'

test('قائمة برأس عربي من Excel (فاصلة) — الأعمدة بأي ترتيب', () => {
  const { rows } = parseRoster('﻿الجوال,الاسم,البريد\n0551234567,سارة العتيبي,Sara@Uni.edu.sa\n,محمد,m@x.sa')
  assert.equal(rows.length, 2)
  assert.deepEqual(rows[0], { line: 2, email: 'sara@uni.edu.sa', name: 'سارة العتيبي', phone: '+966551234567' })
  assert.equal(rows[1].phone, '')
  assert.equal(rows[1].error, undefined)
})

test('نسخ من جدول (Tab) بلا رأس — البريد بـ@ والجوال بأرقامه', () => {
  const { rows } = parseRoster('نورة القحطاني\tn@k.sa\t+966 55 000 1111\nfahad@x.com')
  assert.equal(rows[0].name, 'نورة القحطاني'); assert.equal(rows[0].email, 'n@k.sa'); assert.equal(rows[0].phone, '+966550001111')
  assert.equal(rows[1].email, 'fahad@x.com'); assert.equal(rows[1].name, '')
})

test('رأس إنجليزي وفاصلة منقوطة واقتباس', () => {
  const { rows } = parseRoster('Name;Email\n"Ali, Jr";ali@x.io')
  assert.equal(rows[0].name, 'Ali, Jr'); assert.equal(rows[0].email, 'ali@x.io')
})

test('الأخطاء: بريد ناقص أو غير صالح، ومكرر، وجوال غير صالح — والأسطر الفارغة تُتخطّى', () => {
  const { rows } = parseRoster('a@b.co\n\nبلا بريد\nnot-an-email@\nA@B.co\nc@d.co,123456789')
  assert.deepEqual(rows.map((r) => r.error), [undefined, 'لا بريد في هذا السطر', 'بريد غير صالح', 'مكرر في القائمة', 'رقم جوال غير صالح'])
  assert.deepEqual(rows.map((r) => r.line), [1, 3, 4, 5, 6])
})

test('سقف عدد الصفوف', () => {
  const text = Array.from({ length: ROSTER_MAX + 3 }, (_, i) => `u${i}@x.sa`).join('\n')
  const r = parseRoster(text)
  assert.equal(r.rows.length, ROSTER_MAX); assert.equal(r.truncated, true)
  assert.deepEqual(parseRoster('  \n '), { rows: [], truncated: false })
})
