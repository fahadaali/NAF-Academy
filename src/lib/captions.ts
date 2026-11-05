/* الترجمات النصية — تحويل SRT إلى WebVTT والتحقق من الملف. دوال نقية مشتركة بين الخادم والاختبارات. */

/** نص ترجمة (VTT أو SRT) ← WebVTT صالح، أو null إن لم يكن ترجمة */
export function toVtt(input: string): string | null {
  const text = input.replace(/^﻿/, '').replace(/\r\n?/g, '\n').trim()
  if (/^WEBVTT/.test(text)) return /-->/.test(text) ? `${text}\n` : null
  /* SRT: أرقام المقاطع اختيارية في VTT، والفاصلة العشرية تصير نقطة */
  if (!/\d{2}:\d{2}:\d{2},\d{3}\s*-->\s*\d{2}:\d{2}:\d{2},\d{3}/.test(text)) return null
  const body = text.replace(/(\d{2}:\d{2}:\d{2}),(\d{3})/g, '$1.$2')
  return `WEBVTT\n\n${body}\n`
}

export const CAPTION_LANGS = [
  { lang: 'ar', label: 'العربية' },
  { lang: 'en', label: 'English' },
] as const
