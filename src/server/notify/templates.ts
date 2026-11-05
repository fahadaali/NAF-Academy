/* قالب بريد بهوية الأكاديمية — RTL، كحلي وذهبي، ونسخة نصية دائماً. (قوالب المرحلة السابعة تتوسّع منه) */
const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!)

export function brandEmail(o: { title: string; lead: string; code?: string; note?: string }) {
  const code = o.code
    ? `<div style="margin:28px 0;padding:18px;border-radius:14px;background:#0b1520;color:#e0bc6e;font:800 34px/1 'Courier New',monospace;letter-spacing:10px;text-align:center;direction:ltr">${esc(o.code)}</div>`
    : ''
  return `<!doctype html><html lang="ar" dir="rtl"><body style="margin:0;background:#f6f2e8;font-family:Thmanyah,'Segoe UI',Tahoma,sans-serif;color:#14202b">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="padding:32px 12px"><tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;background:#fdfbf6;border-radius:20px;overflow:hidden;border:1px solid #ece6d6">
<tr><td style="background:#0b1520;padding:22px 28px;color:#efe9db;font-size:18px;font-weight:800">أكاديمية ناف <span style="color:#c9a25a;font-weight:400;font-size:13px">للتدريب القانوني</span></td></tr>
<tr><td style="padding:30px 28px;text-align:right">
<h1 style="margin:0 0 10px;font-size:24px">${esc(o.title)}</h1>
<p style="margin:0;font-size:16px;line-height:1.8;color:#36424e">${esc(o.lead)}</p>${code}
${o.note ? `<p style="margin:0;font-size:13px;line-height:1.7;color:#5b6470">${esc(o.note)}</p>` : ''}
</td></tr>
<tr><td style="padding:16px 28px;border-top:1px solid #ece6d6;font-size:12px;color:#5b6470">أكاديمية ناف — إحدى مبادرات شركة ناف القانونية</td></tr>
</table></td></tr></table></body></html>`
}
