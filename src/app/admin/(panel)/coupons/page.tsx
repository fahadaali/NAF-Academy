import { couponsList } from '@/admin/sales/data'
import { CouponsTable } from '@/admin/sales/CouponsTable'

export default async function Coupons() {
  return <CouponsTable rows={await couponsList()} />
}
