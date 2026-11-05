'use client'
/* صلاحيات العضو في واجهة اللوحة — تُخفى الأدوات التي يرفضها الخادم بدل أن تُعرض ثم تُطرد.
   الخادم يبقى الحَكَم (requirePermission في كل إجراء)؛ هذا للعرض فقط. */
import { createContext, useContext, type ReactNode } from 'react'
import type { Perm } from '@/lib/permissions'

const Ctx = createContext<readonly Perm[]>([])

export function PermsProvider({ perms, children }: { perms: readonly Perm[]; children: ReactNode }) {
  return <Ctx.Provider value={perms}>{children}</Ctx.Provider>
}

/** ‎`const can = useCan(); can('content.write')` */
export function useCan() {
  const perms = useContext(Ctx)
  return (p: Perm) => perms.includes(p)
}
