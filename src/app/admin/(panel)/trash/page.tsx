import { trashed } from '@/admin/data'
import { PageHead } from '@/admin/ui/kit'
import { TrashList } from '@/admin/TrashList'

export default async function Trash() {
  const items = await trashed()
  return (
    <>
      <PageHead title="المحذوفات" sub="كل حذف يمرّ من هنا أولاً — استرجعه متى شئت" />
      <TrashList items={items} />
    </>
  )
}
