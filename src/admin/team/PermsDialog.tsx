'use client'
/* صلاحيات عضو واحد — كل صلاحية بثلاث حالات: حسب الدور، أو منح، أو حجب. الافتراضي ظاهر بجوار كل صلاحية. */
import { useRef, useState } from 'react'
import { PERM_GROUPS, ROLE_LABEL, roleDefaults, isRole, type Perm } from '@/lib/permissions'
import { setMemberPerms } from './actions'
import t from './team.module.css'

type State = 'role' | 'grant' | 'deny'

function parse(perms: string | null) {
  try { const v = JSON.parse(perms ?? 'null'); return { add: (v?.['+'] ?? []) as string[], del: (v?.['-'] ?? []) as string[] } } catch { return { add: [], del: [] } }
}

export function PermsDialog({ userId, role, perms, name, onDone }: { userId: string; role: string; perms: string | null; name: string; onDone: () => void }) {
  const dlg = useRef<HTMLDialogElement>(null)
  const base = roleDefaults(role)
  const init = parse(perms)
  const [st, setSt] = useState<Record<string, State>>(() => Object.fromEntries(PERM_GROUPS.flatMap((g) => g.perms.map(([k]) => [k, init.add.includes(k) ? 'grant' : init.del.includes(k) ? 'deny' : 'role']))))
  const [err, setErr] = useState('')
  const custom = Object.values(st).filter((x) => x !== 'role').length

  const save = async () => {
    const add = Object.entries(st).filter(([, x]) => x === 'grant').map(([k]) => k)
    const remove = Object.entries(st).filter(([, x]) => x === 'deny').map(([k]) => k)
    const r = await setMemberPerms(userId, { add, remove })
    if (!r.ok) return setErr(r.error ?? 'تعذّر')
    dlg.current?.close()
    onDone()
  }

  return (
    <>
      <button type="button" className={t.permsBtn} onClick={() => dlg.current?.showModal()}>
        الصلاحيات{custom > 0 && <span className="num"> · {custom} مخصّصة</span>}
      </button>
      <dialog ref={dlg} className={t.dialog} aria-label={`صلاحيات ${name}`}>
        <div className={t.dHead}>
          <strong>صلاحيات {name}</strong>
          <span className={t.muted}>الدور: {isRole(role) ? ROLE_LABEL[role] : 'بانتظار التفعيل'} — «حسب الدور» يتبع الدور إن تغيّر</span>
        </div>
        {PERM_GROUPS.map((g) => (
          <fieldset key={g.title} className={t.group}>
            <legend>{g.title}</legend>
            {g.perms.map(([k, label]) => {
              const inRole = base.includes(k as Perm)
              const eff = st[k] === 'grant' || (st[k] === 'role' && inRole)
              return (
                <div key={k} className={t.perm} data-on={eff ? '1' : '0'}>
                  <span>{label}<small className={t.muted}>{inRole ? 'في الدور' : 'ليست في الدور'}</small></span>
                  <select aria-label={label} value={st[k]} onChange={(e) => setSt((o) => ({ ...o, [k]: e.target.value as State }))}>
                    <option value="role">حسب الدور ({inRole ? 'مسموح' : 'ممنوع'})</option>
                    {!inRole && <option value="grant">منح</option>}
                    {inRole && <option value="deny">حجب</option>}
                  </select>
                </div>
              )
            })}
          </fieldset>
        ))}
        {err && <p className={t.err} role="alert">{err}</p>}
        <div className={t.dActions}>
          <button type="button" className="btn" onClick={save}>حفظ الصلاحيات</button>
          <button type="button" className="btn ghost" onClick={() => setSt(Object.fromEntries(Object.keys(st).map((k) => [k, 'role'])))}>كما في الدور</button>
          <button type="button" className="btn ghost" onClick={() => dlg.current?.close()}>إلغاء</button>
        </div>
      </dialog>
    </>
  )
}
