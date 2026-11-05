/* رمز الريال السعودي الجديد U+20C1 بخط Riyal (OFL)، مع اسم مقروء لقارئ الشاشة. */
export function Riyal({ className = '' }: { className?: string }) {
  return (
    <span className={`riyal ${className}`} role="img" aria-label="ريال سعودي">
      {'⃁'}
    </span>
  )
}
