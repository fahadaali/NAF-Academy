/* تنقية ملفات SVG المرفوعة للهوية — قائمة سماح لا قائمة منع: تُبنى الصورة من جديد من عناصر الرسم وخصائصها فقط،
   فلا نص برمجي ولا روابط خارجية ولا كيانات XML ولا أنماط. الناتج آمن للعرض بـ <img> وللإدراج داخل الصفحة (للحركة).
   الهندسة والألوان تبقى كما هي حرفياً — لا يُعاد رسم الشعار. */

const TAGS = new Set(['svg', 'g', 'path', 'rect', 'circle', 'ellipse', 'line', 'polyline', 'polygon', 'title'])
const DRAW = new Set(['path', 'rect', 'circle', 'ellipse', 'line', 'polyline', 'polygon'])
const ATTRS = new Set([
  'd', 'fill', 'stroke', 'stroke-width', 'stroke-linecap', 'stroke-linejoin', 'stroke-miterlimit', 'fill-rule', 'clip-rule',
  'opacity', 'fill-opacity', 'stroke-opacity', 'transform', 'x', 'y', 'width', 'height', 'rx', 'ry', 'cx', 'cy', 'r',
  'x1', 'y1', 'x2', 'y2', 'points',
])
/* قيمة خاصية: أرقام وحروف ووحدات وألوان سداسية وأقواس الدوال الهندسية فقط — لا url( ولا javascript: */
const VALUE = /^[\w\s.,#%()+-]*$/

export type CleanSvg = { svg: string; w: number; h: number; label: string }

/** يعيد بناء SVG نظيف، أو null إن لم يكن شعاراً صالحاً. `motion`: يضيف --n لكل عنصر رسم (ترتيب الحركة) */
export function sanitizeSvg(input: string, opts: { motion?: boolean } = {}): CleanSvg | null {
  const text = input.replace(/^﻿/, '').replace(/<\?xml[^>]*\?>/g, '').replace(/<!--[\s\S]*?-->/g, '')
  if (/<!DOCTYPE|<!ENTITY|<script|<foreignObject|<style|javascript:/i.test(text)) return null
  const root = text.match(/<svg\b([^>]*)>/i)
  if (!root) return null
  const vb = root[1].match(/viewBox\s*=\s*["']([-\d.\s,]+)["']/i)
  if (!vb) return null
  const nums = vb[1].trim().split(/[\s,]+/).map(Number)
  if (nums.length !== 4 || nums.some((n) => !Number.isFinite(n)) || nums[2] <= 0 || nums[3] <= 0) return null
  const label = (text.match(/<title>([^<]{0,200})<\/title>/i)?.[1] ?? '').trim()

  let out = ''
  let n = 0
  let depth = 0
  const tag = /<(\/?)([a-zA-Z]+)\b([^>]*?)(\/?)>/g
  for (let m = tag.exec(text); m; m = tag.exec(text)) {
    const [, close, rawName, attrs, self] = m
    const name = rawName.toLowerCase()
    if (name === 'svg' || name === 'title' || !TAGS.has(name)) {
      if (!TAGS.has(name) && name !== 'svg') return null
      continue
    }
    if (close) { if (name === 'g' && depth > 0) { out += '</g>'; depth-- } continue }
    const kept: string[] = []
    for (const a of attrs.matchAll(/([\w:-]+)\s*=\s*("([^"]*)"|'([^']*)')/g)) {
      const k = a[1].toLowerCase()
      const v = (a[3] ?? a[4] ?? '').trim()
      if (!ATTRS.has(k)) continue
      if (!VALUE.test(v) || /url\(/i.test(v)) return null
      kept.push(`${k}="${v}"`)
    }
    if (opts.motion && DRAW.has(name)) kept.push(`style="--n:${n++}"`)
    if (name === 'g') { out += `<g ${kept.join(' ')}>`; if (!self) depth++; else out += '</g>' }
    else out += `<${name} ${kept.join(' ')}/>`
  }
  while (depth-- > 0) out += '</g>'
  if (!/<(path|rect|circle|ellipse|line|polyline|polygon)\b/.test(out)) return null
  const aria = label ? ` role="img" aria-label="${label.replace(/["<>&]/g, '')}"` : ' aria-hidden="true"'
  return { svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${nums.join(' ')}"${aria}>${out}</svg>`, w: nums[2], h: nums[3], label }
}
