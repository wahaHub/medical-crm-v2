'use client';

import { useMemo, useState, useTransition } from 'react';
import { Button, Card, CardHeader, CardTitle, EmptyState, Modal } from '@medical-crm/ui';
import { Calendar, Edit3, Plus, Trash2 } from 'lucide-react';
import { useCaseJourney, useCaseMilestones } from '@/queries/use-journey';
import { updateJourney } from '@/actions/journey-actions';

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

interface JourneyNote {
  id: string;
  text: string;
  createdAt: string;
}

interface AccommodationSegment {
  id: string;
  status: string;
  hotel: string;
  checkIn: string;
  checkOut: string;
  isBooked: boolean;
}

interface VisaFormState {
  status: string;
  visaType: string;
  existingNotes: JourneyNote[];
  newNote: string;
}

interface InsuranceFormState {
  status: string;
  provider: string;
  planName: string;
  policyNo: string;
  existingNotes: JourneyNote[];
  newNote: string;
}

interface AccommodationFormState {
  segments: AccommodationSegment[];
  existingNotes: JourneyNote[];
  newNote: string;
}

interface TransportationFormState {
  arrivalFlightNo: string;
  arrivalAirport: string;
  arrivalAt: string;
  departureFlightNo: string;
  departureAirport: string;
  departureAt: string;
  airportPickup: boolean;
  pickupLanguage: string;
  pickupContact: string;
  wheelchairAssistance: boolean;
  localShuttle: boolean;
  companionCount: string;
}

interface PostCareFormState {
  existingNotes: JourneyNote[];
  newNote: string;
}

const VISA_STATUS_OPTIONS = ['NOT_STARTED', 'SUBMITTED', 'IN_REVIEW', 'APPROVED', 'REJECTED', 'EXPIRED'];
const VISA_TYPE_OPTIONS = ['M-VISA', 'L-VISA', 'F-VISA', 'S-VISA', 'Q-VISA', 'OTHER'];

const INSURANCE_STATUS_OPTIONS = ['NOT_STARTED', 'PENDING', 'ACTIVE', 'EXPIRED', 'REJECTED'];

const ACCOMMODATION_STATUS_OPTIONS = ['NOT_BOOKED', 'TENTATIVE', 'BOOKED', 'CHECKED_IN', 'CHECKED_OUT', 'CANCELLED'];
const PICKUP_LANGUAGE_OPTIONS = ['Chinese', 'English', 'Japanese', 'Korean', 'Arabic', 'Russian', 'Other'];

const DEFAULT_VISA_FORM: VisaFormState = {
  status: '',
  visaType: '',
  existingNotes: [],
  newNote: '',
};

const DEFAULT_INSURANCE_FORM: InsuranceFormState = {
  status: '',
  provider: '',
  planName: '',
  policyNo: '',
  existingNotes: [],
  newNote: '',
};

const DEFAULT_TRANSPORTATION_FORM: TransportationFormState = {
  arrivalFlightNo: '',
  arrivalAirport: '',
  arrivalAt: '',
  departureFlightNo: '',
  departureAirport: '',
  departureAt: '',
  airportPickup: false,
  pickupLanguage: '',
  pickupContact: '',
  wheelchairAssistance: false,
  localShuttle: false,
  companionCount: '',
};

const DEFAULT_POSTCARE_FORM: PostCareFormState = {
  existingNotes: [],
  newNote: '',
};

function toMilestones(raw: unknown): JourneyMilestone[] {
  const list = Array.isArray(raw)
    ? raw
    : (raw && typeof raw === 'object' && Array.isArray((raw as { data?: JourneyMilestone[] }).data)
      ? ((raw as { data?: JourneyMilestone[] }).data ?? [])
      : []);

  return list
    .filter((item): item is JourneyMilestone => Boolean(item?.id && item?.eventType && item?.eventDate))
    .sort((a, b) => new Date(b.eventDate).getTime() - new Date(a.eventDate).getTime());
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}

function asString(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

function asBoolean(value: unknown): boolean {
  return value === true;
}

function toDateTimeInputValue(value: unknown): string {
  if (typeof value !== 'string' || !value) return '';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return '';
  const offsetMs = parsed.getTimezoneOffset() * 60000;
  return new Date(parsed.getTime() - offsetMs).toISOString().slice(0, 16);
}

function toIsoOrNull(value: string): string | null {
  if (!value.trim()) return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
}

function newId(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function createEmptySegment(): AccommodationSegment {
  return {
    id: newId('segment'),
    status: '',
    hotel: '',
    checkIn: '',
    checkOut: '',
    isBooked: false,
  };
}

function normalizeNotes(raw: unknown): JourneyNote[] {
  if (raw == null) return [];
  if (typeof raw === 'string') {
    const text = raw.trim();
    if (!text) return [];
    return [{ id: newId('note'), text, createdAt: new Date().toISOString() }];
  }
  if (!Array.isArray(raw)) return [];

  return raw
    .map((item) => {
      if (typeof item === 'string') {
        const text = item.trim();
        if (!text) return null;
        return { id: newId('note'), text, createdAt: new Date().toISOString() };
      }
      if (!isRecord(item)) return null;
      const text = asString(item.text ?? item.note ?? item.content).trim();
      if (!text) return null;
      const createdAtRaw = asString(item.createdAt ?? item.at ?? item.timestamp);
      const createdAt = createdAtRaw ? new Date(createdAtRaw).toISOString() : new Date().toISOString();
      return { id: asString(item.id) || newId('note'), text, createdAt };
    })
    .filter((item): item is JourneyNote => Boolean(item))
    .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
}

function appendNote(existing: JourneyNote[], newNoteText: string): JourneyNote[] {
  const text = newNoteText.trim();
  if (!text) return existing;
  return [...existing, { id: newId('note'), text, createdAt: new Date().toISOString() }];
}

function parseAccommodationSegments(raw: unknown): AccommodationSegment[] {
  if (!isRecord(raw)) return [];

  const segmentsRaw = Array.isArray(raw.segments) ? raw.segments : null;
  if (segmentsRaw && segmentsRaw.length > 0) {
    return segmentsRaw
      .map((segment) => {
        if (!isRecord(segment)) return null;
        return {
          id: asString(segment.id) || newId('segment'),
          status: asString(segment.status),
          hotel: asString(segment.hotel),
          checkIn: toDateTimeInputValue(segment.checkIn),
          checkOut: toDateTimeInputValue(segment.checkOut),
          isBooked: asBoolean(segment.isBooked ?? segment.booked ?? segment.bookingConfirmed),
        };
      })
      .filter((segment): segment is AccommodationSegment => Boolean(segment));
  }

  // Backward compatibility with older single-segment shape.
  if (
    raw.status ||
    raw.hotel ||
    raw.checkIn ||
    raw.checkOut ||
    raw.isBooked !== undefined ||
    raw.booked !== undefined
  ) {
    return [
      {
        id: newId('segment'),
        status: asString(raw.status),
        hotel: asString(raw.hotel),
        checkIn: toDateTimeInputValue(raw.checkIn),
        checkOut: toDateTimeInputValue(raw.checkOut),
        isBooked: asBoolean(raw.isBooked ?? raw.booked),
      },
    ];
  }

  return [];
}

function formatDateTime(value: string): string {
  if (!value) return '—';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString();
}

function compactRecord(data: Record<string, unknown>): Record<string, unknown> | null {
  const entries = Object.entries(data).filter(([, value]) => {
    if (value === null || value === undefined || value === '') return false;
    if (Array.isArray(value)) return value.length > 0;
    return true;
  });
  return entries.length > 0 ? Object.fromEntries(entries) : null;
}

function NotesList({ notes }: { notes: JourneyNote[] }) {
  if (notes.length === 0) {
    return <p className="text-sm text-slate-400">No notes</p>;
  }
  return (
    <div className="space-y-2">
      {notes.map((note) => (
        <div key={note.id} className="rounded-lg border border-slate-100 bg-slate-50 px-3 py-2">
          <p className="text-sm text-slate-700">{note.text}</p>
          <p className="mt-1 text-xs text-slate-500">{formatDateTime(note.createdAt)}</p>
        </div>
      ))}
    </div>
  );
}

type JourneyFieldType = 'text' | 'date' | 'boolean';
interface JourneyField {
  key: string;
  label: string;
  type?: JourneyFieldType;
}

function formatJourneyValue(value: unknown, type: JourneyFieldType = 'text'): string {
  if (value == null) return '—';
  if (type === 'boolean') return value === true ? 'Yes' : 'No';
  if (type === 'date') return formatDateTime(String(value));
  if (Array.isArray(value)) return value.map((item) => String(item)).join(', ');
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
}

function JourneySectionCard({
  title,
  value,
  fields,
}: {
  title: string;
  value: unknown;
  fields: JourneyField[];
}) {
  const data = isRecord(value) ? value : null;
  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
      </CardHeader>
      {data ? (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {fields.map((field) => (
            <div key={field.key} className="rounded-lg border border-slate-100 bg-slate-50 p-3">
              <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
                {field.label}
              </p>
              <p className="mt-1 text-sm text-slate-700">
                {formatJourneyValue(data[field.key], field.type)}
              </p>
            </div>
          ))}
        </div>
      ) : (
        <p className="text-sm text-slate-400">No data</p>
      )}
    </Card>
  );
}

function MilestoneRow({ milestone }: { milestone: JourneyMilestone }) {
  return (
    <div className="rounded-lg border border-slate-200 p-3">
      <p className="text-sm font-semibold text-slate-800">{milestone.eventType.replace(/_/g, ' ')}</p>
      <p className="text-xs text-slate-500">{formatDateTime(milestone.eventDate)}</p>
      {milestone.note && <p className="mt-1 text-sm text-slate-600">{milestone.note}</p>}
      <p className="mt-1 text-xs text-slate-500">
        {milestone.isVisibleToPatient ? 'Visible to patient' : 'Internal only'}
      </p>
    </div>
  );
}

export function CaseJourneyTab({ caseId }: CaseJourneyTabProps) {
  const { data: rawJourney, isLoading: journeyLoading } = useCaseJourney(caseId);
  const { data: rawMilestones, isLoading: milestonesLoading, refetch } = useCaseMilestones(caseId);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [editJourneyOpen, setEditJourneyOpen] = useState(false);

  const journey = (rawJourney as JourneyData | null) ?? null;
  const milestones = useMemo(() => toMilestones(rawMilestones), [rawMilestones]);
  const isLoading = journeyLoading || milestonesLoading;

  const [visaForm, setVisaForm] = useState<VisaFormState>(DEFAULT_VISA_FORM);
  const [insuranceForm, setInsuranceForm] = useState<InsuranceFormState>(DEFAULT_INSURANCE_FORM);
  const [accommodationForm, setAccommodationForm] = useState<AccommodationFormState>({
    segments: [createEmptySegment()],
    existingNotes: [],
    newNote: '',
  });
  const [transportationForm, setTransportationForm] = useState<TransportationFormState>(DEFAULT_TRANSPORTATION_FORM);
  const [postCareForm, setPostCareForm] = useState<PostCareFormState>(DEFAULT_POSTCARE_FORM);

  const visaData = isRecord(journey?.visa) ? journey?.visa : null;
  const insuranceData = isRecord(journey?.insurance) ? journey?.insurance : null;
  const accommodationData = isRecord(journey?.accommodation) ? journey?.accommodation : null;
  const transportationData = isRecord(journey?.transportation) ? journey?.transportation : null;
  const postCareData = isRecord(journey?.postCare) ? journey?.postCare : null;

  function openJourneyEditor() {
    setError(null);
    const visa = isRecord(journey?.visa) ? journey.visa : {};
    const insurance = isRecord(journey?.insurance) ? journey.insurance : {};
    const accommodation = isRecord(journey?.accommodation) ? journey.accommodation : {};
    const transportation = isRecord(journey?.transportation) ? journey.transportation : {};
    const postCare = isRecord(journey?.postCare) ? journey.postCare : {};

    setVisaForm({
      status: asString(visa.status),
      visaType: asString(visa.visaType),
      existingNotes: normalizeNotes(visa.notes),
      newNote: '',
    });

    setInsuranceForm({
      status: asString(insurance.status),
      provider: asString(insurance.provider),
      planName: asString(insurance.planName),
      policyNo: asString(insurance.policyNo),
      existingNotes: normalizeNotes(insurance.notes),
      newNote: '',
    });

    const segments = parseAccommodationSegments(accommodation);
    setAccommodationForm({
      segments: segments.length > 0 ? segments : [createEmptySegment()],
      existingNotes: normalizeNotes(accommodation.notes),
      newNote: '',
    });

    setTransportationForm({
      arrivalFlightNo: asString(transportation.arrivalFlightNo),
      arrivalAirport: asString(transportation.arrivalAirport),
      arrivalAt: toDateTimeInputValue(transportation.arrivalAt),
      departureFlightNo: asString(transportation.departureFlightNo),
      departureAirport: asString(transportation.departureAirport),
      departureAt: toDateTimeInputValue(transportation.departureAt),
      airportPickup: asBoolean(transportation.airportPickup),
      pickupLanguage: asString(transportation.pickupLanguage),
      pickupContact: asString(transportation.pickupContact),
      wheelchairAssistance: asBoolean(transportation.wheelchairAssistance),
      localShuttle: asBoolean(transportation.localShuttle),
      companionCount: asString(transportation.companionCount),
    });

    setPostCareForm({
      existingNotes: normalizeNotes(postCare.notes),
      newNote: '',
    });

    setEditJourneyOpen(true);
  }

  function updateSegment(segmentId: string, patch: Partial<AccommodationSegment>) {
    setAccommodationForm((prev) => ({
      ...prev,
      segments: prev.segments.map((segment) => (
        segment.id === segmentId ? { ...segment, ...patch } : segment
      )),
    }));
  }

  function removeSegment(segmentId: string) {
    setAccommodationForm((prev) => {
      const next = prev.segments.filter((segment) => segment.id !== segmentId);
      return {
        ...prev,
        segments: next.length > 0 ? next : [createEmptySegment()],
      };
    });
  }

  function addSegment() {
    setAccommodationForm((prev) => ({
      ...prev,
      segments: [...prev.segments, createEmptySegment()],
    }));
  }

  function handleSaveJourney() {
    setError(null);
    startTransition(async () => {
      try {
        const visaNotes = appendNote(visaForm.existingNotes, visaForm.newNote);
        const insuranceNotes = appendNote(insuranceForm.existingNotes, insuranceForm.newNote);
        const accommodationNotes = appendNote(accommodationForm.existingNotes, accommodationForm.newNote);
        const postCareNotes = appendNote(postCareForm.existingNotes, postCareForm.newNote);

        const accommodationSegments = accommodationForm.segments
          .map((segment) => ({
            id: segment.id,
            status: segment.status || null,
            hotel: segment.hotel.trim() || null,
            checkIn: toIsoOrNull(segment.checkIn),
            checkOut: toIsoOrNull(segment.checkOut),
            isBooked: segment.isBooked,
          }))
          .filter((segment) => (
            Boolean(segment.status || segment.hotel || segment.checkIn || segment.checkOut || segment.isBooked)
          ));

        const visa = compactRecord({
          status: visaForm.status || null,
          visaType: visaForm.visaType || null,
          notes: visaNotes,
        });
        const insurance = compactRecord({
          status: insuranceForm.status || null,
          provider: insuranceForm.provider.trim() || null,
          planName: insuranceForm.planName.trim() || null,
          policyNo: insuranceForm.policyNo.trim() || null,
          notes: insuranceNotes,
        });
        const accommodation = compactRecord({
          segments: accommodationSegments,
          notes: accommodationNotes,
        });
        const transportation = compactRecord({
          arrivalFlightNo: transportationForm.arrivalFlightNo.trim() || null,
          arrivalAirport: transportationForm.arrivalAirport.trim() || null,
          arrivalAt: toIsoOrNull(transportationForm.arrivalAt),
          departureFlightNo: transportationForm.departureFlightNo.trim() || null,
          departureAirport: transportationForm.departureAirport.trim() || null,
          departureAt: toIsoOrNull(transportationForm.departureAt),
          airportPickup: transportationForm.airportPickup,
          pickupLanguage: transportationForm.pickupLanguage || null,
          pickupContact: transportationForm.pickupContact.trim() || null,
          wheelchairAssistance: transportationForm.wheelchairAssistance,
          localShuttle: transportationForm.localShuttle,
          companionCount: transportationForm.companionCount.trim() || null,
        });
        const postCare = compactRecord({
          notes: postCareNotes,
        });

        await updateJourney(caseId, {
          visa,
          insurance,
          accommodation,
          transportation,
          postCare,
        });
        await refetch();
        setEditJourneyOpen(false);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to update journey');
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
      <div className="flex justify-between gap-3">
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

      <Card>
        <CardHeader>
          <CardTitle>Visa</CardTitle>
        </CardHeader>
        {visaData ? (
          <div className="space-y-3">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="rounded-lg border border-slate-100 bg-slate-50 p-3">
                <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Status</p>
                <p className="mt-1 text-sm text-slate-700">{asString(visaData.status) || '—'}</p>
              </div>
              <div className="rounded-lg border border-slate-100 bg-slate-50 p-3">
                <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Type</p>
                <p className="mt-1 text-sm text-slate-700">{asString(visaData.visaType) || '—'}</p>
              </div>
            </div>
            <div>
              <p className="mb-2 text-xs font-medium uppercase tracking-wide text-slate-500">Notes</p>
              <NotesList notes={normalizeNotes(visaData.notes)} />
            </div>
          </div>
        ) : (
          <p className="text-sm text-slate-400">No data</p>
        )}
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Insurance</CardTitle>
        </CardHeader>
        {insuranceData ? (
          <div className="space-y-3">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="rounded-lg border border-slate-100 bg-slate-50 p-3">
                <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Status</p>
                <p className="mt-1 text-sm text-slate-700">{asString(insuranceData.status) || '—'}</p>
              </div>
              <div className="rounded-lg border border-slate-100 bg-slate-50 p-3">
                <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Provider</p>
                <p className="mt-1 text-sm text-slate-700">{asString(insuranceData.provider) || '—'}</p>
              </div>
              <div className="rounded-lg border border-slate-100 bg-slate-50 p-3">
                <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Plan Name</p>
                <p className="mt-1 text-sm text-slate-700">{asString(insuranceData.planName) || '—'}</p>
              </div>
              <div className="rounded-lg border border-slate-100 bg-slate-50 p-3">
                <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Policy Number</p>
                <p className="mt-1 text-sm text-slate-700">{asString(insuranceData.policyNo) || '—'}</p>
              </div>
            </div>
            <div>
              <p className="mb-2 text-xs font-medium uppercase tracking-wide text-slate-500">Notes</p>
              <NotesList notes={normalizeNotes(insuranceData.notes)} />
            </div>
          </div>
        ) : (
          <p className="text-sm text-slate-400">No data</p>
        )}
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Accommodation</CardTitle>
        </CardHeader>
        {accommodationData ? (
          <div className="space-y-3">
            {parseAccommodationSegments(accommodationData).length === 0 ? (
              <p className="text-sm text-slate-400">No segments</p>
            ) : (
              <div className="space-y-2">
                {parseAccommodationSegments(accommodationData).map((segment) => (
                  <div key={segment.id} className="rounded-lg border border-slate-100 bg-slate-50 p-3">
                    <div className="grid grid-cols-1 gap-2 sm:grid-cols-5">
                      <div>
                        <p className="text-[11px] uppercase text-slate-500">Status</p>
                        <p className="text-sm text-slate-700">{segment.status || '—'}</p>
                      </div>
                      <div>
                        <p className="text-[11px] uppercase text-slate-500">Hotel</p>
                        <p className="text-sm text-slate-700">{segment.hotel || '—'}</p>
                      </div>
                      <div>
                        <p className="text-[11px] uppercase text-slate-500">Check-in</p>
                        <p className="text-sm text-slate-700">{segment.checkIn ? formatDateTime(toIsoOrNull(segment.checkIn) ?? segment.checkIn) : '—'}</p>
                      </div>
                      <div>
                        <p className="text-[11px] uppercase text-slate-500">Check-out</p>
                        <p className="text-sm text-slate-700">{segment.checkOut ? formatDateTime(toIsoOrNull(segment.checkOut) ?? segment.checkOut) : '—'}</p>
                      </div>
                      <div>
                        <p className="text-[11px] uppercase text-slate-500">Booked</p>
                        <p className="text-sm text-slate-700">{segment.isBooked ? 'Yes' : 'No'}</p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
            <div>
              <p className="mb-2 text-xs font-medium uppercase tracking-wide text-slate-500">Notes</p>
              <NotesList notes={normalizeNotes(accommodationData.notes)} />
            </div>
          </div>
        ) : (
          <p className="text-sm text-slate-400">No data</p>
        )}
      </Card>

      <JourneySectionCard
        title="Transportation"
        value={transportationData}
        fields={[
          { key: 'arrivalFlightNo', label: 'Arrival Flight' },
          { key: 'arrivalAirport', label: 'Arrival Airport' },
          { key: 'arrivalAt', label: 'Arrival Time', type: 'date' },
          { key: 'departureFlightNo', label: 'Departure Flight' },
          { key: 'departureAirport', label: 'Departure Airport' },
          { key: 'departureAt', label: 'Departure Time', type: 'date' },
          { key: 'airportPickup', label: 'Airport Pickup', type: 'boolean' },
          { key: 'pickupLanguage', label: 'Pickup Language' },
          { key: 'pickupContact', label: 'Pickup Contact' },
          { key: 'wheelchairAssistance', label: 'Wheelchair Assistance', type: 'boolean' },
          { key: 'localShuttle', label: 'Local Shuttle', type: 'boolean' },
          { key: 'companionCount', label: 'Companion Count' },
        ]}
      />

      <Card>
        <CardHeader>
          <CardTitle>Post Care</CardTitle>
        </CardHeader>
        {postCareData ? (
          <NotesList notes={normalizeNotes(postCareData.notes)} />
        ) : (
          <p className="text-sm text-slate-400">No notes</p>
        )}
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Journey Events ({milestones.length})</CardTitle>
        </CardHeader>
        {milestones.length === 0 ? (
          <EmptyState
            icon={<Calendar size={36} />}
            title="No journey events yet"
            description="Append events like visa, insurance, surgery, and follow-up milestones."
          />
        ) : (
          <div className="space-y-3">
            {milestones.map((m) => (
              <MilestoneRow key={m.id} milestone={m} />
            ))}
          </div>
        )}
      </Card>

      <Modal
        open={editJourneyOpen}
        onClose={() => setEditJourneyOpen(false)}
        title="Edit Journey"
        maxWidth="max-w-4xl"
      >
        <div className="max-h-[70vh] space-y-5 overflow-y-auto pr-1">
          <div className="rounded-lg border border-slate-200 p-3">
            <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-slate-500">Visa</p>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div>
                <p className="mb-1 text-xs font-semibold uppercase text-slate-500">Status</p>
                <select
                  value={visaForm.status}
                  onChange={(e) => setVisaForm((prev) => ({ ...prev, status: e.target.value }))}
                  className="w-full rounded-lg border border-slate-200 p-2 text-sm"
                >
                  <option value="">Select status</option>
                  {VISA_STATUS_OPTIONS.map((option) => (
                    <option key={option} value={option}>{option}</option>
                  ))}
                </select>
              </div>
              <div>
                <p className="mb-1 text-xs font-semibold uppercase text-slate-500">Type</p>
                <select
                  value={visaForm.visaType}
                  onChange={(e) => setVisaForm((prev) => ({ ...prev, visaType: e.target.value }))}
                  className="w-full rounded-lg border border-slate-200 p-2 text-sm"
                >
                  <option value="">Select type</option>
                  {VISA_TYPE_OPTIONS.map((option) => (
                    <option key={option} value={option}>{option}</option>
                  ))}
                </select>
              </div>
            </div>
            <div className="mt-3">
              <p className="mb-1 text-xs font-semibold uppercase text-slate-500">Existing Notes</p>
              <NotesList notes={visaForm.existingNotes} />
            </div>
            <div className="mt-3">
              <p className="mb-1 text-xs font-semibold uppercase text-slate-500">Append Note</p>
              <textarea
                value={visaForm.newNote}
                onChange={(e) => setVisaForm((prev) => ({ ...prev, newNote: e.target.value }))}
                rows={2}
                className="w-full rounded-lg border border-slate-200 p-2 text-sm"
                placeholder="Add an additional note (will append, not overwrite)"
              />
            </div>
          </div>

          <div className="rounded-lg border border-slate-200 p-3">
            <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-slate-500">Insurance</p>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div>
                <p className="mb-1 text-xs font-semibold uppercase text-slate-500">Status</p>
                <select
                  value={insuranceForm.status}
                  onChange={(e) => setInsuranceForm((prev) => ({ ...prev, status: e.target.value }))}
                  className="w-full rounded-lg border border-slate-200 p-2 text-sm"
                >
                  <option value="">Select status</option>
                  {INSURANCE_STATUS_OPTIONS.map((option) => (
                    <option key={option} value={option}>{option}</option>
                  ))}
                </select>
              </div>
              <div>
                <p className="mb-1 text-xs font-semibold uppercase text-slate-500">Provider</p>
                <input
                  value={insuranceForm.provider}
                  onChange={(e) => setInsuranceForm((prev) => ({ ...prev, provider: e.target.value }))}
                  className="w-full rounded-lg border border-slate-200 p-2 text-sm"
                />
              </div>
              <div>
                <p className="mb-1 text-xs font-semibold uppercase text-slate-500">Plan Name</p>
                <input
                  value={insuranceForm.planName}
                  onChange={(e) => setInsuranceForm((prev) => ({ ...prev, planName: e.target.value }))}
                  className="w-full rounded-lg border border-slate-200 p-2 text-sm"
                />
              </div>
              <div>
                <p className="mb-1 text-xs font-semibold uppercase text-slate-500">Policy Number</p>
                <input
                  value={insuranceForm.policyNo}
                  onChange={(e) => setInsuranceForm((prev) => ({ ...prev, policyNo: e.target.value }))}
                  className="w-full rounded-lg border border-slate-200 p-2 text-sm"
                />
              </div>
            </div>
            <div className="mt-3">
              <p className="mb-1 text-xs font-semibold uppercase text-slate-500">Existing Notes</p>
              <NotesList notes={insuranceForm.existingNotes} />
            </div>
            <div className="mt-3">
              <p className="mb-1 text-xs font-semibold uppercase text-slate-500">Append Note</p>
              <textarea
                value={insuranceForm.newNote}
                onChange={(e) => setInsuranceForm((prev) => ({ ...prev, newNote: e.target.value }))}
                rows={2}
                className="w-full rounded-lg border border-slate-200 p-2 text-sm"
              />
            </div>
          </div>

          <div className="rounded-lg border border-slate-200 p-3">
            <div className="flex items-center justify-between">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Accommodation Segments</p>
              <Button variant="outline" size="sm" onClick={addSegment}>
                <Plus size={13} className="mr-1" />
                Add Segment
              </Button>
            </div>

            <div className="mt-3 space-y-3">
              {accommodationForm.segments.map((segment, index) => (
                <div key={segment.id} className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                  <div className="mb-2 flex items-center justify-between">
                    <p className="text-xs font-semibold text-slate-600">Segment {index + 1}</p>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => removeSegment(segment.id)}
                    >
                      <Trash2 size={12} className="mr-1" />
                      Remove
                    </Button>
                  </div>
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-5">
                    <div>
                      <p className="mb-1 text-xs font-semibold uppercase text-slate-500">Status</p>
                      <select
                        value={segment.status}
                        onChange={(e) => updateSegment(segment.id, { status: e.target.value })}
                        className="w-full rounded-lg border border-slate-200 p-2 text-sm"
                      >
                        <option value="">Select status</option>
                        {ACCOMMODATION_STATUS_OPTIONS.map((option) => (
                          <option key={option} value={option}>{option}</option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <p className="mb-1 text-xs font-semibold uppercase text-slate-500">Hotel</p>
                      <input
                        value={segment.hotel}
                        onChange={(e) => updateSegment(segment.id, { hotel: e.target.value })}
                        className="w-full rounded-lg border border-slate-200 p-2 text-sm"
                      />
                    </div>
                    <div>
                      <p className="mb-1 text-xs font-semibold uppercase text-slate-500">Check-in</p>
                      <input
                        type="datetime-local"
                        value={segment.checkIn}
                        onChange={(e) => updateSegment(segment.id, { checkIn: e.target.value })}
                        className="w-full rounded-lg border border-slate-200 p-2 text-sm"
                      />
                    </div>
                    <div>
                      <p className="mb-1 text-xs font-semibold uppercase text-slate-500">Check-out</p>
                      <input
                        type="datetime-local"
                        value={segment.checkOut}
                        onChange={(e) => updateSegment(segment.id, { checkOut: e.target.value })}
                        className="w-full rounded-lg border border-slate-200 p-2 text-sm"
                      />
                    </div>
                    <div className="flex items-end">
                      <label className="flex items-center gap-2 text-sm text-slate-700">
                        <input
                          type="checkbox"
                          checked={segment.isBooked}
                          onChange={(e) => updateSegment(segment.id, { isBooked: e.target.checked })}
                        />
                        Booked
                      </label>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            <div className="mt-3">
              <p className="mb-1 text-xs font-semibold uppercase text-slate-500">Existing Notes</p>
              <NotesList notes={accommodationForm.existingNotes} />
            </div>
            <div className="mt-3">
              <p className="mb-1 text-xs font-semibold uppercase text-slate-500">Append Note</p>
              <textarea
                value={accommodationForm.newNote}
                onChange={(e) => setAccommodationForm((prev) => ({ ...prev, newNote: e.target.value }))}
                rows={2}
                className="w-full rounded-lg border border-slate-200 p-2 text-sm"
              />
            </div>
          </div>

          <div className="rounded-lg border border-slate-200 p-3">
            <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-slate-500">Transportation</p>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <div>
                <p className="mb-1 text-xs font-semibold uppercase text-slate-500">Arrival Flight</p>
                <input
                  value={transportationForm.arrivalFlightNo}
                  onChange={(e) => setTransportationForm((prev) => ({ ...prev, arrivalFlightNo: e.target.value }))}
                  className="w-full rounded-lg border border-slate-200 p-2 text-sm"
                />
              </div>
              <div>
                <p className="mb-1 text-xs font-semibold uppercase text-slate-500">Arrival Airport</p>
                <input
                  value={transportationForm.arrivalAirport}
                  onChange={(e) => setTransportationForm((prev) => ({ ...prev, arrivalAirport: e.target.value }))}
                  className="w-full rounded-lg border border-slate-200 p-2 text-sm"
                />
              </div>
              <div>
                <p className="mb-1 text-xs font-semibold uppercase text-slate-500">Arrival Time</p>
                <input
                  type="datetime-local"
                  value={transportationForm.arrivalAt}
                  onChange={(e) => setTransportationForm((prev) => ({ ...prev, arrivalAt: e.target.value }))}
                  className="w-full rounded-lg border border-slate-200 p-2 text-sm"
                />
              </div>
              <div>
                <p className="mb-1 text-xs font-semibold uppercase text-slate-500">Departure Flight</p>
                <input
                  value={transportationForm.departureFlightNo}
                  onChange={(e) => setTransportationForm((prev) => ({ ...prev, departureFlightNo: e.target.value }))}
                  className="w-full rounded-lg border border-slate-200 p-2 text-sm"
                />
              </div>
              <div>
                <p className="mb-1 text-xs font-semibold uppercase text-slate-500">Departure Airport</p>
                <input
                  value={transportationForm.departureAirport}
                  onChange={(e) => setTransportationForm((prev) => ({ ...prev, departureAirport: e.target.value }))}
                  className="w-full rounded-lg border border-slate-200 p-2 text-sm"
                />
              </div>
              <div>
                <p className="mb-1 text-xs font-semibold uppercase text-slate-500">Departure Time</p>
                <input
                  type="datetime-local"
                  value={transportationForm.departureAt}
                  onChange={(e) => setTransportationForm((prev) => ({ ...prev, departureAt: e.target.value }))}
                  className="w-full rounded-lg border border-slate-200 p-2 text-sm"
                />
              </div>
              <div>
                <p className="mb-1 text-xs font-semibold uppercase text-slate-500">Pickup Language</p>
                <select
                  value={transportationForm.pickupLanguage}
                  onChange={(e) => setTransportationForm((prev) => ({ ...prev, pickupLanguage: e.target.value }))}
                  className="w-full rounded-lg border border-slate-200 p-2 text-sm"
                >
                  <option value="">Select language</option>
                  {PICKUP_LANGUAGE_OPTIONS.map((option) => (
                    <option key={option} value={option}>{option}</option>
                  ))}
                </select>
              </div>
              <div>
                <p className="mb-1 text-xs font-semibold uppercase text-slate-500">Pickup Contact</p>
                <input
                  value={transportationForm.pickupContact}
                  onChange={(e) => setTransportationForm((prev) => ({ ...prev, pickupContact: e.target.value }))}
                  className="w-full rounded-lg border border-slate-200 p-2 text-sm"
                />
              </div>
              <div>
                <p className="mb-1 text-xs font-semibold uppercase text-slate-500">Companion Count</p>
                <input
                  value={transportationForm.companionCount}
                  onChange={(e) => setTransportationForm((prev) => ({ ...prev, companionCount: e.target.value }))}
                  className="w-full rounded-lg border border-slate-200 p-2 text-sm"
                />
              </div>
            </div>
            <div className="mt-3 flex flex-wrap gap-4">
              <label className="flex items-center gap-2 text-sm text-slate-700">
                <input
                  type="checkbox"
                  checked={transportationForm.airportPickup}
                  onChange={(e) => setTransportationForm((prev) => ({ ...prev, airportPickup: e.target.checked }))}
                />
                Airport pickup
              </label>
              <label className="flex items-center gap-2 text-sm text-slate-700">
                <input
                  type="checkbox"
                  checked={transportationForm.localShuttle}
                  onChange={(e) => setTransportationForm((prev) => ({ ...prev, localShuttle: e.target.checked }))}
                />
                Local shuttle
              </label>
              <label className="flex items-center gap-2 text-sm text-slate-700">
                <input
                  type="checkbox"
                  checked={transportationForm.wheelchairAssistance}
                  onChange={(e) => setTransportationForm((prev) => ({ ...prev, wheelchairAssistance: e.target.checked }))}
                />
                Wheelchair assistance
              </label>
            </div>
          </div>

          <div className="rounded-lg border border-slate-200 p-3">
            <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-slate-500">Post Care</p>
            <div>
              <p className="mb-1 text-xs font-semibold uppercase text-slate-500">Existing Notes</p>
              <NotesList notes={postCareForm.existingNotes} />
            </div>
            <div className="mt-3">
              <p className="mb-1 text-xs font-semibold uppercase text-slate-500">Append Note</p>
              <textarea
                value={postCareForm.newNote}
                onChange={(e) => setPostCareForm((prev) => ({ ...prev, newNote: e.target.value }))}
                rows={2}
                className="w-full rounded-lg border border-slate-200 p-2 text-sm"
              />
            </div>
          </div>
        </div>

        <div className="mt-4 flex justify-end gap-2">
          <Button variant="outline" size="sm" onClick={() => setEditJourneyOpen(false)} disabled={isPending}>
            Cancel
          </Button>
          <Button variant="default" size="sm" onClick={handleSaveJourney} disabled={isPending}>
            {isPending ? 'Saving...' : 'Save Journey'}
          </Button>
        </div>
      </Modal>
    </div>
  );
}
