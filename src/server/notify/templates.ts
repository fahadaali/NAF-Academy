/* القالب البريدي بهوية الأكاديمية — RTL، كحلي وذهبي، وخط ثمانية من الموقع (ولكل عميل بريد خطه الاحتياطي).
   جداول وأنماط مضمّنة ليعمل في Gmail وOutlook وApple Mail، ونسخة داكنة لمن يدعمها، ونسخة نصية دائماً.
   الألوان هنا قيم مباشرة لأن عملاء البريد لا يقرؤون متغيرات CSS — مرآة لرموز src/design/tokens.css. */

const C = {
  bg: '#f6f2e8', card: '#fdfbf6', line: '#ece6d6', ink: '#14202b', soft: '#36424e', muted: '#5b6470',
  night: '#0b1520', gold: '#c9a25a', goldText: '#7d5f26', ivory: '#efe9db',
  dBg: '#070d14', dCard: '#101b27', dLine: '#1f2c3a', dInk: '#efe9db', dSoft: '#c7c1b3',
}

export const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!)

/** الهوية في البريد — روابط مطلقة للشعارات (PNG) من اللوحة */
export type EmailBrand = { name: string; tagline: string; companyName: string; showName: boolean; logo: string | null }

export type EmailParts = {
  site: string
  brand: EmailBrand
  preheader?: string
  heading: string
  /** نص بفقرات (سطر فارغ يفصلها) وقوائم تبدأ بـ «- » */
  body: string
  facts?: [string, string][]
  cta?: { label: string; href: string }
  /** زر ثانوي (إطار ذهبي) بعد الأول */
  cta2?: { label: string; href: string }
  /** رمز التحقق بخط كبير */
  code?: string
  note?: string
  unsubscribe?: string
  /** للمعاينة في اللوحة: فرض الوضع الداكن */
  forceDark?: boolean
}

function blocks(body: string) {
  return body.trim().split(/\n\s*\n/).map((para) => {
    const lines = para.split('\n').map((l) => l.trim()).filter(Boolean)
    if (lines.length && lines.every((l) => /^[-•]\s+/.test(l)))
      return `<ul class="soft" style="margin:0 0 16px;padding:0 20px 0 0;font-size:16px;line-height:1.9;color:${C.soft}">${lines.map((l) => `<li>${esc(l.replace(/^[-•]\s+/, ''))}</li>`).join('')}</ul>`
    return `<p class="soft" style="margin:0 0 16px;font-size:16px;line-height:1.9;color:${C.soft}">${lines.map(esc).join('<br>')}</p>`
  }).join('')
}

export function renderEmail(p: EmailParts): { html: string; text: string } {
  const font = `'Thmanyah Sans','Segoe UI',Tahoma,Arial,sans-serif`
  const facts = (p.facts ?? []).filter(([, v]) => v)
  const factsHtml = facts.length
    ? `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" class="box" style="margin:8px 0 22px;background:${C.bg};border-radius:14px">${facts.map(([k, v]) => `<tr><td style="padding:10px 16px;font-size:13px;color:${C.muted};white-space:nowrap;vertical-align:top" class="muted">${esc(k)}</td><td class="ink" style="padding:10px 16px;font-size:15px;font-weight:700;color:${C.ink}">${esc(v)}</td></tr>`).join('')}</table>`
    : ''
  const code = p.code
    ? `<div style="margin:24px 0;padding:18px;border-radius:14px;background:${C.night};color:#e0bc6e;font:800 34px/1 'Courier New',monospace;letter-spacing:10px;text-align:center;direction:ltr">${esc(p.code)}</div>`
    : ''
  const cta = p.cta
    ? `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:6px 0 8px"><tr><td style="border-radius:999px;background:${C.gold}"><a href="${esc(p.cta.href)}" style="display:inline-block;padding:14px 30px;font-family:${font};font-size:16px;font-weight:700;color:${C.night};text-decoration:none;border-radius:999px">${esc(p.cta.label)}</a></td></tr></table>`
    : ''
  const cta2 = p.cta2
    ? `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:6px 0 8px"><tr><td style="border-radius:999px;border:1.5px solid ${C.gold}"><a href="${esc(p.cta2.href)}" style="display:inline-block;padding:12px 26px;font-family:${font};font-size:15px;font-weight:700;color:${C.goldText};text-decoration:none;border-radius:999px">${esc(p.cta2.label)}</a></td></tr></table>`
    : ''
  const unsub = p.unsubscribe ? ` · <a href="${esc(p.unsubscribe)}" style="color:${C.muted}" class="muted">إيقاف هذه الرسائل</a>` : ''
  const dark = `.bg{background:${C.dBg}!important}.card{background:${C.dCard}!important;border-color:${C.dLine}!important}.ink{color:${C.dInk}!important}.soft{color:${C.dSoft}!important}.box{background:${C.dBg}!important}.line{border-color:${C.dLine}!important}`
  const html = `<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="color-scheme" content="light dark"><meta name="supported-color-schemes" content="light dark"><title>${esc(p.heading)}</title>
<style>
@font-face{font-family:'Thmanyah Sans';font-weight:400;src:url('${p.site}/email-fonts/sans-regular.woff2') format('woff2')}
@font-face{font-family:'Thmanyah Sans';font-weight:700;src:url('${p.site}/email-fonts/sans-bold.woff2') format('woff2')}
@media (prefers-color-scheme:dark){${dark}}
${p.forceDark ? dark : ''}
@media (max-width:480px){.pad{padding:24px 20px!important}}
</style></head>
<body class="bg" style="margin:0;padding:0;background:${C.bg};font-family:${font};color:${C.ink};-webkit-text-size-adjust:100%">
${p.preheader ? `<div style="display:none;max-height:0;overflow:hidden;opacity:0">${esc(p.preheader)}</div>` : ''}
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" class="bg" style="background:${C.bg};padding:32px 12px"><tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" class="card" style="max-width:560px;background:${C.card};border-radius:20px;overflow:hidden;border:1px solid ${C.line}">
<tr><td style="background:${C.night};padding:20px 32px;text-align:right">${p.brand.logo ? `<img src="${esc(p.brand.logo)}" alt="${esc(p.brand.name)}" height="36" style="height:36px;width:auto;border:0;vertical-align:middle;display:inline-block">` : ''}${p.brand.showName || !p.brand.logo ? ` <span style="font-family:${font};color:${C.ivory};font-size:19px;font-weight:700;vertical-align:middle">${esc(p.brand.name)}</span>${p.brand.tagline ? ` <span style="color:${C.gold};font-size:13px;vertical-align:middle">${esc(p.brand.tagline)}</span>` : ''}` : ''}</td></tr>
<tr><td style="height:3px;background:${C.gold};line-height:3px;font-size:0">&nbsp;</td></tr>
<tr><td class="pad" style="padding:34px 32px 26px;text-align:right">
<h1 class="ink" style="margin:0 0 14px;font-family:${font};font-size:26px;line-height:1.4;font-weight:700;color:${C.ink}">${esc(p.heading)}</h1>
${blocks(p.body)}${code}${factsHtml}${cta}${cta2}
${p.note ? `<p class="muted" style="margin:18px 0 0;font-size:13px;line-height:1.7;color:${C.muted}">${esc(p.note)}</p>` : ''}
</td></tr>
<tr><td class="line muted" style="padding:16px 32px;border-top:1px solid ${C.line};font-size:12px;line-height:1.8;color:${C.muted};text-align:right">${esc(p.brand.name)} — إحدى مبادرات ${esc(p.brand.companyName)} · <a href="${esc(p.site)}" style="color:${C.goldText}">الموقع</a>${unsub}</td></tr>
</table></td></tr></table></body></html>`

  const text = [
    p.heading, '',
    p.body.trim().replace(/^[-•]\s+/gm, '• '),
    p.code ? `\nالرمز: ${p.code}` : '',
    facts.length ? '\n' + facts.map(([k, v]) => `${k}: ${v}`).join('\n') : '',
    p.cta ? `\n${p.cta.label}: ${p.cta.href}` : '',
    p.cta2 ? `${p.cta2.label}: ${p.cta2.href}` : '',
    p.note ? `\n${p.note}` : '',
    `\n—\n${p.brand.name} · ${p.site}`,
    p.unsubscribe ? `إيقاف هذه الرسائل: ${p.unsubscribe}` : '',
  ].filter((x) => x !== '').join('\n')
  return { html, text }
}

/** للتوافق مع رسائل رمز الدخول */
export function brandEmail(o: { title: string; lead: string; code?: string; note?: string; site?: string; brand: EmailBrand }) {
  return renderEmail({ site: o.site ?? '', brand: o.brand, heading: o.title, body: o.lead, code: o.code, note: o.note }).html
}
