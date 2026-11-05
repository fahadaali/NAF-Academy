/* أثناء تحميل مساحة التعلّم — هيكل هادئ بلا وميض */
export default function Loading() {
  return (
    <div className="wrap" aria-busy="true" aria-live="polite" style={{ paddingBlock: 'calc(var(--header-h) + 50px) 100px', display: 'grid', gap: 16 }}>
      <span className="sr-only">جارٍ التحميل…</span>
      {[0, 1, 2].map((i) => <div key={i} className="skeleton" style={{ blockSize: i ? 120 : 60, borderRadius: 'var(--radius-l)' }} />)}
    </div>
  )
}
