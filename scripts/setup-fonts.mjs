/* يولّد src/design/fonts.generated.css من ملفات خط ثمانية إن وُجدت في src/fonts/thmanyah/.
   الملفات لا تُرفع للمستودع (الترخيص)، وتُدمج في البناء بأسماء مجزّأة كجزء من المنتج.
   إن غابت: ملف فارغ، فيعمل البناء بالخط الاحتياطي. الملفات تُستخدم كما هي بلا أي تعديل. */
import { copyFileSync, existsSync, mkdirSync, readdirSync, writeFileSync } from 'node:fs'

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
