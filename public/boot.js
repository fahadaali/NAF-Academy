/* يُقرأ قبل الرسم: يثبّت الوضع المختار فلا يومض السطح، ويشغّل الكشف بالتمرير،
   ويرفع الستار الافتتاحي في الرئيسية وحدها — لمن لم يطلب تقليل الحركة ولم يأتِ إلى مرساة.
   ومؤقّتات احتياطية: لا يبقى محتوًى مخفياً أبداً إن تعذّر تحميل الشيفرة. */
(function () {
  /* مرآة src/motion/tokens.ts (لا يُستورد هنا): duration.gentle، وtiming.curtainMax = gentle × 15 */
  var GENTLE = 320
  var CURTAIN_MAX = GENTLE * 15
  var root = document.documentElement
  try {
    var t = localStorage.getItem('naf-academy-theme')
    if (t === 'dark' || t === 'light') root.setAttribute('data-theme', t)
  } catch (e) {}
  root.classList.add('js')
  var calm = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches
  var home = location.pathname === '/'
  if (home && !calm && !location.hash && 'animate' in root) {
    root.classList.add('opening')
    /* سقف الستار: يُرفع ولو لم تصل شيفرته */
    setTimeout(function () { root.classList.remove('opening') }, CURTAIN_MAX + GENTLE)
  }
  /* لم يجهز الكشف؟ يظهر كل شيء كما هو بلا حركة */
  setTimeout(function () {
    if (!root.classList.contains('reveal-ready')) root.classList.remove('js')
  }, root.classList.contains('opening') ? CURTAIN_MAX + GENTLE * 4 : GENTLE * 8)

  /* الانتقال بين الصفحات: الأسماء تُعطى لحظة التنقّل وتُزال بعده — فلا تتدخل في دائرة تبديل الوضع.
     الشريط واللوحة الجانبية يبقيان، وغلاف الدورة المنقور يطير إلى رأس صفحتها. */
  function name(sel, n) {
    var el = typeof sel === 'string' ? document.querySelector(sel) : sel
    if (el) el.style.viewTransitionName = n
    return el
  }
  function clear(vt, els) {
    vt.finished.finally(function () { els.forEach(function (el) { if (el) el.style.viewTransitionName = '' }) })
  }
  function seen(el) {
    var r = el.getBoundingClientRect()
    return r.bottom > 0 && r.top < innerHeight
  }
  addEventListener('pageswap', function (e) {
    if (!e.viewTransition) return
    var els = [name('[data-vt="site-header"]', 'site-header'), name('[data-vt="admin-nav"]', 'admin-nav')]
    var to = e.activation && e.activation.entry && e.activation.entry.url
    if (to) {
      var path = new URL(to).pathname
      var covers = document.querySelectorAll('[data-vt-cover]')
      for (var i = 0; i < covers.length; i++) {
        if (covers[i].getAttribute('data-vt-cover') === path && seen(covers[i])) { els.push(name(covers[i], 'course-cover')); break }
      }
    }
    clear(e.viewTransition, els)
  })
  addEventListener('pagereveal', function (e) {
    if (!e.viewTransition) return
    /* الستار الافتتاحي يغطي الرئيسية — لا انتقال فوقه */
    if (root.classList.contains('opening')) { e.viewTransition.skipTransition(); return }
    var els = [name('[data-vt="site-header"]', 'site-header'), name('[data-vt="admin-nav"]', 'admin-nav')]
    var hero = document.querySelector('[data-vt-hero]')
    if (hero && seen(hero)) els.push(name(hero, 'course-cover'))
    clear(e.viewTransition, els)
  })
})()
