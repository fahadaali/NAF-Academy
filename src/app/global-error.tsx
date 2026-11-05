'use client'
/* خطأ في الغلاف نفسه — صفحة مستقلة بلا اعتماد على الأنماط */
export default function GlobalError({ reset }: { error: Error; reset: () => void }) {
  return (
    <html lang="ar" dir="rtl">
      <body style={{ margin: 0, minBlockSize: '100vh', display: 'grid', placeContent: 'center', gap: 14, textAlign: 'center', fontFamily: 'system-ui, sans-serif', background: 'Canvas', color: 'CanvasText' }}>
        <h1 style={{ fontSize: 28 }}>تعذّر تحميل الأكاديمية</h1>
        <p>أعد المحاولة بعد لحظات.</p>
        <button onClick={reset} style={{ justifySelf: 'center', padding: '12px 26px', borderRadius: 999, border: '1px solid currentColor', background: 'transparent', color: 'inherit', fontSize: 16, cursor: 'pointer' }}>أعد المحاولة</button>
      </body>
    </html>
  )
}
