'use client';

import { useMemo, useState } from 'react';
import {
  Button,
  DataTable,
  StatusBadge,
  Tabs,
  ConfirmDialog,
  LoadingSpinner,
  type Column,
} from '@medical-crm/ui';
import { formatDate, formatTime } from '@medical-crm/ui';
import { Video, Check, X, PhoneOff } from 'lucide-react';
import { queryFetch, mutationFetch } from '@/lib/query-fetch';
import { VideoConsultationRoom } from './video-consultation-room';
import type {
  VideoConsultation,
  VideoConsultationListResponse,
  VideoConsultationUpdateResponse,
  LiveKitTokenResponse,
} from '@/lib/video-consultation-types';

function sortByScheduledDesc(list: VideoConsultation[]): VideoConsultation[] {
  return [...list].sort((a, b) => {
    const aTime = a.scheduled_at ? new Date(a.scheduled_at).getTime() : 0;
    const bTime = b.scheduled_at ? new Date(b.scheduled_at).getTime() : 0;
    return bTime - aTime;
  });
}

type TabKey = 'all' | 'pending' | 'scheduled' | 'in_progress' | 'closed';

const TABS: { key: TabKey; label: string; statuses: VideoConsultation['status'][] }[] = [
  { key: 'all', label: 'All', statuses: [] },
  { key: 'pending', label: 'Pending', statuses: ['PENDING_CONFIRMATION'] },
  { key: 'scheduled', label: 'Scheduled', statuses: ['SCHEDULED'] },
  { key: 'in_progress', label: 'In Progress', statuses: ['IN_PROGRESS'] },
  { key: 'closed', label: 'Closed', statuses: ['COMPLETED', 'CANCELLED', 'REJECTED'] },
];

const STATUS_LABELS: Record<VideoConsultation['status'], string> = {
  PENDING_CONFIRMATION: 'Pending',
  SCHEDULED: 'Scheduled',
  IN_PROGRESS: 'In Progress',
  COMPLETED: 'Completed',
  CANCELLED: 'Cancelled',
  REJECTED: 'Rejected',
};

interface Props {
  initialData: VideoConsultationListResponse;
}

export function VideoConsultationsList({ initialData }: Props) {
  const [consultations, setConsultations] = useState<VideoConsultation[]>(
    initialData.consultations ? sortByScheduledDesc(initialData.consultations) : [],
  );
  const [activeTab, setActiveTab] = useState<TabKey>('all');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(initialData.error ?? null);

  const [confirming, setConfirming] = useState<VideoConsultation | null>(null);
  const [rejecting, setRejecting] = useState<VideoConsultation | null>(null);
  const [joining, setJoining] = useState<VideoConsultation | null>(null);
  const [completingId, setCompletingId] = useState<string | null>(null);
  const [roomToken, setRoomToken] = useState<LiveKitTokenResponse | null>(null);

  const filtered = useMemo(() => {
    const tab = TABS.find((t) => t.key === activeTab);
    if (!tab || tab.statuses.length === 0) return consultations;
    return consultations.filter((c) => tab.statuses.includes(c.status));
  }, [consultations, activeTab]);

  const counts = useMemo(() => {
    return TABS.map((tab) => ({
      ...tab,
      count:
        tab.statuses.length === 0
          ? consultations.length
          : consultations.filter((c) => tab.statuses.includes(c.status)).length,
    }));
  }, [consultations]);

  async function refresh() {
    setLoading(true);
    setError(null);
    try {
      const data = await queryFetch<VideoConsultationListResponse>('/api/video-consultations');
      setConsultations(sortByScheduledDesc(data.consultations ?? []));
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to load consultations.';
      setError(message);
    } finally {
      setLoading(false);
    }
  }

  async function handleConfirm(consultation: VideoConsultation) {
    try {
      const data = await mutationFetch<VideoConsultationUpdateResponse>(
        `/api/video-consultations/${consultation.id}/confirm`,
        'POST',
      );
      updateConsultation(data.consultation);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to confirm.';
      setError(message);
    } finally {
      setConfirming(null);
    }
  }

  async function handleReject(consultation: VideoConsultation) {
    try {
      const data = await mutationFetch<VideoConsultationUpdateResponse>(
        `/api/video-consultations/${consultation.id}/reject`,
        'POST',
      );
      updateConsultation(data.consultation);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to reject.';
      setError(message);
    } finally {
      setRejecting(null);
    }
  }

  async function handleJoin(consultation: VideoConsultation) {
    setJoining(consultation);
    setError(null);
    try {
      const data = await mutationFetch<LiveKitTokenResponse>('/api/video-consultations/token', 'POST', {
        roomName: consultation.room_name,
        identity: consultation.host_identity || `admin-${consultation.id}`,
        displayName: consultation.doctor_name || 'Admin',
      });
      setRoomToken(data);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to enter room.';
      setError(message);
      setJoining(null);
    }
  }

  async function handleComplete(consultation: VideoConsultation) {
    if (!window.confirm(`End meeting "${consultation.title || 'Untitled'}"? The doctor's time slot will be freed.`)) {
      return;
    }
    setCompletingId(consultation.id);
    setError(null);
    try {
      const res = await fetch(`/api/video-consultations/${consultation.id}/complete`, {
        method: 'POST',
      });
      const data = (await res.json().catch(() => ({ error: 'invalid response' }))) as {
        success?: boolean;
        consultation?: VideoConsultation;
        error?: string;
      };
      if (!res.ok || !data.success || !data.consultation) {
        throw new Error(data.error || 'Failed to end meeting');
      }
      updateConsultation(data.consultation);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to end meeting';
      setError(message);
    } finally {
      setCompletingId(null);
    }
  }

  function updateConsultation(updated: VideoConsultation) {
    setConsultations((prev) =>
      prev.map((c) => (c.id === updated.id ? updated : c)),
    );
  }

  function isRoomOpen(c: VideoConsultation): boolean {
    if (c.status === 'IN_PROGRESS') return true;
    if (c.status === 'SCHEDULED' && c.scheduled_at) {
      return new Date(c.scheduled_at).getTime() <= Date.now();
    }
    return false;
  }

  function formatDateTime(value: string | null): string {
    if (!value) return '—';
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return value;
    return `${formatDate(d)} at ${formatTime(d)}`;
  }

  const columns: Column<VideoConsultation>[] = [
    {
      key: 'status',
      header: 'Status',
      className: 'w-36',
      render: (c) => <StatusBadge status={c.status} label={STATUS_LABELS[c.status]} />,
    },
    {
      key: 'title',
      header: 'Title',
      render: (c) => (
        <div>
          <div className="font-medium text-slate-900">{c.title || 'Untitled consultation'}</div>
          {c.description && (
            <div className="mt-0.5 line-clamp-1 text-xs text-slate-500">{c.description}</div>
          )}
        </div>
      ),
    },
    {
      key: 'doctor',
      header: 'Doctor',
      className: 'w-40',
      render: (c) => <span className="text-slate-700">{c.doctor_name || c.doctor_id || '—'}</span>,
    },
    {
      key: 'scheduled',
      header: 'Scheduled',
      className: 'w-48',
      render: (c) => <span className="text-slate-700">{formatDateTime(c.scheduled_at)}</span>,
    },
    {
      key: 'patient',
      header: 'Patient',
      className: 'w-48',
      render: (c) => {
        const display = c.patient_name || c.patient_email || c.patient_id || '—';
        return (
          <div className="text-sm">
            <div className="font-medium text-slate-900">{display}</div>
            {c.patient_name && c.patient_email && (
              <div className="text-xs text-slate-500">{c.patient_email}</div>
            )}
            {!c.patient_name && c.patient_id && (
              <div className="text-xs text-slate-400">{c.patient_id}</div>
            )}
          </div>
        );
      },
    },
    {
      key: 'actions',
      header: 'Actions',
      className: 'w-72',
      render: (c) => {
        if (c.status === 'PENDING_CONFIRMATION') {
          return (
            <div className="flex items-center gap-2">
              <Button
                size="sm"
                className="h-8 gap-1 bg-emerald-600 text-white hover:bg-emerald-700"
                onClick={() => setConfirming(c)}
              >
                <Check className="h-3.5 w-3.5" /> Confirm
              </Button>
              <Button
                size="sm"
                variant="outline"
                className="h-8 gap-1 text-rose-600 hover:bg-rose-50 hover:text-rose-700"
                onClick={() => setRejecting(c)}
              >
                <X className="h-3.5 w-3.5" /> Reject
              </Button>
            </div>
          );
        }

        if (isRoomOpen(c)) {
          return (
            <div className="flex items-center gap-2">
              <Button
                size="sm"
                className="h-8 gap-1"
                onClick={() => void handleJoin(c)}
                disabled={joining?.id === c.id}
              >
                {joining?.id === c.id ? (
                  <LoadingSpinner size="sm" />
                ) : (
                  <Video className="h-3.5 w-3.5" />
                )}
                Enter room
              </Button>
              {(c.status === 'SCHEDULED' || c.status === 'IN_PROGRESS') && (
                <Button
                  size="sm"
                  variant="outline"
                  className="h-8 shrink-0 gap-1 whitespace-nowrap text-rose-600 hover:bg-rose-50 hover:text-rose-700"
                  onClick={() => void handleComplete(c)}
                  disabled={completingId === c.id}
                  title="End meeting"
                >
                  {completingId === c.id ? (
                    <LoadingSpinner size="sm" />
                  ) : (
                    <PhoneOff className="h-3.5 w-3.5" />
                  )}
                  End meeting
                </Button>
              )}
            </div>
          );
        }

        if (c.status === 'SCHEDULED') {
          return (
            <div className="flex items-center gap-2">
              <span className="inline-flex items-center gap-1 whitespace-nowrap text-xs text-slate-400">
                <PhoneOff className="h-3.5 w-3.5" /> Opens at {formatTime(new Date(c.scheduled_at!))}
              </span>
              <Button
                size="sm"
                variant="outline"
                className="h-8 shrink-0 gap-1 whitespace-nowrap text-rose-600 hover:bg-rose-50 hover:text-rose-700"
                onClick={() => void handleComplete(c)}
                disabled={completingId === c.id}
                title="End meeting"
              >
                {completingId === c.id ? (
                  <LoadingSpinner size="sm" />
                ) : (
                  <PhoneOff className="h-3.5 w-3.5" />
                )}
                End meeting
              </Button>
            </div>
          );
        }

        return <span className="text-xs text-slate-400">—</span>;
      },
    },
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <Tabs
          items={counts.map((c) => ({ key: c.key, label: c.label, count: c.count }))}
          activeKey={activeTab}
          onChange={(key) => setActiveTab(key as TabKey)}
        />
        <Button variant="outline" onClick={() => void refresh()} disabled={loading}>
          {loading ? <LoadingSpinner size="sm" /> : 'Refresh'}
        </Button>
      </div>

      {error && (
        <div className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
          {error}
        </div>
      )}

      <DataTable
        columns={columns}
        data={filtered}
        keyExtractor={(c) => c.id}
        emptyState={
          <div className="rounded-xl border border-slate-200 bg-white py-16 text-center">
            <p className="text-sm text-slate-500">No video consultations found.</p>
          </div>
        }
      />

      <ConfirmDialog
        open={!!confirming}
        title="Confirm video consultation"
        message={`Are you sure you want to confirm the consultation "${confirming?.title || 'Untitled'}"?`}
        onCancel={() => setConfirming(null)}
        onConfirm={() => confirming && void handleConfirm(confirming)}
        confirmLabel="Confirm"
      />

      <ConfirmDialog
        open={!!rejecting}
        title="Reject video consultation"
        message={`Are you sure you want to reject the consultation "${rejecting?.title || 'Untitled'}"? This cannot be undone.`}
        onCancel={() => setRejecting(null)}
        onConfirm={() => rejecting && void handleReject(rejecting)}
        confirmLabel="Reject"
        variant="danger"
      />

      {roomToken && joining && (
        <VideoConsultationRoom
          token={roomToken.token}
          livekitUrl={roomToken.livekitUrl}
          identity={roomToken.identity}
          displayName={joining.doctor_name || roomToken.identity}
          roomName={roomToken.roomName}
          consultationId={joining.id}
          patientLanguage={joining.patient_language || 'en'}
          onClose={() => {
            setRoomToken(null);
            setJoining(null);
          }}
        />
      )}
    </div>
  );
}
