'use client';

import { Card, CardHeader, CardTitle } from '@medical-crm/ui';
import { useCaseTimeline } from '@/queries/use-cases';
import { TimelineView, type TimelineEvent } from '@/components/timeline-view';

interface CaseTimelineTabProps {
  caseId: string;
}

export function CaseTimelineTab({ caseId }: CaseTimelineTabProps) {
  const { data: raw, isLoading } = useCaseTimeline(caseId);
  const events: TimelineEvent[] = (raw as TimelineEvent[] | undefined) ?? [];

  return (
    <Card>
      <CardHeader>
        <CardTitle>Case Timeline</CardTitle>
      </CardHeader>

      {isLoading ? (
        <div className="flex items-center justify-center py-20">
          <div className="h-6 w-6 animate-spin rounded-full border-2 border-indigo-600 border-t-transparent" />
        </div>
      ) : (
        <TimelineView events={events} />
      )}
    </Card>
  );
}
