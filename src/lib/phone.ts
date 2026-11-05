/* تطبيع أرقام الجوال إلى E.164 — السعودية افتراضاً: 05xxxxxxxx / 5xxxxxxxx / 9665… / +9665… */
export function normalizePhone(raw: string): string | null {
  const d = raw.replace(/[\s\-()]/g, '').replace(/[٠-٩]/g, (c) => String('٠١٢٣٤٥٦٧٨٩'.indexOf(c)))
  if (/^05\d{8}$/.test(d)) return `+966${d.slice(1)}`
  if (/^5\d{8}$/.test(d)) return `+966${d}`
  if (/^9665\d{8}$/.test(d)) return `+${d}`
  if (/^00\d{8,15}$/.test(d)) return `+${d.slice(2)}`
  if (/^\+\d{8,15}$/.test(d)) return d
  return null
}

export const maskPhone = (p: string) => p.replace(/^(\+\d{3})\d+(\d{3})$/, '$1•••••$2')
export const maskEmail = (e: string) => e.replace(/^(.).*?(.?)@/, (_, a, b) => `${a}•••${b}@`)
