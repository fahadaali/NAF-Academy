import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { sanitizeSvg } from '../src/server/svg'

const KIT = 'src/content/brand-kit'
const kitSvgs = ['logo', 'compact', 'icon'].flatMap((d) => readdirSync(join(KIT, d)).filter((f) => f.endsWith('.svg')).map((f) => join(KIT, d, f)))

test('ملفات حزمة الهوية تمرّ بالتنقية بهندستها كاملة', () => {
  assert.ok(kitSvgs.length >= 7)
  for (const f of kitSvgs) {
    const src = readFileSync(f, 'utf8')
    const c = sanitizeSvg(src, { motion: true })
    assert.ok(c, f)
    const paths = (x: string) => [...x.matchAll(/<path\b[^>]*\bd="([^"]+)"/g)].map((m) => m[1].trim())
    assert.deepEqual(paths(c.svg), paths(src), `${f}: المسارات كما هي`)
    assert.match(c.svg, /style="--n:0"/)
  }
})

test('التنقية ترفض ما ليس رسماً', () => {
  const wrap = (x: string) => `<svg viewBox="0 0 10 10">${x}</svg>`
  assert.equal(sanitizeSvg(wrap('<script>alert(1)</script><path d="M0 0"/>')), null)
  assert.equal(sanitizeSvg(wrap('<foreignObject><div/></foreignObject>')), null)
  assert.equal(sanitizeSvg(wrap('<path d="M0 0" fill="url(https://x)"/>')), null)
  assert.equal(sanitizeSvg(wrap('<image href="x.png"/>')), null)
  assert.equal(sanitizeSvg('<!DOCTYPE svg [<!ENTITY a "b">]>' + wrap('<path d="M0 0"/>')), null)
  assert.equal(sanitizeSvg('<svg><path d="M0 0"/></svg>'), null, 'بلا viewBox')
})

test('التنقية تحذف الخصائص غير المسموحة وتُبقي الرسم', () => {
  const c = sanitizeSvg('<svg viewBox="0 0 10 5"><path d="M0 0L5 5" fill="#123456" onclick="x()" class="a"/></svg>')
  assert.ok(c)
  assert.equal(c.w, 10)
  assert.equal(c.h, 5)
  assert.ok(!c.svg.includes('onclick') && !c.svg.includes('class='))
  assert.ok(c.svg.includes('d="M0 0L5 5"') && c.svg.includes('fill="#123456"'))
})
