/* الكشف بالتمرير: كل `.reveal` يتلقّى `.in` مرة واحدة عند دخوله، وكل `[data-count]` يتصاعد رقمه مرة واحدة.
   يراقب الصفحة أيضاً: ما يُضاف لاحقاً (نتيجة اختبار، تصفية قائمة، تنقّل داخل اللوحة) يُكشف بالطريقة نفسها. */
import { ease, prefersCalm, timing } from './tokens'

const REVEAL = '.reveal:not(.in)'
const COUNT = '[data-count]:not([data-counted])'

export function mountReveal(root: ParentNode = document): () => void {
  document.documentElement.classList.add('reveal-ready')
  const calm = prefersCalm()
  if (typeof IntersectionObserver !== 'function') {
    root.querySelectorAll<HTMLElement>(REVEAL).forEach((el) => el.classList.add('in'))
    return () => {}
  }
  const io = new IntersectionObserver(
    (entries) => {
      for (const e of entries) {
        if (!e.isIntersecting) continue
        io.unobserve(e.target)
        if (e.target.classList.contains('reveal')) e.target.classList.add('in')
        if ((e.target as HTMLElement).dataset.count !== undefined) countUp(e.target as HTMLElement)
      }
    },
    { rootMargin: '0px 0px -8% 0px', threshold: 0.08 },
  )
  const mine = new Set<HTMLElement>()
  /* لا نلمس عنصراً رسمه الخادم قبل أن يُرطّبه React (حدود Suspense تُرطَّب لاحقاً) — وإلا اختلف ما يقارنه.
     ننتظره إطاراً بإطار بسقف زمني، ثم نمضي على كل حال. */
  const t0 = performance.now()
  const waiting = new Set<HTMLElement>()
  let raf = 0
  const take = (el: HTMLElement) => {
    if (el.matches(REVEAL)) io.observe(el)
    if (!calm && el.matches(COUNT)) arm(el, io, mine)
  }
  const flush = () => {
    raf = 0
    const late = performance.now() - t0 > timing.curtainMax
    waiting.forEach((el) => { if (late || hydrated(el)) { waiting.delete(el); take(el) } })
    if (waiting.size) raf = requestAnimationFrame(flush)
  }
  const visit = (el: HTMLElement) => {
    if (hydrated(el)) take(el)
    else { waiting.add(el); raf ||= requestAnimationFrame(flush) }
  }
  const scan = (node: ParentNode) => {
    const el = node as HTMLElement
    if (el.matches?.(REVEAL) || el.matches?.(COUNT)) visit(el)
    node.querySelectorAll?.<HTMLElement>(`${REVEAL}, ${COUNT}`).forEach(visit)
  }
  scan(root)
  const mo = typeof MutationObserver === 'function'
    ? new MutationObserver((list) => {
        for (const m of list) m.addedNodes.forEach((n) => n.nodeType === 1 && scan(n as Element))
      })
    : null
  mo?.observe(root instanceof Document ? root.body : (root as Node), { childList: true, subtree: true })
  return () => {
    io.disconnect()
    mo?.disconnect()
    cancelAnimationFrame(raf)
    /* ما لم يبدأ عدّه يعود لنصه كما كان — فيلتقطه التركيب التالي (وضع React الصارم، تنقّل اللوحة) */
    mine.forEach(disarm)
  }
}

/** رطّبه React؟ (يعلّق React مرجعه على العقدة نفسها). عنصر خارج React يُعامل بعد السقف الزمني */
function hydrated(el: Element): boolean {
  return Object.keys(el).some((k) => k.startsWith('__reactFiber$'))
}

/* ── العدّاد: يحرّك أول رقم في النص (بفواصله وكسوره) داخل عقدته النصية نفسها — فلا يتعارض مع React —
   ثم يعيد النص حرفياً. ما كان ظاهراً عند التحميل يبدأ من الصفر فوراً فلا يومض رقمه النهائي ── */
const NUM = /\d[\d,]*(?:\.\d+)?/
const armed = new WeakMap<Element, { node: Text; text: string }>()

function numberNode(el: HTMLElement): Text | null {
  const w = document.createTreeWalker(el, NodeFilter.SHOW_TEXT)
  for (let n = w.nextNode(); n; n = w.nextNode()) if (NUM.test(n.nodeValue ?? '')) return n as Text
  return null
}

function frame(text: string, k: number): string {
  const m = text.match(NUM)!
  const raw = m[0]
  const decimals = raw.includes('.') ? raw.split('.')[1].length : 0
  const to = Number(raw.replace(/,/g, ''))
  const v = new Intl.NumberFormat('en-US', { minimumFractionDigits: decimals, maximumFractionDigits: decimals, useGrouping: raw.includes(',') }).format(to * k)
  return text.slice(0, m.index) + v + text.slice((m.index ?? 0) + raw.length)
}

/** يثبّت العرض أثناء العدّ — لا يقفز التخطيط (لعناصر HTML فقط؛ نص SVG له موضع ثابت) */
function hold(el: HTMLElement, w: number) {
  if (!(el instanceof HTMLElement)) return
  if (getComputedStyle(el).display === 'inline') el.style.display = 'inline-block'
  el.style.minInlineSize = `${w}px`
}

function disarm(el: HTMLElement) {
  const a = armed.get(el)
  if (!a) return
  armed.delete(el)
  a.node.nodeValue = a.text
  delete el.dataset.counted
  if (el instanceof HTMLElement) el.style.minInlineSize = ''
}

function arm(el: HTMLElement, io: IntersectionObserver, mine: Set<HTMLElement>) {
  const node = numberNode(el)
  if (!node) return
  el.dataset.counted = '1'
  const text = node.nodeValue ?? ''
  armed.set(el, { node, text })
  mine.add(el)
  const r = el.getBoundingClientRect()
  if (r.top < innerHeight && r.bottom > 0) {
    hold(el, r.width)
    node.nodeValue = frame(text, 0)
  }
  io.observe(el)
}

function countUp(el: HTMLElement) {
  const a = armed.get(el)
  if (!a) return
  armed.delete(el)
  const { node, text } = a
  if (!el.style.minInlineSize) hold(el, el.getBoundingClientRect().width)
  const t0 = performance.now()
  const tick = (t: number) => {
    /* إن غيّر React النص أثناء العدّ نتوقف ونترك قيمته */
    if (!node.isConnected || !NUM.test(node.nodeValue ?? '')) return
    const k = ease.glide(Math.min(1, (t - t0) / timing.count))
    node.nodeValue = k < 1 ? frame(text, k) : text
    if (k < 1) requestAnimationFrame(tick)
    else if (el instanceof HTMLElement) el.style.minInlineSize = ''
  }
  requestAnimationFrame(tick)
}

/** ينفّذ `fn` مرة واحدة حين يقترب العنصر (للتحميل الكسول للمشاهد الثقيلة) */
export function whenNear(el: Element, fn: () => void, margin = '320px'): () => void {
  if (typeof IntersectionObserver !== 'function') {
    fn()
    return () => {}
  }
  const io = new IntersectionObserver(
    (entries) => {
      if (entries.some((e) => e.isIntersecting)) {
        io.disconnect()
        fn()
      }
    },
    { rootMargin: margin },
  )
  io.observe(el)
  return () => io.disconnect()
}
