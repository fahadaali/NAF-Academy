/* صيغ الملفات المسموحة للمرفقات والواجبات — الامتداد ← النوع */
export const EXT_MIME: Record<string, string> = {
  pdf: 'application/pdf', doc: 'application/msword', docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  txt: 'text/plain', zip: 'application/zip', png: 'image/png', jpg: 'image/jpeg',
}
