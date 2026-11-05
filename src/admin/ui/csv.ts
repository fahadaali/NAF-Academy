/* تصدير جدول إلى CSV يفتحه Excel بالعربية (BOM + اقتباس كل خلية) — في المتصفح */
export function downloadCsv(name: string, rows: (string | number)[][]) {
  const text = '﻿' + rows.map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n')
  const a = document.createElement('a')
  a.href = URL.createObjectURL(new Blob([text], { type: 'text/csv;charset=utf-8' }))
  a.download = name
  a.click()
}
