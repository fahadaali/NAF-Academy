import 'server-only'
/* الصفحات العامة مخزّنة في ذاكرة OpenNext (R2 + وسوم D1) وتُجدَّد كل 5 دقائق أو عند الإبطال.
   تعديلات اللوحة تُبطلها بـ revalidatePath('/', 'layout')؛ وما يغيّر المقاعد خارج اللوحة (دفع، تسجيل مباشر، دعوة، عقد، استرداد)
   يُبطلها من هنا فلا تبقى «مفتوحة/مكتملة» قديمة. خارج طلب Next (الاختبارات، أثناء الرسم) لا شيء يُبطَل — والمهلة الزمنية تكفي. */
import { revalidatePath } from 'next/cache'

export function refreshPublicPages() {
  try {
    revalidatePath('/', 'layout')
  } catch {
    /* خارج سياق طلب يسمح بالإبطال */
  }
}
