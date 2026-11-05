import 'server-only'
/* نص عربي متجه من fontkit — مشترك بين ملف PDF للشهادة وصور المشاركة.
   fontkit يشكّل الحروف ويرتّب المقطع العربي بصرياً، لكنه يقلب الأرقام واللاتينية داخله،
   فنقسّم السطر مقاطع (عربي / لاتيني-أرقام) ونرصّها من اليمين بأنفسنا. */
import fontkit from '@pdf-lib/fontkit'
import { cfEnv } from './runtime'

export type Font = {
  unitsPerEm: number
  layout(t: string): { glyphs: { path: { scale(x: number, y: number): { translate(x: number, y: number): { toSVG(): string } } } }[]; positions: { xAdvance: number; xOffset: number; yOffset: number }[] }
}
export const FONTS = { display: 'display-bold.woff2', sans: 'sans-regular.woff2' } as const
export type Fonts = Record<keyof typeof FONTS, Font>
const cache = new Map<string, Font>()

export async function loadFont(file: string): Promise<Font> {
  const hit = cache.get(file)
  if (hit) return hit
  let bytes: Uint8Array | null = null
  const assets = cfEnv()?.ASSETS as { fetch(r: Request): Promise<Response> } | undefined
  if (assets) {
    const r = await assets.fetch(new Request(`https://assets.local/cert-fonts/${file}`))
    if (r.ok) bytes = new Uint8Array(await r.arrayBuffer())
  }
  if (!bytes) {
    const { readFile } = await import('node:fs/promises')
    bytes = new Uint8Array(await readFile(`${process.cwd()}/public/cert-fonts/${file}`))
  }
  const f = fontkit.create(Buffer.from(bytes)) as unknown as Font
  cache.set(file, f)
  return f
}


/** مقاطع السطر بالترتيب المنطقي: اللاتيني والأرقام مقطع، والباقي عربي */
export function bidiRuns(text: string): { text: string; ltr: boolean }[] {
  const out: { text: string; ltr: boolean }[] = []
  const re = /[A-Za-z0-9](?:[A-Za-z0-9.,:/@\-–]*[A-Za-z0-9])?/g
  let last = 0
  for (const m of text.matchAll(re)) {
    if (m.index! > last) out.push({ text: text.slice(last, m.index), ltr: false })
    out.push({ text: m[0], ltr: true })
    last = m.index! + m[0].length
  }
  if (last < text.length) out.push({ text: text.slice(last), ltr: false })
  return out
}

/** مسار مقطع واحد بوحدات الخط، وعرضه */
export function shape(font: Font, text: string) {
  const run = font.layout(text)
  let pen = 0
  const parts: string[] = []
  run.glyphs.forEach((g, i) => {
    const p = run.positions[i]
    parts.push(g.path.scale(1, -1).translate(pen + p.xOffset, -p.yOffset).toSVG())
    pen += p.xAdvance
  })
  return { d: parts.join(' '), w: pen }
}


/** عرض سطر كامل بالنقاط */
export function widthOf(text: string, font: Font, size: number) {
  return bidiRuns(text).reduce((a, r) => a + shape(font, r.text).w, 0) * (size / font.unitsPerEm)
}

/** مقاطع السطر جاهزة للرسم من اليمين: [مسار، إزاحة من حافة السطر اليمنى بوحدات الخط] */
export function rtlPieces(font: Font, text: string) {
  const runs = bidiRuns(text).map((r) => shape(font, r.text))
  const total = runs.reduce((a, r) => a + r.w, 0)
  let right = total
  return { total, pieces: runs.map((r) => { right -= r.w; return { d: r.d, x: right } }) }
}

/** يقسّم نصاً إلى أسطر لا يتجاوز كل منها العرض */
export function wrap(text: string, font: Font, size: number, max: number, maxLines = 3) {
  const words = text.split(/\s+/).filter(Boolean)
  const out: string[] = []
  let cur = ''
  for (const w of words) {
    const t = cur ? `${cur} ${w}` : w
    if (cur && widthOf(t, font, size) > max) { out.push(cur); cur = w } else cur = t
  }
  if (cur) out.push(cur)
  if (out.length > maxLines) { out.length = maxLines; out[maxLines - 1] += '…' }
  return out
}
