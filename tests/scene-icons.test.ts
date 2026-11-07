import { test } from 'node:test'
import assert from 'node:assert/strict'
import { SCENES, menuOf, DEFAULT_HOME } from '../src/content/home-defaults'
import { SCENE_ICONS } from '../src/components/SceneIcon'

test('لكل مشهد في الرئيسية أيقونة في الشريط', () => {
  for (const k of SCENES) assert.ok(SCENE_ICONS[k], `لا أيقونة للمشهد ${k}`)
})

test('القائمة تحمل مفتاح المشهد فتُختار أيقونته لا رقم ترتيبه', () => {
  const m = menuOf(DEFAULT_HOME)
  assert.ok(m.length > 0)
  for (const x of m) { assert.ok(SCENES.includes(x.key)); assert.equal(x.href, `/#${x.key}`) }
})
