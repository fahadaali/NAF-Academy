import { test } from 'node:test'
import assert from 'node:assert/strict'
import { payFailureAr } from '../src/lib/pay-errors'

test('رسائل رفض ميسر بالعربية', () => {
  assert.equal(payFailureAr('DECLINED: INVALID CARD OR NOT FOUND'), 'بيانات البطاقة غير صحيحة.')
  assert.equal(payFailureAr('INSUFFICIENT FUNDS'), 'الرصيد غير كافٍ.')
  assert.equal(payFailureAr('DECLINED: EXPIRED CARD'), 'البطاقة منتهية الصلاحية.')
  assert.equal(payFailureAr('DECLINED: STOLEN CARD'), 'البطاقة موقوفة لدى البنك.')
  assert.equal(payFailureAr('DECLINED: EXCEEDS WITHDRAWAL LIMIT'), 'العملية تتجاوز الحد المسموح للبطاقة.')
  assert.equal(payFailureAr('The card is not enrolled in 3DS service.'), 'البطاقة غير مفعّلة للشراء عبر الإنترنت — فعّلها من تطبيق البنك.')
  assert.equal(payFailureAr('The authentication attempt was rejected by the issuer bank.'), 'لم يكتمل التحقق من البنك.')
  assert.equal(payFailureAr('3DS service error occurred.'), 'تعذّر التحقق من البنك الآن — حاول بعد قليل.')
  assert.equal(payFailureAr('DECLINED'), 'رفض البنك العملية.')
  assert.equal(payFailureAr('UNSPECIFIED FAILURE'), 'رفض البنك العملية.')
  assert.equal(payFailureAr('تعذّر التحقق من الدفعة'), 'تعذّر التحقق من الدفعة.')
})

test('ما لا يُعرف لا يُعرض حرفياً', () => {
  assert.equal(payFailureAr('1'), 'رُفضت العملية.')
  assert.equal(payFailureAr('اتصل على 0500000000 لاسترداد مالك'), 'رُفضت العملية.')
  assert.equal(payFailureAr(''), 'رُفضت العملية.')
})
