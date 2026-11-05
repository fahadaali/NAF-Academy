'use client'
import { downloadCsv } from '@/admin/ui/csv'

export function ExportLearners({ rows }: { rows: (string | number)[][] }) {
  return <button type="button" className="btn ghost" onClick={() => downloadCsv('learners.csv', [['الاسم', 'البريد', 'الجوال', 'الجهة', 'دورات نشطة', 'شهادات', 'آخر تسجيل', 'أُنشئ'], ...rows])}>تصدير هذه الصفحة</button>
}
