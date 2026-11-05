/* الكشف بالتمرير: كل `.reveal` يتلقّى `.in` مرة واحدة عند دخوله. */

export function mountReveal(root: ParentNode = document): () => void {
  document.documentElement.classList.add('reveal-ready')
  const items = Array.from(root.querySelectorAll<HTMLElement>('.reveal:not(.in)'))
  if (!items.length) return () => {}
  if (typeof IntersectionObserver !== 'function') {
    items.forEach((el) => el.classList.add('in'))
    return () => {}
  }
  const io = new IntersectionObserver(
    (entries) => {
      for (const e of entries) {
        if (e.isIntersecting) {
          e.target.classList.add('in')
          io.unobserve(e.target)
        }
      }
    },
    { rootMargin: '0px 0px -8% 0px', threshold: 0.08 },
  )
  items.forEach((el) => io.observe(el))
  return () => io.disconnect()
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
