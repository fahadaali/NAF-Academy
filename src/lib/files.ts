/* صيغ الملفات المسموحة للمرفقات والواجبات — الامتداد ← النوع */
export const EXT_MIME: Record<string, string> = {
  pdf: 'application/pdf', doc: 'application/msword', docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  txt: 'text/plain', zip: 'application/zip', png: 'image/png', jpg: 'image/jpeg',
}

/** حجم ملف مقروء: ك.ب أو م.ب */
export const fileSize = (n: number) => (n > 1048576 ? `${(n / 1048576).toFixed(1)} م.ب` : `${Math.max(1, Math.round(n / 1024))} ك.ب`)
