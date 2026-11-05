'use client'
export function PrintButton() {
  return <button className="btn" onClick={() => window.print()}>طباعة / حفظ PDF</button>
}
