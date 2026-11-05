/* يُقرأ قبل الرسم: يثبّت الوضع المختار فلا يومض السطح، ويشغّل الكشف بالتمرير،
   ويرفع الستار الافتتاحي في الرئيسية وحدها — لمن لم يطلب تقليل الحركة ولم يأتِ إلى مرساة.
   ومؤقّتات احتياطية: لا يبقى محتوًى مخفياً أبداً إن تعذّر تحميل الشيفرة. */
(function () {
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
    setTimeout(function () { root.classList.remove('opening') }, 5200)
  }
  setTimeout(function () {
    if (!root.classList.contains('reveal-ready')) root.classList.remove('js')
  }, root.classList.contains('opening') ? 6000 : 2500)
})()
