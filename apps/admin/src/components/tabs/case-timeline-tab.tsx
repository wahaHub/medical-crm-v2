'use client';

import { Card, CardHeader, CardTitle } from '@medical-crm/ui';
import { useCaseTimeline } from '@/queries/use-cases';
import { TimelineView, type TimelineEvent } from '@/components/timeline-view';

interface CaseTimelineTabProps {
  caseId: string;
}

interface TimelineItemLike {
  id: string;
  type?: string;
  eventType?: string;
  timestamp?: string;
  createdAt?: string;
  description?: string;
  data?: unknown;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}

function toTitleCase(text: string): string {
  return text
    .replace(/_/g, ' ')
    .toLowerCase()
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

function firstString(...values: unknown[]): string | undefined {
  for (const value of values) {
    if (typeof value === 'string' && value.trim().length > 0) return value;
  }
  return undefined;
}

function normalizeTimeline(raw: unknown): TimelineEvent[] {
  const list: unknown[] = Array.isArray(raw)
    ? raw
    : (raw && typeof raw === 'object' && Array.isArray((raw as { data?: unknown[] }).data)
      ? ((raw as { data?: unknown[] }).data ?? [])
      : []);

  return list
    .filter((item): item is TimelineItemLike => Boolean(item && typeof item === 'object'))
    .map((item) => {
      const eventType = item.type ?? item.eventType ?? 'EVENT';
      const createdAt = item.timestamp ?? item.createdAt ?? new Date().toISOString();
      const metadata = isRecord(item.data) ? item.data : undefined;
      const fallbackDescription = firstString(
        item.description,
        metadata?.['description'],
        metadata?.['summary'],
        metadata?.['note'],
      ) ?? toTitleCase(eventType);
      const actorName = firstString(
        metadata?.['actorName'],
        metadata?.['operatorName'],
        metadata?.['performedBy'],
        metadata?.['senderName'],
      );
      const actorRole = firstString(
        metadata?.['actorRole'],
        metadata?.['operatorRole'],
        metadata?.['senderRole'],
      );

      return {
        id: item.id,
        type: eventType,
        description: fallbackDescription,
        actorName,
        actorRole,
        createdAt,
        metadata,
      };
    });
}

function getErrorMessage(error: unknown, fallback: string): string {
  if (error instanceof Error && error.message) {
    return error.message;
  }
  return fallback;
}

export function CaseTimelineTab({ caseId }: CaseTimelineTabProps) {
  const { data: raw, isLoading, error } = useCaseTimeline(caseId);
  const events = normalizeTimeline(raw);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Case Timeline</CardTitle>
      </CardHeader>

      {isLoading ? (
        <div className="flex items-center justify-center py-20">
          <div className="h-6 w-6 animate-spin rounded-full border-2 border-indigo-600 border-t-transparent" />
        </div>
      ) : error ? (
        <div className="mx-6 mb-6 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
          {getErrorMessage(error, 'Failed to load timeline events')}
        </div>
      ) : (
        <TimelineView events={events} />
      )}
    </Card>
  );
}
