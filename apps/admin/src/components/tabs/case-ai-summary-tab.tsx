'use client';

import { Card, CardHeader, CardTitle, EmptyState } from '@medical-crm/ui';
import { Sparkles } from 'lucide-react';

interface CaseAiSummaryTabProps {
  aiSummary?: string | null;
}

export function CaseAiSummaryTab({ aiSummary }: CaseAiSummaryTabProps) {
  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-2">
          <Sparkles size={18} className="text-indigo-500" />
          <CardTitle>AI Summary</CardTitle>
        </div>
      </CardHeader>

      {aiSummary ? (
        <div className="bg-indigo-50/50 rounded-xl border border-indigo-100 p-5">
          <p className="text-sm text-slate-700 leading-relaxed whitespace-pre-wrap">{aiSummary}</p>
        </div>
      ) : (
        <EmptyState
          icon={<Sparkles size={36} />}
          title="No AI summary available"
          description="An AI-generated summary will appear here once the case has been processed."
        />
      )}
    </Card>
  );
}
