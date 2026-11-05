import { Suspense } from 'react'
import { adminLists } from '@/admin/data'
import { Library } from '@/admin/media/Library'

export default async function MediaPage() {
  const { media } = await adminLists()
  return <Suspense><Library items={media} /></Suspense>
}
