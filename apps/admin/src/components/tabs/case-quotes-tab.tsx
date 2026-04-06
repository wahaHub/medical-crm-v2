'use client';

import {
  Card,
  CardHeader,
  CardTitle,
} from '@medical-crm/ui';
import { useCaseQuotesCompare } from '@/queries/use-cases';
import { useHospitalNameMap } from '@/queries/use-hospital-names';
import { QuoteComparison } from '@/components/quote-comparison';

interface CaseQuotesTabProps {
  caseId: string;
}

interface PaginatedLike<T> {
  data?: T[];
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

function getErrorMessage(error: unknown, fallback: string): string {
  if (error instanceof Error && error.message) {
    return error.message;
  }
  return fallback;
}

function QuoteComparisonCard({ caseId }: { caseId: string }) {
  const { data: raw, isLoading, error } = useCaseQuotesCompare(caseId);
  const quoteDtos = toQuotes(raw);
  const { nameMap: hospitalNameMap } = useHospitalNameMap(quoteDtos.map((quote) => quote.hospitalId));
  const quotes = quoteDtos.map((quote) => {
    const items = toLineItems(quote.lineItems);
    return {
      hospitalId: quote.hospitalId,
      hospitalName: quote.hospitalName ?? hospitalNameMap[quote.hospitalId] ?? quote.hospitalId,
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
        <div className="space-y-1">
          <span className="text-xs text-slate-400 italic">Read-only — patient accepts/rejects quotes</span>
          <div className="text-xs text-slate-500">Selected hospitals and quote follow-ups are managed from the Overview tab.</div>
        </div>
      </CardHeader>

      {isLoading ? (
        <div className="flex items-center justify-center py-10">
          <div className="h-6 w-6 animate-spin rounded-full border-2 border-indigo-600 border-t-transparent" />
        </div>
      ) : error ? (
        <div className="mx-6 mb-6 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
          {getErrorMessage(error, 'Failed to load quote comparison')}
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
      <QuoteComparisonCard caseId={caseId} />
    </div>
  );
}
