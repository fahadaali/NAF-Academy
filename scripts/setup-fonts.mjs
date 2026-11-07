/* يولّد src/design/fonts.generated.css من ملفات خط ثمانية في src/fonts/thmanyah/ (ضمن المستودع بقرار المالك)،
   فتُدمج في البناء بأسماء مجزّأة. إن غابت: ملف فارغ، فيعمل البناء بالخط الاحتياطي. الملفات تُستخدم كما هي بلا تعديل.
   وينسخ منها نسخاً ثابتة الاسم للبريد والشهادات، ورمز الريال من حزمته (OFL). */
import { copyFileSync, cpSync, existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'

const dir = 'src/fonts/thmanyah'
const out = 'src/design/fonts.generated.css'
const families = {
  thmanyahsans: 'Thmanyah Sans',
  thmanyahserifdisplay: 'Thmanyah Display',
  thmanyahseriftext: 'Thmanyah Text',
}
const weights = { Light: 300, Regular: 400, Medium: 500, Bold: 700, Black: 900 }

const files = existsSync(dir) ? readdirSync(dir).filter((f) => f.endsWith('.woff2')) : []
const faces = files.flatMap((f) => {
  const m = f.match(/^(\w+)-(\w+)\.woff2$/)
  if (!m || !families[m[1]] || !weights[m[2]]) return []
  return [
    `@font-face {\n  font-family: '${families[m[1]]}';\n  src: url('../fonts/thmanyah/${f}') format('woff2');\n  font-weight: ${weights[m[2]]};\n  font-display: swap;\n}`,
  ]
})

writeFileSync(
  out,
  faces.length
    ? `/* مولّد — لا يُحرَّر. خط ثمانية (${faces.length} ملفاً) */\n${faces.join('\n')}\n`
    : '/* مولّد — ملفات خط ثمانية غير موجودة في src/fonts/thmanyah/؛ يُستخدم الخط الاحتياطي */\n',
)
console.log(faces.length ? `fonts: ${faces.length} faces` : 'fonts: Thmanyah missing — fallback in use')

/* نسخة ثابتة الاسم من الخط للبريد — عملاء البريد يحتاجون رابطاً لا يتغيّر (public/email-fonts، لا تُرفع) */
const mail = { 'thmanyahsans-Regular.woff2': 'sans-regular.woff2', 'thmanyahsans-Bold.woff2': 'sans-bold.woff2' }
if (files.length) {
  mkdirSync('public/email-fonts', { recursive: true })
  for (const [from, to] of Object.entries(mail)) if (existsSync(`${dir}/${from}`)) copyFileSync(`${dir}/${from}`, `public/email-fonts/${to}`)
}

/* نسخة للشهادات (PDF): يقرؤها fontkit ويرسم الحروف مسارات، في public/cert-fonts (لا تُرفع) */
const cert = { 'thmanyahserifdisplay-Bold.woff2': 'display-bold.woff2', 'thmanyahsans-Regular.woff2': 'sans-regular.woff2' }
if (files.length) {
  mkdirSync('public/cert-fonts', { recursive: true })
  for (const [from, to] of Object.entries(cert)) if (existsSync(`${dir}/${from}`)) copyFileSync(`${dir}/${from}`, `public/cert-fonts/${to}`)
}

/* رمز الريال (U+20C1) من حزمة saudi-riyal-font — ينسخ فقط إن تغيّر، فلا فرق في المستودع */
const riyal = 'node_modules/@emran-alhaddad/saudi-riyal-font/fonts'
const glyphs = { 'regular/saudi_riyal.woff2': 'riyal.woff2', 'bold/saudi_riyal.woff2': 'riyal-bold.woff2' }
if (existsSync(riyal)) {
  mkdirSync('public/fonts', { recursive: true })
  for (const [from, to] of Object.entries(glyphs)) {
    const src = `${riyal}/${from}`, dst = `public/fonts/${to}`
    if (existsSync(src) && (!existsSync(dst) || !readFileSync(src).equals(readFileSync(dst)))) copyFileSync(src, dst)
  }
}

/* عامل pdf.js لعارض السلايدات — باسم يحمل الإصدار فلا يعلق قديم في الذاكرة المؤقتة، في public/pdfjs (لا يُرفع) */
const pdfjs = 'node_modules/pdfjs-dist'
if (existsSync(`${pdfjs}/build/pdf.worker.min.mjs`)) {
  const { version } = JSON.parse(readFileSync(`${pdfjs}/package.json`, 'utf8'))
  const dst = `public/pdfjs/pdf.worker-${version}.min.mjs`
  mkdirSync('public/pdfjs', { recursive: true })
  if (!existsSync(dst)) copyFileSync(`${pdfjs}/build/pdf.worker.min.mjs`, dst)
  /* خطوط PDF القياسية وجداول الترميز (للملفات التي لا تضمّن خطوطها، فلا تتشوّه المسافات) ومفكّكات الصور (wasm) */
  for (const d of ['standard_fonts', 'cmaps', 'wasm']) if (!existsSync(`public/pdfjs/${version}/${d}`)) cpSync(`${pdfjs}/${d}`, `public/pdfjs/${version}/${d}`, { recursive: true })
}

/* الترحيلات المحزومة للتطبيق، وحزمة الهوية لـASSETS — في الخطوة نفسها (تسبق dev وbuild والأنواع والاختبارات) */
await import('./bundle-migrations.mjs')
