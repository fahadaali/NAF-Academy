'use client'
/* أدوات اللوحة — حقول ومحرّرات قوائم وترتيب بالسحب، بهوية الأكاديمية. */
import { useRef, useState, type ReactNode } from 'react'
import { Words } from '@/components/Words'
import styles from './kit.module.css'

export function PageHead({ title, sub, actions }: { title: string; sub?: string; actions?: ReactNode }) {
  return (
    <header className={styles.pageHead}>
      <div>
        <Words as="h1" text={title} />
        {sub && <p className="rise" style={{ ['--d' as string]: 3 }}>{sub}</p>}
      </div>
      {actions && <div className={`${styles.actions} rise`} style={{ ['--d' as string]: 4 }}>{actions}</div>}
    </header>
  )
}

export function Section({ title, desc, children, aside }: { title: string; desc?: string; children: ReactNode; aside?: ReactNode }) {
  return (
    <section className={`${styles.section} reveal`}>
      <div className={styles.sectionHead}>
        <div>
          <h2>{title}</h2>
          {desc && <p>{desc}</p>}
        </div>
        {aside}
      </div>
      <div className={styles.sectionBody}>{children}</div>
    </section>
  )
}

export function Field({ label, hint, error, children, wide }: { label: string; hint?: string; error?: string; children: ReactNode; wide?: boolean }) {
  return (
    <label className={`${styles.field} ${wide ? styles.wide : ''}`} data-error={error ? '1' : '0'}>
      <span className={styles.label}>{label}</span>
      {children}
      {error ? <span className={styles.err}>{error}</span> : hint ? <span className={styles.hint}>{hint}</span> : null}
    </label>
  )
}

export const Grid = ({ children, cols = 2 }: { children: ReactNode; cols?: 1 | 2 | 3 }) => (
  <div className={styles.grid} data-cols={cols}>{children}</div>
)

type InputProps = React.InputHTMLAttributes<HTMLInputElement>
export const Input = (p: InputProps) => <input {...p} className={`${styles.input} ${p.className ?? ''}`} />
export const Textarea = (p: React.TextareaHTMLAttributes<HTMLTextAreaElement>) => (
  <textarea {...p} className={`${styles.input} ${styles.textarea} ${p.className ?? ''}`} />
)

export function Select<T extends string>({ value, onChange, options }: { value: T; onChange: (v: T) => void; options: { value: T; label: string }[] }) {
  return (
    <select className={styles.input} value={value} onChange={(e) => onChange(e.target.value as T)}>
      {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
    </select>
  )
}

export function Segmented<T extends string>({ value, onChange, options }: { value: T; onChange: (v: T) => void; options: { value: T; label: string; tone?: string }[] }) {
  return (
    <div className={styles.segmented} role="radiogroup">
      {options.map((o) => (
        <button type="button" key={o.value} role="radio" aria-checked={value === o.value} data-tone={o.tone} onClick={() => onChange(o.value)}>
          {o.label}
        </button>
      ))}
    </div>
  )
}

export function Switch({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <button type="button" role="switch" aria-checked={checked} className={styles.switch} onClick={() => onChange(!checked)}>
      <span className={styles.knob} aria-hidden="true" />
      {label}
    </button>
  )
}

/** مبلغ بالريال ↔ هللات */
export function Money({ value, onChange, placeholder }: { value: number | null; onChange: (v: number | null) => void; placeholder?: string }) {
  return (
    <div className={styles.money}>
      <input
        className={styles.input}
        inputMode="decimal"
        dir="ltr"
        placeholder={placeholder}
        value={value === null ? '' : String(value / 100)}
        onChange={(e) => {
          const t = e.target.value.replace(/[^\d.]/g, '')
          onChange(t === '' ? null : Math.round(Number(t) * 100))
        }}
      />
      <span className={styles.unit}>{'⃁'}</span>
    </div>
  )
}

/* توقيت الرياض ثابت +03:00 بلا توقيت صيفي */
export const toLocal = (iso: string | null | undefined) =>
  iso ? new Date(new Date(iso).getTime() + 3 * 3600e3).toISOString().slice(0, 16) : ''
export const fromLocal = (v: string) => (v ? new Date(`${v}:00+03:00`).toISOString() : null)

export function DateTime({ value, onChange }: { value: string | null; onChange: (v: string | null) => void }) {
  return <input type="datetime-local" className={styles.input} dir="ltr" value={toLocal(value)} onChange={(e) => onChange(fromLocal(e.target.value))} />
}

/* ── ترتيب بالسحب مع أزرار للوحة المفاتيح ── */
export function useSortable<T>(items: T[], onChange: (next: T[]) => void) {
  const from = useRef<number | null>(null)
  const [over, setOver] = useState<number | null>(null)
  const move = (a: number, b: number) => {
    if (b < 0 || b >= items.length || a === b) return
    const next = items.slice()
    const [x] = next.splice(a, 1)
    next.splice(b, 0, x)
    onChange(next)
  }
  const props = (i: number) => ({
    draggable: true,
    'data-over': over === i ? '1' : '0',
    onDragStart: (e: React.DragEvent) => { from.current = i; e.dataTransfer.effectAllowed = 'move' },
    onDragOver: (e: React.DragEvent) => { e.preventDefault(); setOver(i) },
    onDragLeave: () => setOver((o) => (o === i ? null : o)),
    onDrop: (e: React.DragEvent) => { e.preventDefault(); if (from.current !== null) move(from.current, i); from.current = null; setOver(null) },
    onDragEnd: () => { from.current = null; setOver(null) },
  })
  return { props, move }
}

export function RowTools({ i, n, move, onRemove }: { i: number; n: number; move: (a: number, b: number) => void; onRemove?: () => void }) {
  return (
    <span className={styles.rowTools}>
      <span className={styles.grip} aria-hidden="true">⋮⋮</span>
      <button type="button" aria-label="أعلى" disabled={i === 0} onClick={() => move(i, i - 1)}>↑</button>
      <button type="button" aria-label="أسفل" disabled={i === n - 1} onClick={() => move(i, i + 1)}>↓</button>
      {onRemove && <button type="button" aria-label="حذف" className={styles.remove} onClick={onRemove}>✕</button>}
    </span>
  )
}

export function ListEditor({ value, onChange, placeholder, add = 'إضافة' }: { value: string[]; onChange: (v: string[]) => void; placeholder?: string; add?: string }) {
  const { props, move } = useSortable(value, onChange)
  return (
    <div className={styles.list}>
      {value.map((v, i) => (
        <div key={i} className={styles.row} {...props(i)}>
          <input className={styles.input} value={v} placeholder={placeholder} onChange={(e) => onChange(value.map((x, k) => (k === i ? e.target.value : x)))} />
          <RowTools i={i} n={value.length} move={move} onRemove={() => onChange(value.filter((_, k) => k !== i))} />
        </div>
      ))}
      <button type="button" className={styles.add} onClick={() => onChange([...value, ''])}>+ {add}</button>
    </div>
  )
}

export function FaqEditor({ value, onChange }: { value: { q: string; a: string }[]; onChange: (v: { q: string; a: string }[]) => void }) {
  const { props, move } = useSortable(value, onChange)
  const set = (i: number, k: 'q' | 'a', t: string) => onChange(value.map((x, j) => (j === i ? { ...x, [k]: t } : x)))
  return (
    <div className={styles.list}>
      {value.map((f, i) => (
        <div key={i} className={`${styles.row} ${styles.faq}`} {...props(i)}>
          <div className={styles.faqBody}>
            <input className={styles.input} value={f.q} placeholder="السؤال" onChange={(e) => set(i, 'q', e.target.value)} />
            <textarea className={`${styles.input} ${styles.textarea}`} rows={2} value={f.a} placeholder="الإجابة" onChange={(e) => set(i, 'a', e.target.value)} />
          </div>
          <RowTools i={i} n={value.length} move={move} onRemove={() => onChange(value.filter((_, k) => k !== i))} />
        </div>
      ))}
      <button type="button" className={styles.add} onClick={() => onChange([...value, { q: '', a: '' }])}>+ سؤال</button>
    </div>
  )
}

export function Badge({ tone, children }: { tone: string; children: ReactNode }) {
  return <span className={styles.badge} data-tone={tone}>{children}</span>
}

/** شريط الحفظ الثابت أسفل المحرّر */
export function SaveBar({ dirty, saving, message, onSave, extra }: { dirty: boolean; saving: boolean; message?: { ok: boolean; text: string } | null; onSave: () => void; extra?: ReactNode }) {
  return (
    <div className={styles.saveBar} data-dirty={dirty ? '1' : '0'}>
      <span className={styles.saveMsg} data-ok={message?.ok ? '1' : '0'} role="status" aria-live="polite">
        {message?.text ?? (dirty ? 'تغييرات غير محفوظة' : 'كل التغييرات محفوظة')}
      </span>
      <div className={styles.actions}>
        {extra}
        <button type="button" className="btn" disabled={saving || !dirty} onClick={onSave}>{saving ? 'جارٍ الحفظ…' : 'حفظ'}</button>
      </div>
    </div>
  )
}
