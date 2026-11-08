import 'server-only'
/* عميل وافق — fetch بلا مكتبات. السرّ WAFEQ_API_KEY يُقرأ في الخادم وحده (envVar) ولا يصل المتصفح ولا السجلات.
   كل كتابة بمفتاح idempotency حتمي، والبحث بـ external_id قبل الإنشاء (مهلة idempotency في وافق ساعة فقط).
   المحاكاة (WAFEQ_MOCK=1) لاختبارات التكامل والمتصفح وحدها، ممنوعة في الإنتاج. */
import { createHash } from 'node:crypto'
import { envVar } from '../runtime'
import { getSetting } from '../settings'
import { DEFAULT_WAFEQ, missingSettings, wafeqError, type WafeqSettings } from '@/lib/wafeq'

const BASE = 'https://api.wafeq.com/v1'
const TIMEOUT_MS = 20_000

export const wafeqMock = () => process.env.WAFEQ_MOCK === '1' && process.env.NODE_ENV !== 'production'
const apiKey = () => (envVar('WAFEQ_API_KEY') ?? '').trim()

export const wafeqSettings = async (): Promise<WafeqSettings> => {
  const v = await getSetting<Partial<WafeqSettings>>('wafeq', DEFAULT_WAFEQ)
  return { ...DEFAULT_WAFEQ, ...v, paidThrough: { ...DEFAULT_WAFEQ.paidThrough, ...(v.paidThrough ?? {}) } }
}

export type WafeqState = { keyed: boolean; mock: boolean; active: boolean; problem?: string }

/** هل المزامنة تعمل؟ مفتاح + تفعيل + الحسابات الأساسية */
export function wafeqState(c: WafeqSettings): WafeqState {
  const mock = wafeqMock()
  const keyed = mock || !!apiKey()
  if (!keyed) return { keyed, mock, active: false, problem: 'مفتاح وافق غير مضاف في البيئة (WAFEQ_API_KEY)' }
  if (!c.enabled) return { keyed, mock, active: false, problem: 'الربط مقفل — فعّله بعد اختيار الحسابات' }
  const miss = missingSettings(c)
  if (miss.length) return { keyed, mock, active: false, problem: `ينقص: ${miss.join('، ')}` }
  return { keyed, mock, active: true }
}

export async function wafeqActive() {
  return wafeqState(await wafeqSettings()).active
}

/** مفتاح idempotency حتمي بصيغة UUID v4 (وافق يرفض غيرها) — المحاولة نفسها تُعيد المفتاح نفسه */
export function idemKey(seed: string): string {
  const b = createHash('sha256').update(`wafeq:${seed}`).digest().subarray(0, 16)
  b[6] = (b[6] & 0x0f) | 0x40
  b[8] = (b[8] & 0x3f) | 0x80
  const h = b.toString('hex')
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`
}

export class WafeqError extends Error {
  constructor(public status: number, public body: unknown) {
    super(wafeqError(status, body))
  }
  get code(): string | undefined {
    const b = this.body as { code?: unknown; errors?: { code?: unknown }[] } | null
    const c = b?.code ?? b?.errors?.[0]?.code
    return typeof c === 'string' ? c : undefined
  }
  /** خطأ عابر يستحق إعادة المحاولة (شبكة، ضغط، خادم) — لا أخطاء التحقق */
  get transient() { return this.status === 0 || this.status === 408 || this.status === 409 || this.status === 429 || this.status >= 500 }
}

type Fetcher = (url: string, init: RequestInit) => Promise<Response>
/** للاختبار: استبدال fetch (globalThis.__wafeqFetch) */
const fetcher = (): Fetcher => {
  const g = globalThis as { __wafeqFetch?: Fetcher }
  if (g.__wafeqFetch) return g.__wafeqFetch
  if (wafeqMock()) return mockFetch
  return (u, i) => fetch(u, i)
}

async function call(method: string, path: string, body?: unknown, idem?: string): Promise<Response> {
  const headers: Record<string, string> = { authorization: `Api-Key ${wafeqMock() ? 'mock' : apiKey()}`, accept: 'application/json' }
  if (body !== undefined) headers['content-type'] = 'application/json'
  if (idem) headers['x-wafeq-idempotency-key'] = idemKey(idem)
  let r: Response
  try {
    r = await fetcher()(`${BASE}${path}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body), signal: AbortSignal.timeout(TIMEOUT_MS) })
  } catch (e) {
    throw new WafeqError(0, { detail: `تعذّر الاتصال: ${(e as Error).message}` })
  }
  if (!r.ok) {
    let b: unknown = null
    try { b = await r.json() } catch { /* جسم غير JSON */ }
    throw new WafeqError(r.status, b)
  }
  return r
}

export async function wafeqJson<T = Record<string, unknown>>(method: 'GET' | 'POST' | 'PATCH', path: string, body?: unknown, idem?: string): Promise<T> {
  const r = await call(method, path, body, idem)
  return (r.status === 204 ? {} : await r.json()) as T
}

export async function wafeqPdf(path: string): Promise<Uint8Array> {
  const r = await call('GET', path)
  const b = new Uint8Array(await r.arrayBuffer())
  if (b.length < 5 || String.fromCharCode(...b.subarray(0, 5)) !== '%PDF-') throw new WafeqError(502, { detail: 'الملف المستلم ليس PDF' })
  return b
}

/** أول مستند بالمفتاح الخارجي — لاستئناف إنشاء سبق ولو انقضت مهلة idempotency */
export async function findByExternal<T extends { id: string }>(collection: 'contacts' | 'invoices' | 'credit-notes' | 'payments', externalId: string): Promise<T | null> {
  const r = await wafeqJson<{ results?: T[] }>('GET', `/${collection}/?external_id=${encodeURIComponent(externalId)}&page_size=1`)
  return r.results?.[0] ?? null
}

type Account = { id: string; name_en?: string; name_ar?: string; account_code?: string; classification?: string; is_payment_enabled?: boolean }
type TaxRate = { id: string; name?: string; friendly_name?: string; rate?: number; tax_type?: string }
export type WafeqCatalog = { org: string; accounts: { id: string; label: string; payment: boolean; kind: string }[]; taxRates: { id: string; label: string }[] }

/** اختبار الاتصال وقوائم الحسابات ونسب الضريبة للإعداد في اللوحة */
export async function wafeqCatalog(): Promise<WafeqCatalog> {
  const org = await wafeqJson<{ name?: string; name_en?: string; name_ar?: string }>('GET', '/organization/')
  const accounts: Account[] = []
  for (let page = 1; page <= 10; page++) {
    const r = await wafeqJson<{ results?: Account[]; next?: string | null }>('GET', `/accounts/?page_size=200&page=${page}`)
    accounts.push(...(r.results ?? []))
    if (!r.next) break
  }
  const taxes = await wafeqJson<{ results?: TaxRate[] }>('GET', '/tax-rates/?page_size=100')
  return {
    org: org.name_ar || org.name || org.name_en || '',
    accounts: accounts.map((a) => ({ id: a.id, label: `${a.account_code ? `${a.account_code} · ` : ''}${a.name_ar || a.name_en || a.id}`, payment: !!a.is_payment_enabled, kind: a.classification ?? '' })),
    taxRates: (taxes.results ?? []).map((t) => ({ id: t.id, label: `${t.friendly_name || t.name || t.id}${typeof t.rate === 'number' ? ` (${t.rate}%)` : ''}` })),
  }
}

/* ───────── المحاكاة ─────────
   ذاكرة في العملية: جهات ومستندات ودفعات، ومبالغ تُحسب كما يحسبها وافق (شامل الضريبة)، وPDF صغير صالح. */
type MockDoc = { id: string; external_id: string; amount: number; status: string; number: string; [k: string]: unknown }
type MockStore = { seq: number; contacts: MockDoc[]; invoices: MockDoc[]; 'credit-notes': MockDoc[]; payments: MockDoc[]; reports: string[]; fail: Record<string, number> }
export const mockStore = (): MockStore => ((globalThis as { __wafeqMock?: MockStore }).__wafeqMock ??= { seq: 0, contacts: [], invoices: [], 'credit-notes': [], payments: [], reports: [], fail: {} })

const MOCK_PDF = new TextEncoder().encode('%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj 2 0 obj<</Type/Pages/Kids[]/Count 0>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF\n')

export async function mockFetch(url: string, init: RequestInit): Promise<Response> {
  const st = mockStore()
  const u = new URL(url)
  const path = u.pathname.replace(/^\/v1/, '')
  const method = init.method ?? 'GET'
  const body = init.body ? JSON.parse(String(init.body)) : {}
  const json = (x: unknown, status = 200) => Response.json(x, { status })
  /* فشل مقصود للاختبار: fail['POST /invoices/'] = عدد المرات */
  const fk = `${method} ${path.replace(/\/[a-z]+_[\w]+\//, '/{id}/')}`
  if (st.fail[fk]) { st.fail[fk]--; return json({ detail: 'mock failure' }, 503) }
  if (path === '/organization/') return json({ name: 'منشأة تجريبية' })
  if (path.startsWith('/accounts/')) return json({ results: [{ id: 'acc_rev', account_code: '4000', name_ar: 'إيراد التدريب', classification: 'REVENUE' }, { id: 'acc_disc', account_code: '4100', name_ar: 'خصومات', classification: 'REVENUE' }, { id: 'acc_moyasar', account_code: '1110', name_ar: 'ميسر', classification: 'ASSET', is_payment_enabled: true }], next: null })
  if (path.startsWith('/tax-rates/')) return json({ results: [{ id: 'tax_std', friendly_name: 'ضريبة القيمة المضافة', rate: 15 }] })
  const m = path.match(/^\/(contacts|invoices|credit-notes|payments)\/(?:([\w-]+)\/)?(?:(download|tax-authority\/report)\/)?$/)
  if (!m) return json({ detail: 'not found' }, 404)
  const coll = m[1] as 'contacts' | 'invoices' | 'credit-notes' | 'payments'
  const list = st[coll]
  if (method === 'GET' && !m[2]) {
    const ext = u.searchParams.get('external_id')
    return json({ count: 0, results: list.filter((d) => !ext || d.external_id === ext) })
  }
  const doc = m[2] ? list.find((d) => d.id === m[2]) : undefined
  if (m[2] && !doc) return json({ detail: 'not found' }, 404)
  if (m[3] === 'download') return new Response(MOCK_PDF as BodyInit, { headers: { 'content-type': 'application/pdf' } })
  if (m[3]) { st.reports.push(doc!.id); doc!.tax_authority = { status: 'REPORTED' }; return json({ status: 'REPORTED', reported_ts: new Date().toISOString(), metadata: { errors: [], warnings: [] } }) }
  if (method === 'PATCH') { Object.assign(doc!, body); return json(doc) }
  if (method === 'POST') {
    const lines = (body.line_items ?? []) as { quantity: number; unit_amount: number }[]
    const gross = lines.reduce((n, l) => n + Math.round(l.quantity * l.unit_amount * 100), 0) - Math.round((body.discount_amount ?? 0) * 100)
    const id = `${coll === 'contacts' ? 'cnt' : coll === 'payments' ? 'pay' : coll === 'invoices' ? 'inv' : 'cn'}_${++st.seq}`
    const d: MockDoc = { ...body, id, external_id: body.external_id ?? '', amount: coll === 'payments' ? body.amount : gross / 100, status: body.status ?? 'DRAFT', number: body.invoice_number ?? body.credit_note_number ?? id }
    list.push(d)
    return json(d, 201)
  }
  return json({ detail: 'method' }, 405)
}
