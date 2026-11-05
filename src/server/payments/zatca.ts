/* رمز QR للفاتورة الضريبية المبسّطة (المرحلة الأولى من الفوترة الإلكترونية — ZATCA):
   TLV بخمسة وسوم: البائع، الرقم الضريبي، الوقت، الإجمالي شامل الضريبة، الضريبة — ثم base64. */
const enc = new TextEncoder()

export function zatcaTlv(f: { seller: string; vatNumber: string; timestamp: string; total: number; vat: number }): string {
  const fields = [f.seller, f.vatNumber, f.timestamp, (f.total / 100).toFixed(2), (f.vat / 100).toFixed(2)]
  const parts: number[] = []
  fields.forEach((v, i) => {
    const b = enc.encode(v)
    if (b.length > 255) throw new Error('tlv field too long')
    parts.push(i + 1, b.length, ...b)
  })
  return Buffer.from(Uint8Array.from(parts)).toString('base64')
}
