import { PageHeader } from '@medical-crm/ui';
import { OrdersList } from '@/components/orders-list';

export default function OrdersPage() {
  return (
    <>
      <PageHeader title="Orders" />
      <OrdersList />
    </>
  );
}
