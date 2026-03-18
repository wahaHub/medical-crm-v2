'use client';

import { useMemo, useState, useTransition } from 'react';
import {
  Card,
  CardHeader,
  CardTitle,
  StatusBadge,
  DataTable,
  EmptyState,
  Button,
  Modal,
  SearchInput,
  type Column,
} from '@medical-crm/ui';
import { Bell, Building2, Clock, Plus, Trash2 } from 'lucide-react';
import { useCaseHospitalContacts, useCaseQuotesCompare } from '@/queries/use-cases';
import { useHospitals } from '@/queries/use-hospitals';
import { QuoteComparison } from '@/components/quote-comparison';
import { addHospitalToCase, removeHospitalContact, sendHospitalContactReminder } from '@/actions/quote-actions';

interface HospitalContact {
  id: string;
  hospitalId: string;
  hospitalName?: string;
  subStatus: string;
  createdAt: string;
  firstReplyAt?: string | null;
}

interface CaseQuotesTabProps {
  caseId: string;
}

interface PaginatedLike<T> {
  data?: T[];
}

interface HospitalSummaryLike {
  id: string;
  name: string;
  status?: string;
}

interface QuoteLike {
  id: string;
  hospitalId: string;
  hospitalName?: string;
  lineItems?: unknown;
  totalAmount?: string;
  currency?: string;
  sentAt?: string | null;
}

function toContacts(raw: unknown): HospitalContact[] {
  if (Array.isArray(raw)) return raw as HospitalContact[];
  if (raw && typeof raw === 'object' && Array.isArray((raw as PaginatedLike<HospitalContact>).data)) {
    return (raw as PaginatedLike<HospitalContact>).data ?? [];
  }
  return [];
}

function toQuotes(raw: unknown): QuoteLike[] {
  if (Array.isArray(raw)) return raw as QuoteLike[];
  if (raw && typeof raw === 'object' && Array.isArray((raw as PaginatedLike<QuoteLike>).data)) {
    return (raw as PaginatedLike<QuoteLike>).data ?? [];
  }
  return [];
}

function toAmount(value: unknown): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function toLineItems(input: unknown): Array<{ name: string; amount: number; currency?: string }> {
  if (!input) return [];
  const source = Array.isArray(input)
    ? input
    : (typeof input === 'object' && input !== null && Array.isArray((input as { items?: unknown[] }).items)
      ? (input as { items: unknown[] }).items
      : []);
  const lineItems: Array<{ name: string; amount: number; currency?: string }> = [];
  for (const raw of source) {
    if (!raw || typeof raw !== 'object') continue;
    const item = raw as Record<string, unknown>;
    const name = String(item.name ?? item.itemName ?? item.serviceName ?? 'Item');
    const amount = toAmount(item.amount ?? item.price ?? item.total ?? item.unitPrice);
    const currency = item.currency ? String(item.currency) : undefined;
    lineItems.push({ name, amount, currency });
  }
  return lineItems;
}

function InvitedHospitalsCard({ caseId }: { caseId: string }) {
  const { data: raw, isLoading, refetch } = useCaseHospitalContacts(caseId);
  const contacts = toContacts(raw);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [selectedHospitalId, setSelectedHospitalId] = useState('');

  const { data: hospitalsRaw, isLoading: isHospitalsLoading } = useHospitals({
    page: '1',
    limit: '30',
    search,
    status: 'ACTIVE',
  });
  const hospitals = useMemo(() => {
    const data = hospitalsRaw?.data ?? [];
    return (data as HospitalSummaryLike[]).filter((hospital) => !contacts.some((contact) => contact.hospitalId === hospital.id));
  }, [hospitalsRaw?.data, contacts]);

  function handleAddHospital() {
    if (!selectedHospitalId) return;
    setError(null);
    startTransition(async () => {
      try {
        await addHospitalToCase(caseId, selectedHospitalId);
        await refetch();
        setModalOpen(false);
        setSelectedHospitalId('');
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to add hospital');
      }
    });
  }

  function handleReminder(contactId: string) {
    setError(null);
    startTransition(async () => {
      try {
        await sendHospitalContactReminder(contactId, caseId);
        await refetch();
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to send reminder');
      }
    });
  }

  function handleRemove(contactId: string) {
    const reason = window.prompt('Optional reason for removal:') ?? undefined;
    setError(null);
    startTransition(async () => {
      try {
        await removeHospitalContact(contactId, caseId, reason);
        await refetch();
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to remove hospital');
      }
    });
  }

  const columns: Column<HospitalContact>[] = [
    {
      key: 'hospital',
      header: 'Hospital',
      render: (row) => (
        <div className="flex items-center gap-2">
          <Building2 size={14} className="text-indigo-400 shrink-0" />
          <span className="text-sm font-medium text-slate-800">{row.hospitalName ?? row.hospitalId}</span>
        </div>
      ),
    },
    {
      key: 'status',
      header: 'Status',
      render: (row) => <StatusBadge status={row.subStatus} />,
    },
    {
      key: 'createdAt',
      header: 'Invited',
      render: (row) => (
        <div className="flex items-center gap-1.5 text-xs text-slate-400">
          <Clock size={12} />
          {new Date(row.createdAt).toLocaleDateString()}
        </div>
      ),
    },
    {
      key: 'firstReplyAt',
      header: 'Responded',
      render: (row) => (
        <span className="text-xs text-slate-400">
          {row.firstReplyAt ? new Date(row.firstReplyAt).toLocaleDateString() : '—'}
        </span>
      ),
    },
    {
      key: 'actions',
      header: 'Actions',
      render: (row) => (
        <div className="flex items-center gap-2">
          <button
            type="button"
            disabled={isPending}
            onClick={() => handleReminder(row.id)}
            className="inline-flex items-center gap-1 rounded-md border border-slate-200 px-2 py-1 text-xs text-slate-600 hover:bg-slate-50 disabled:opacity-50"
          >
            <Bell size={12} />
            Remind
          </button>
          <button
            type="button"
            disabled={isPending}
            onClick={() => handleRemove(row.id)}
            className="inline-flex items-center gap-1 rounded-md border border-rose-200 px-2 py-1 text-xs text-rose-600 hover:bg-rose-50 disabled:opacity-50"
          >
            <Trash2 size={12} />
            Remove
          </button>
        </div>
      ),
    },
  ];

  return (
    <Card>
      <CardHeader>
        <CardTitle>Invited Hospitals</CardTitle>
        <Button variant="outline" size="sm" onClick={() => setModalOpen(true)}>
          <Plus size={14} className="mr-1" />
          Add Hospital
        </Button>
      </CardHeader>

      {error && (
        <div className="mx-6 mb-4 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
          {error}
        </div>
      )}

      {isLoading ? (
        <div className="flex items-center justify-center py-10">
          <div className="h-6 w-6 animate-spin rounded-full border-2 border-indigo-600 border-t-transparent" />
        </div>
      ) : (
        <DataTable
          columns={columns}
          data={contacts}
          keyExtractor={(row) => row.id}
          emptyState={
            <EmptyState
              icon={<Building2 size={36} />}
              title="No hospitals invited yet"
              description="Hospitals will appear here once they are invited to quote on this case."
            />
          }
        />
      )}

      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title="Add Hospital to Case"
        maxWidth="max-w-xl"
      >
        <div className="space-y-3">
          <SearchInput
            value={search}
            onChange={setSearch}
            placeholder="Search hospitals..."
            debounceMs={200}
          />
          <div className="max-h-64 overflow-y-auto rounded-lg border border-slate-200">
            {isHospitalsLoading ? (
              <div className="p-3 text-sm text-slate-500">Loading hospitals...</div>
            ) : hospitals.length === 0 ? (
              <div className="p-3 text-sm text-slate-500">No available hospitals found.</div>
            ) : (
              hospitals.map((hospital) => (
                <label
                  key={hospital.id}
                  className="flex cursor-pointer items-center justify-between border-b border-slate-100 px-3 py-2 last:border-b-0 hover:bg-slate-50"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-slate-800">{hospital.name}</p>
                    <p className="text-xs text-slate-500">{hospital.id}</p>
                  </div>
                  <input
                    type="radio"
                    name="hospital"
                    checked={selectedHospitalId === hospital.id}
                    onChange={() => setSelectedHospitalId(hospital.id)}
                  />
                </label>
              ))
            )}
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="outline" size="sm" onClick={() => setModalOpen(false)} disabled={isPending}>
              Cancel
            </Button>
            <Button variant="default" size="sm" onClick={handleAddHospital} disabled={isPending || !selectedHospitalId}>
              {isPending ? 'Adding...' : 'Add'}
            </Button>
          </div>
        </div>
      </Modal>
    </Card>
  );
}

function QuoteComparisonCard({ caseId }: { caseId: string }) {
  const { data: raw, isLoading } = useCaseQuotesCompare(caseId);
  const quoteDtos = toQuotes(raw);
  const quotes = quoteDtos.map((quote) => {
    const items = toLineItems(quote.lineItems);
    return {
      hospitalId: quote.hospitalId,
      hospitalName: quote.hospitalName ?? quote.hospitalId,
      items,
      total: toAmount(quote.totalAmount),
      currency: quote.currency ?? 'USD',
      submittedAt: quote.sentAt ?? undefined,
    };
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle>Quote Comparison</CardTitle>
        <span className="text-xs text-slate-400 italic">Read-only — patient accepts/rejects quotes</span>
      </CardHeader>

      {isLoading ? (
        <div className="flex items-center justify-center py-10">
          <div className="h-6 w-6 animate-spin rounded-full border-2 border-indigo-600 border-t-transparent" />
        </div>
      ) : (
        <QuoteComparison quotes={quotes} />
      )}
    </Card>
  );
}

export function CaseQuotesTab({ caseId }: CaseQuotesTabProps) {
  return (
    <div className="space-y-6">
      <InvitedHospitalsCard caseId={caseId} />
      <QuoteComparisonCard caseId={caseId} />
    </div>
  );
}
