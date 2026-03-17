'use client';

import { useState } from 'react';
import { Card, CardHeader, CardTitle, StatusBadge, DataTable, EmptyState, type Column } from '@medical-crm/ui';
import { ShoppingCart, ChevronDown, ChevronUp } from 'lucide-react';
import { useOrders } from '@/queries/use-orders';

// ── Types ─────────────────────────────────────────────────────────────

type OrderStatus =
  | 'PENDING_PAYMENT'
  | 'PAID'
  | 'IN_PROGRESS'
  | 'COMPLETED'
  | 'CANCELLED'
  | 'REFUNDED';

interface OrderItem {
  id: string;
  orderNumber?: string;
  packageId?: string;
  amount?: number;
  currency?: string;
  status?: OrderStatus | string;
  createdAt?: string;
  notes?: string;
}

interface CaseOrdersTabProps {
  caseId: string;
}

// ── Order Detail Row ──────────────────────────────────────────────────

function OrderDetailRow({ order }: { order: OrderItem }) {
  return (
    <div className="bg-slate-50 border-t border-slate-100 px-4 py-4">
      <dl className="grid grid-cols-2 gap-x-6 gap-y-3 sm:grid-cols-3 text-sm">
        <div>
          <dt className="text-xs font-medium text-slate-500 uppercase tracking-wide">Order ID</dt>
          <dd className="font-mono text-xs text-slate-700 mt-0.5">{order.id}</dd>
        </div>
        {order.packageId && (
          <div>
            <dt className="text-xs font-medium text-slate-500 uppercase tracking-wide">Package ID</dt>
            <dd className="font-mono text-xs text-slate-700 mt-0.5">{order.packageId}</dd>
          </div>
        )}
        {order.notes && (
          <div className="col-span-full">
            <dt className="text-xs font-medium text-slate-500 uppercase tracking-wide">Notes</dt>
            <dd className="text-slate-700 mt-0.5">{order.notes}</dd>
          </div>
        )}
      </dl>
    </div>
  );
}

// ── Main Export ───────────────────────────────────────────────────────

export function CaseOrdersTab({ caseId }: CaseOrdersTabProps) {
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const { data: raw, isLoading } = useOrders({ caseId });

  const orders: OrderItem[] =
    raw != null
      ? Array.isArray(raw)
        ? raw
        : ((raw as { data?: OrderItem[] }).data ?? [])
      : [];

  const columns: Column<OrderItem>[] = [
    {
      key: 'orderNumber',
      header: 'Order #',
      render: (row) => (
        <span className="font-mono text-sm font-medium text-slate-800">
          {row.orderNumber ?? row.id.slice(0, 8)}
        </span>
      ),
    },
    {
      key: 'packageId',
      header: 'Package',
      render: (row) => (
        <span className="text-sm text-slate-600">
          {row.packageId ? (
            <span className="font-mono text-xs">{row.packageId.slice(0, 12)}...</span>
          ) : (
            <span className="text-slate-400">—</span>
          )}
        </span>
      ),
    },
    {
      key: 'amount',
      header: 'Amount',
      render: (row) => (
        <span className="text-sm font-semibold text-slate-800">
          {row.amount != null ? (
            <>
              {row.currency ?? 'USD'} {row.amount.toLocaleString()}
            </>
          ) : (
            <span className="text-slate-400">—</span>
          )}
        </span>
      ),
    },
    {
      key: 'status',
      header: 'Status',
      render: (row) => <StatusBadge status={row.status ?? 'UNKNOWN'} />,
    },
    {
      key: 'createdAt',
      header: 'Created',
      render: (row) => (
        <span className="text-xs text-slate-500">
          {row.createdAt ? new Date(row.createdAt).toLocaleDateString() : '—'}
        </span>
      ),
    },
    {
      key: 'expand',
      header: '',
      render: (row) => (
        <button
          onClick={() => setExpandedId(expandedId === row.id ? null : row.id)}
          className="p-1.5 text-slate-400 hover:text-indigo-600 rounded-lg hover:bg-indigo-50 transition-colors"
        >
          {expandedId === row.id ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
        </button>
      ),
    },
  ];

  return (
    <Card>
      <CardHeader>
        <CardTitle>Orders</CardTitle>
      </CardHeader>

      {isLoading ? (
        <div className="flex items-center justify-center py-20">
          <div className="h-6 w-6 animate-spin rounded-full border-2 border-indigo-600 border-t-transparent" />
        </div>
      ) : (
        <>
          <DataTable
            columns={columns}
            data={orders}
            keyExtractor={(row) => row.id}
            emptyState={
              <EmptyState
                icon={<ShoppingCart size={36} />}
                title="No orders yet"
                description="Orders for this case will appear here."
              />
            }
          />
          {/* Expanded detail rows rendered below table */}
          {orders.map((order) =>
            expandedId === order.id ? (
              <OrderDetailRow key={`detail-${order.id}`} order={order} />
            ) : null,
          )}
        </>
      )}
    </Card>
  );
}
