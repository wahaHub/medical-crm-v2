'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Video, Calendar, Clock, Plus } from 'lucide-react';
import {
  StatCard,
  Tabs,
  StatusBadge,
  Button,
  Modal,
  EmptyState,
  formatDate,
  formatTime,
} from '@medical-crm/ui';
import { useConsultations, useConsultationStats } from '@/queries/use-consultations';
import { createConsultation, updateConsultationStatus } from '@/actions/consultation-actions';

interface ConsultationsListProps {
  initialData: any;
  initialStats: any;
}

const statusTabs = [
  { key: 'all', label: 'All' },
  { key: 'SCHEDULED', label: 'Scheduled' },
  { key: 'COMPLETED', label: 'Completed' },
  { key: 'CANCELLED', label: 'Cancelled' },
];

export function ConsultationsList({ initialData, initialStats }: ConsultationsListProps) {
  const router = useRouter();
  const [status, setStatus] = useState('SCHEDULED');
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const params: Record<string, string> = { limit: '20' };
  if (status !== 'all') params.status = status;

  const { data, fetchNextPage, hasNextPage, isFetchingNextPage } = useConsultations(params);
  const { data: liveStats } = useConsultationStats();

  const stats = liveStats ?? initialStats;
  const allPages = data?.pages ?? [initialData];
  const consultations = allPages.flatMap((page: any) => page.data ?? []);

  return (
    <div className="space-y-6">
      {/* Stat Cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <StatCard
          icon={<Video size={24} />}
          value={stats.total ?? 0}
          label="Total Consultations"
        />
        <StatCard
          icon={<Calendar size={24} />}
          value={stats.scheduled ?? 0}
          label="Scheduled"
          colorClass="text-blue-600 bg-blue-50"
        />
        <StatCard
          icon={<Video size={24} />}
          value={stats.completed ?? 0}
          label="Completed"
          colorClass="text-emerald-600 bg-emerald-50"
        />
      </div>

      {/* Tabs + Create button */}
      <div className="flex items-center justify-between gap-4">
        <Tabs
          items={statusTabs}
          activeKey={status}
          onChange={(key) => setStatus(key)}
        />
        <Button onClick={() => setShowCreateModal(true)} className="gap-2">
          <Plus size={16} />
          New Consultation
        </Button>
      </div>

      {/* Consultation Cards */}
      {consultations.length === 0 ? (
        <EmptyState
          icon={<Video size={48} />}
          title="No consultations found"
          description="Create a new consultation to get started."
        />
      ) : (
        <div className="space-y-3">
          {consultations.map((c: any) => (
            <div
              key={c.id}
              className="rounded-2xl bg-white p-5 shadow-sm transition-shadow hover:shadow-md"
            >
              <div
                className="flex cursor-pointer items-center justify-between"
                onClick={() => setExpandedId(expandedId === c.id ? null : c.id)}
              >
                <div className="flex items-center gap-4">
                  <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-indigo-50 text-indigo-600">
                    <Video size={20} />
                  </div>
                  <div>
                    <div className="font-medium text-slate-900">
                      {c.patientName ?? 'Unknown Patient'}
                    </div>
                    <div className="flex items-center gap-3 text-sm text-slate-500">
                      <span className="flex items-center gap-1">
                        <Calendar size={14} />
                        {c.scheduledAt ? formatDate(c.scheduledAt) : 'Not scheduled'}
                      </span>
                      {c.scheduledAt && (
                        <span className="flex items-center gap-1">
                          <Clock size={14} />
                          {formatTime(c.scheduledAt)}
                        </span>
                      )}
                      {c.durationMinutes && (
                        <span>{c.durationMinutes} min</span>
                      )}
                    </div>
                  </div>
                </div>
                <StatusBadge status={c.status} />
              </div>

              {/* Expanded details */}
              {expandedId === c.id && (
                <div className="mt-4 border-t border-slate-100 pt-4">
                  {c.notes && (
                    <p className="mb-3 text-sm text-slate-600">{c.notes}</p>
                  )}
                  <div className="flex gap-2">
                    {c.status === 'SCHEDULED' && (
                      <>
                        <Button
                          size="sm"
                          onClick={() => router.push(`/consultations/${c.id}/room`)}
                        >
                          Join Call
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => updateConsultationStatus(c.id, 'cancel')}
                        >
                          Cancel
                        </Button>
                      </>
                    )}
                    {c.status === 'COMPLETED' && (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => router.push(`/consultations/${c.id}/room`)}
                      >
                        View Recording
                      </Button>
                    )}
                  </div>
                </div>
              )}
            </div>
          ))}

          {/* Load More */}
          {hasNextPage && (
            <div className="flex justify-center pt-4">
              <Button
                variant="outline"
                onClick={() => fetchNextPage()}
                disabled={isFetchingNextPage}
              >
                {isFetchingNextPage ? 'Loading...' : 'Load More'}
              </Button>
            </div>
          )}
        </div>
      )}

      {/* Create Consultation Modal */}
      <CreateConsultationModal
        open={showCreateModal}
        onClose={() => setShowCreateModal(false)}
      />
    </div>
  );
}

function CreateConsultationModal({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const [caseId, setCaseId] = useState('');
  const [scheduledAt, setScheduledAt] = useState('');
  const [durationMinutes, setDurationMinutes] = useState('30');
  const [notes, setNotes] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!caseId || !scheduledAt) return;
    setIsSubmitting(true);
    try {
      await createConsultation({
        caseId,
        scheduledAt: new Date(scheduledAt).toISOString(),
        durationMinutes: durationMinutes ? Number(durationMinutes) : undefined,
        notes: notes || undefined,
      });
      setCaseId('');
      setScheduledAt('');
      setDurationMinutes('30');
      setNotes('');
      onClose();
    } catch {
      // Error handled by apiClient
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Modal open={open} onClose={onClose} title="Schedule Consultation">
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="mb-1 block text-sm font-medium text-slate-700">
            Case ID
          </label>
          <input
            type="text"
            value={caseId}
            onChange={(e) => setCaseId(e.target.value)}
            required
            className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-indigo-300 focus:outline-none focus:ring-2 focus:ring-indigo-100"
            placeholder="Enter case ID"
          />
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium text-slate-700">
            Scheduled Date & Time
          </label>
          <input
            type="datetime-local"
            value={scheduledAt}
            onChange={(e) => setScheduledAt(e.target.value)}
            required
            className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-indigo-300 focus:outline-none focus:ring-2 focus:ring-indigo-100"
          />
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium text-slate-700">
            Duration (minutes)
          </label>
          <input
            type="number"
            value={durationMinutes}
            onChange={(e) => setDurationMinutes(e.target.value)}
            min={5}
            max={180}
            className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-indigo-300 focus:outline-none focus:ring-2 focus:ring-indigo-100"
          />
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium text-slate-700">
            Notes
          </label>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={3}
            className="w-full resize-none rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-indigo-300 focus:outline-none focus:ring-2 focus:ring-indigo-100"
            placeholder="Optional notes..."
          />
        </div>
        <div className="flex justify-end gap-3 pt-2">
          <Button type="button" variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" disabled={isSubmitting || !caseId || !scheduledAt}>
            {isSubmitting ? 'Creating...' : 'Schedule'}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
