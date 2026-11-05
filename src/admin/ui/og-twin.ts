/* نسخة JPEG للصور التي لا تقرؤها صور المشاركة (WebP/AVIF) — يرسمها المتصفح عند الرفع، فلا مكتبة صور على الخادم.
   تحويل صيغة فقط، بعرض أقصى 1600. */
const MAX_W = 1600

export async function jpegTwin(f: File): Promise<File | null> {
  if (f.type !== 'image/webp' && f.type !== 'image/avif') return null
  try {
    const bmp = await createImageBitmap(f)
    const k = Math.min(1, MAX_W / bmp.width)
    const c = document.createElement('canvas')
    c.width = Math.round(bmp.width * k)
    c.height = Math.round(bmp.height * k)
    const x = c.getContext('2d')
    if (!x) return null
    x.drawImage(bmp, 0, 0, c.width, c.height)
    const blob = await new Promise<Blob | null>((r) => c.toBlob(r, 'image/jpeg', 0.86))
    return blob ? new File([blob], f.name.replace(/\.\w+$/, '.jpg'), { type: 'image/jpeg' }) : null
  } catch {
    return null
  }
}

/** نموذج الرفع: الملف وتوأمه إن لزم */
export async function uploadForm(f: File) {
  const fd = new FormData()
  fd.set('file', f)
  const twin = await jpegTwin(f)
  if (twin) fd.set('og', twin)
  return fd
}
