const TZ = 'Asia/Riyadh'

export function formatDay(iso: string): string {
  return new Intl.DateTimeFormat('ar-SA-u-nu-latn-ca-gregory', { timeZone: TZ, day: 'numeric', month: 'long' }).format(new Date(iso))
}

export function formatHijri(iso: string): string {
  return new Intl.DateTimeFormat('ar-SA-u-nu-latn-ca-islamic-umalqura', { timeZone: TZ, day: 'numeric', month: 'long' }).format(new Date(iso))
}

export function formatTime(iso: string): string {
  return new Intl.DateTimeFormat('ar-SA-u-nu-latn', { timeZone: TZ, hour: 'numeric', minute: '2-digit' }).format(new Date(iso))
}

export function formatWeekday(iso: string): string {
  return new Intl.DateTimeFormat('ar-SA', { timeZone: TZ, weekday: 'long' }).format(new Date(iso))
}
