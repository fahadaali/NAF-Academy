import { test } from 'node:test'
import assert from 'node:assert/strict'
import { follower } from '../src/motion/scroll-bus'
import { timing } from '../src/motion/tokens'

/* يشغّل المتابِع نحو هدف بمعدّل إطارات معيّن حتى زمن معيّن، ويعيد قيمته */
function run(hz: number, until: number, target = 1) {
  const f = follower()
  f.to(0, 0)
  const step = 1000 / hz
  for (let t = step; t <= until + 1e-9; t += step) f.to(target, t)
  return f.value
}

test('المتابِع يلتصق بأول قيمة ثم يقترب من الهدف ويبلغه', () => {
  const f = follower()
  assert.equal(f.to(0.4, 0), false)
  assert.equal(f.value, 0.4)
  let t = 0
  let moving = true
  while (moving && t < 5000) { t += 1000 / 60; moving = f.to(1, t) }
  assert.equal(f.value, 1)
  assert.ok(t < timing.follow * 15, 'يستقر في زمن قصير')
})

test('السرعة مستقلة عن معدّل تحديث الشاشة (60 و120 و144 هرتز)', () => {
  const at = timing.follow * 2
  const a = run(60, at), b = run(120, at), c = run(144, at)
  assert.ok(Math.abs(a - b) < 0.02 && Math.abs(a - c) < 0.02, `${a} ${b} ${c}`)
  /* بعد ثلاثة أمثال ثابت الزمن نحو 95% */
  assert.ok(Math.abs(run(60, timing.follow * 3) - 0.95) < 0.03)
})

test('أول إطار بعد سكون لا يقفز', () => {
  const f = follower()
  f.to(0, 0)
  f.to(1, 10_000) // بعد عشر ثوان بلا إطارات
  assert.ok(f.value < 0.25, `قفز إلى ${f.value}`)
})
