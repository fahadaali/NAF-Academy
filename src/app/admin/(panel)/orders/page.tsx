import { ordersList } from '@/admin/sales/data'
import { OrdersTable } from '@/admin/sales/OrdersTable'

export default async function Orders() {
  return <OrdersTable rows={await ordersList()} />
}
