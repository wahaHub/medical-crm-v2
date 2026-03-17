'use client';

import { useState, useTransition } from 'react';
import { StatusBadge, Button, ConfirmDialog } from '@medical-crm/ui';
import { updateHospitalStatus } from '@/actions/hospital-actions';

interface HospitalReviewProps {
  hospitalId: string;
  currentStatus: string;
}

const HOSPITAL_STATUS_COLORS: Record<string, string> = {
  PENDING: 'bg-amber-50 text-amber-700',
  ACTIVE: 'bg-emerald-50 text-emerald-700',
  INACTIVE: 'bg-slate-100 text-slate-500',
};

type StatusAction = {
  label: string;
  nextStatus: string;
  variant: 'default' | 'destructive' | 'outline';
  requiresConfirm?: boolean;
  confirmTitle?: string;
  confirmMessage?: string;
};

const STATUS_ACTIONS: Record<string, StatusAction> = {
  PENDING: {
    label: 'Approve',
    nextStatus: 'ACTIVE',
    variant: 'default',
  },
  ACTIVE: {
    label: 'Deactivate',
    nextStatus: 'INACTIVE',
    variant: 'destructive',
    requiresConfirm: true,
    confirmTitle: 'Deactivate Hospital',
    confirmMessage:
      'Are you sure you want to deactivate this hospital? It will no longer be accessible to patients.',
  },
  INACTIVE: {
    label: 'Reactivate',
    nextStatus: 'ACTIVE',
    variant: 'default',
  },
};

export function HospitalReview({ hospitalId, currentStatus }: HospitalReviewProps) {
  const [isPending, startTransition] = useTransition();
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const action = STATUS_ACTIONS[currentStatus];

  function handleAction() {
    if (!action) return;
    if (action.requiresConfirm) {
      setConfirmOpen(true);
      return;
    }
    performStatusUpdate(action.nextStatus);
  }

  function performStatusUpdate(nextStatus: string) {
    setError(null);
    startTransition(async () => {
      try {
        await updateHospitalStatus(hospitalId, nextStatus);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to update status');
      }
    });
  }

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-5">
      <h3 className="mb-4 text-sm font-semibold text-slate-700">Hospital Status</h3>
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <span className="text-sm text-slate-500">Current status:</span>
          <StatusBadge status={currentStatus} colorMap={HOSPITAL_STATUS_COLORS} />
        </div>
        {action && (
          <Button
            variant={action.variant}
            size="sm"
            onClick={handleAction}
            disabled={isPending}
          >
            {isPending ? 'Updating...' : action.label}
          </Button>
        )}
      </div>
      {error && (
        <p className="mt-3 text-sm text-rose-600">{error}</p>
      )}

      {action?.requiresConfirm && (
        <ConfirmDialog
          open={confirmOpen}
          title={action.confirmTitle ?? 'Confirm Action'}
          message={action.confirmMessage ?? 'Are you sure?'}
          confirmLabel={action.label}
          variant="danger"
          onConfirm={() => {
            setConfirmOpen(false);
            performStatusUpdate(action.nextStatus);
          }}
          onCancel={() => setConfirmOpen(false)}
        />
      )}
    </div>
  );
}
