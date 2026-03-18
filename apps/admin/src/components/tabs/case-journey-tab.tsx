'use client';

import { useMemo, useState, useTransition } from 'react';
import { Button, Card, CardHeader, CardTitle, EmptyState, Modal } from '@medical-crm/ui';
import { Calendar, Edit3, Plus, Trash2 } from 'lucide-react';
import { useCaseJourney, useCaseMilestones } from '@/queries/use-journey';
import { addMilestone, deleteMilestone, updateJourney, updateMilestone } from '@/actions/journey-actions';

interface JourneyData {
  visa?: unknown | null;
  insurance?: unknown | null;
  accommodation?: unknown | null;
  transportation?: unknown | null;
  postCare?: unknown | null;
}

interface JourneyMilestone {
  id: string;
  eventType: string;
  eventDate: string;
  note?: string | null;
  isVisibleToPatient: boolean;
}

interface CaseJourneyTabProps {
  caseId: string;
}

const MILESTONE_EVENT_TYPES = [
  'FLIGHT_ARRIVAL',
  'FLIGHT_DEPARTURE',
  'HOTEL_CHECKIN',
  'HOTEL_CHECKOUT',
  'HOSPITAL_APPOINTMENT',
  'PRE_OP_EXAM',
  'SURGERY_DATE',
  'POST_OP_CHECKUP',
  'MEDICATION_SCHEDULE',
  'FOLLOW_UP_REMOTE',
  'VISA_APPLICATION',
  'VISA_APPROVED',
  'INSURANCE_CONFIRMED',
  'CUSTOM',
];

function toMilestones(raw: unknown): JourneyMilestone[] {
  if (Array.isArray(raw)) return raw as JourneyMilestone[];
  if (raw && typeof raw === 'object' && Array.isArray((raw as { data?: JourneyMilestone[] }).data)) {
    return (raw as { data?: JourneyMilestone[] }).data ?? [];
  }
  return [];
}

function formatDate(value: string): string {
  return new Date(value).toLocaleString();
}

function toJson(value: unknown): string {
  if (value == null) return '';
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return '';
  }
}

function parseJsonInput(value: string, fieldLabel: string): unknown {
  const trimmed = value.trim();
  if (!trimmed) return null;
  try {
    return JSON.parse(trimmed);
  } catch {
    throw new Error(`${fieldLabel} must be valid JSON`);
  }
}

function JsonBlock({ title, value }: { title: string; value: unknown }) {
  const pretty = toJson(value);
  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
      </CardHeader>
      {pretty ? (
        <pre className="overflow-x-auto rounded-lg bg-slate-50 p-3 text-xs text-slate-700">{pretty}</pre>
      ) : (
        <p className="text-sm text-slate-400">No data</p>
      )}
    </Card>
  );
}

function MilestoneRow({
  caseId,
  milestone,
  onUpdated,
}: {
  caseId: string;
  milestone: JourneyMilestone;
  onUpdated: () => Promise<unknown>;
}) {
  const [isPending, startTransition] = useTransition();

  function handleDelete() {
    if (!window.confirm('Delete this milestone?')) return;
    startTransition(async () => {
      await deleteMilestone(caseId, milestone.id);
      await onUpdated();
    });
  }

  function handleEditNote() {
    const nextNote = window.prompt('Update note', milestone.note ?? '');
    if (nextNote == null) return;
    startTransition(async () => {
      await updateMilestone(caseId, milestone.id, { note: nextNote || null });
      await onUpdated();
    });
  }

  function handleToggleVisibility() {
    startTransition(async () => {
      await updateMilestone(caseId, milestone.id, { isVisibleToPatient: !milestone.isVisibleToPatient });
      await onUpdated();
    });
  }

  return (
    <div className="rounded-lg border border-slate-200 p-3">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-slate-800">{milestone.eventType.replace(/_/g, ' ')}</p>
          <p className="text-xs text-slate-500">{formatDate(milestone.eventDate)}</p>
          {milestone.note && (
            <p className="mt-1 text-sm text-slate-600">{milestone.note}</p>
          )}
          <p className="mt-1 text-xs text-slate-500">
            {milestone.isVisibleToPatient ? 'Visible to patient' : 'Internal only'}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={handleEditNote} disabled={isPending}>
            <Edit3 size={13} className="mr-1" />
            Edit Note
          </Button>
          <Button variant="outline" size="sm" onClick={handleToggleVisibility} disabled={isPending}>
            {milestone.isVisibleToPatient ? 'Hide' : 'Show'}
          </Button>
          <Button variant="outline" size="sm" onClick={handleDelete} disabled={isPending}>
            <Trash2 size={13} className="mr-1" />
            Delete
          </Button>
        </div>
      </div>
    </div>
  );
}

export function CaseJourneyTab({ caseId }: CaseJourneyTabProps) {
  const { data: rawJourney, isLoading: journeyLoading } = useCaseJourney(caseId);
  const { data: rawMilestones, isLoading: milestonesLoading, refetch } = useCaseMilestones(caseId);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [editJourneyOpen, setEditJourneyOpen] = useState(false);
  const [addMilestoneOpen, setAddMilestoneOpen] = useState(false);

  const journey = (rawJourney as JourneyData | null) ?? null;
  const milestones = useMemo(() => toMilestones(rawMilestones), [rawMilestones]);

  const [visaJson, setVisaJson] = useState('');
  const [insuranceJson, setInsuranceJson] = useState('');
  const [accommodationJson, setAccommodationJson] = useState('');
  const [transportationJson, setTransportationJson] = useState('');
  const [postCareJson, setPostCareJson] = useState('');

  const [eventType, setEventType] = useState(MILESTONE_EVENT_TYPES[0] ?? 'CUSTOM');
  const [eventDate, setEventDate] = useState('');
  const [note, setNote] = useState('');
  const [visibleToPatient, setVisibleToPatient] = useState(true);

  const isLoading = journeyLoading || milestonesLoading;

  function openJourneyEditor() {
    setError(null);
    setVisaJson(toJson(journey?.visa));
    setInsuranceJson(toJson(journey?.insurance));
    setAccommodationJson(toJson(journey?.accommodation));
    setTransportationJson(toJson(journey?.transportation));
    setPostCareJson(toJson(journey?.postCare));
    setEditJourneyOpen(true);
  }

  function handleSaveJourney() {
    setError(null);
    startTransition(async () => {
      try {
        await updateJourney(caseId, {
          visa: parseJsonInput(visaJson, 'Visa'),
          insurance: parseJsonInput(insuranceJson, 'Insurance'),
          accommodation: parseJsonInput(accommodationJson, 'Accommodation'),
          transportation: parseJsonInput(transportationJson, 'Transportation'),
          postCare: parseJsonInput(postCareJson, 'Post care'),
        });
        await refetch();
        setEditJourneyOpen(false);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to update journey');
      }
    });
  }

  function handleAddMilestone() {
    if (!eventDate) {
      setError('Milestone date is required');
      return;
    }
    setError(null);
    startTransition(async () => {
      try {
        await addMilestone(caseId, {
          eventType,
          eventDate: new Date(eventDate).toISOString(),
          note: note.trim() || undefined,
          isVisibleToPatient: visibleToPatient,
        });
        await refetch();
        setAddMilestoneOpen(false);
        setEventDate('');
        setNote('');
        setVisibleToPatient(true);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to add milestone');
      }
    });
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-indigo-600 border-t-transparent" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-end">
        <Button variant="outline" size="sm" onClick={openJourneyEditor}>
          <Edit3 size={14} className="mr-1" />
          Edit Journey
        </Button>
      </div>

      {error && (
        <div className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
          {error}
        </div>
      )}

      <JsonBlock title="Visa" value={journey?.visa} />
      <JsonBlock title="Insurance" value={journey?.insurance} />
      <JsonBlock title="Accommodation" value={journey?.accommodation} />
      <JsonBlock title="Transportation" value={journey?.transportation} />
      <JsonBlock title="Post Care" value={journey?.postCare} />

      <Card>
        <CardHeader>
          <CardTitle>Milestones ({milestones.length})</CardTitle>
          <Button variant="outline" size="sm" onClick={() => setAddMilestoneOpen(true)}>
            <Plus size={14} className="mr-1" />
            Add Milestone
          </Button>
        </CardHeader>
        {milestones.length === 0 ? (
          <EmptyState
            icon={<Calendar size={36} />}
            title="No milestones yet"
            description="Journey milestones will appear here as they are created."
          />
        ) : (
          <div className="space-y-3">
            {milestones.map((m) => (
              <MilestoneRow key={m.id} caseId={caseId} milestone={m} onUpdated={refetch} />
            ))}
          </div>
        )}
      </Card>

      <Modal
        open={editJourneyOpen}
        onClose={() => setEditJourneyOpen(false)}
        title="Edit Journey (JSON)"
        maxWidth="max-w-3xl"
      >
        <div className="space-y-3">
          <div>
            <p className="mb-1 text-xs font-semibold uppercase text-slate-500">Visa</p>
            <textarea value={visaJson} onChange={(event) => setVisaJson(event.target.value)} rows={4} className="w-full rounded-lg border border-slate-200 p-2 font-mono text-xs" />
          </div>
          <div>
            <p className="mb-1 text-xs font-semibold uppercase text-slate-500">Insurance</p>
            <textarea value={insuranceJson} onChange={(event) => setInsuranceJson(event.target.value)} rows={4} className="w-full rounded-lg border border-slate-200 p-2 font-mono text-xs" />
          </div>
          <div>
            <p className="mb-1 text-xs font-semibold uppercase text-slate-500">Accommodation</p>
            <textarea value={accommodationJson} onChange={(event) => setAccommodationJson(event.target.value)} rows={4} className="w-full rounded-lg border border-slate-200 p-2 font-mono text-xs" />
          </div>
          <div>
            <p className="mb-1 text-xs font-semibold uppercase text-slate-500">Transportation</p>
            <textarea value={transportationJson} onChange={(event) => setTransportationJson(event.target.value)} rows={4} className="w-full rounded-lg border border-slate-200 p-2 font-mono text-xs" />
          </div>
          <div>
            <p className="mb-1 text-xs font-semibold uppercase text-slate-500">Post Care</p>
            <textarea value={postCareJson} onChange={(event) => setPostCareJson(event.target.value)} rows={4} className="w-full rounded-lg border border-slate-200 p-2 font-mono text-xs" />
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="outline" size="sm" onClick={() => setEditJourneyOpen(false)} disabled={isPending}>
              Cancel
            </Button>
            <Button variant="default" size="sm" onClick={handleSaveJourney} disabled={isPending}>
              {isPending ? 'Saving...' : 'Save'}
            </Button>
          </div>
        </div>
      </Modal>

      <Modal
        open={addMilestoneOpen}
        onClose={() => setAddMilestoneOpen(false)}
        title="Add Milestone"
        maxWidth="max-w-xl"
      >
        <div className="space-y-3">
          <div>
            <p className="mb-1 text-xs font-semibold uppercase text-slate-500">Event Type</p>
            <select
              value={eventType}
              onChange={(event) => setEventType(event.target.value)}
              className="w-full rounded-lg border border-slate-200 p-2 text-sm"
            >
              {MILESTONE_EVENT_TYPES.map((type) => (
                <option key={type} value={type}>
                  {type.replace(/_/g, ' ')}
                </option>
              ))}
            </select>
          </div>
          <div>
            <p className="mb-1 text-xs font-semibold uppercase text-slate-500">Event Date</p>
            <input
              type="datetime-local"
              value={eventDate}
              onChange={(event) => setEventDate(event.target.value)}
              className="w-full rounded-lg border border-slate-200 p-2 text-sm"
            />
          </div>
          <div>
            <p className="mb-1 text-xs font-semibold uppercase text-slate-500">Note</p>
            <textarea
              value={note}
              onChange={(event) => setNote(event.target.value)}
              rows={3}
              className="w-full rounded-lg border border-slate-200 p-2 text-sm"
            />
          </div>
          <label className="flex items-center gap-2 text-sm text-slate-700">
            <input
              type="checkbox"
              checked={visibleToPatient}
              onChange={(event) => setVisibleToPatient(event.target.checked)}
            />
            Visible to patient
          </label>
          <div className="flex justify-end gap-2">
            <Button variant="outline" size="sm" onClick={() => setAddMilestoneOpen(false)} disabled={isPending}>
              Cancel
            </Button>
            <Button variant="default" size="sm" onClick={handleAddMilestone} disabled={isPending}>
              {isPending ? 'Adding...' : 'Add'}
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
