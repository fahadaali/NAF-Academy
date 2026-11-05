import { test } from 'node:test'
import assert from 'node:assert/strict'
import { fathaFeature, level, parse, plain, render, TATWEEL } from '../src/motion/kashida'

test('تحليل العلامة بدرجة وبلا درجة', () => {
  assert.deepEqual(parse('بالمم~4ارسة'), [{ text: 'بالمم' }, { slot: 0, max: 4 }, { text: 'ارسة' }])
  assert.deepEqual(parse('مح~دودة'), [{ text: 'مح' }, { slot: 0, max: 3 }, { text: 'دودة' }])
})

test('النص الصافي بلا علامات', () => {
  assert.equal(plain('يُتق~5َن بالمم~ارسة'), 'يُتقَن بالممارسة')
})

test('التقدّم يحدد عدد المدّات ولا يتجاوز خمساً', () => {
  const p = parse('بالمم~4ارسة')
  assert.equal(render(p, 0), 'بالممارسة')
  assert.equal(render(p, 1), `بالمم${TATWEEL.repeat(4)}ارسة`)
  assert.equal(render(p, 0.5), `بالمم${TATWEEL.repeat(2)}ارسة`)
  assert.equal(level(4, 3), 5)
})

test('امتداد الفتحة يطابق أطول مدّ', () => {
  const p = parse('يُتق~5َن')
  assert.equal(fathaFeature(p, 0), undefined)
  assert.equal(fathaFeature(p, 1), "'ss07' 1")
  assert.equal(fathaFeature(p, 0.2), "'ss03' 1")
})
