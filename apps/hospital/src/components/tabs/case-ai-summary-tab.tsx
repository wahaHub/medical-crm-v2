'use client';

import { Sparkles } from 'lucide-react';
import { useHospitalI18n } from '@/lib/hospital-i18n';

interface CaseAiSummaryTabProps {
  aiSummary?: string | null;
}

export function CaseAiSummaryTab({ aiSummary }: CaseAiSummaryTabProps) {
  const { t } = useHospitalI18n();

  if (!aiSummary) {
    return (
      <div className="bg-white p-10 rounded-[1.5rem] border border-slate-100 shadow-sm flex flex-col items-center justify-center text-center">
        <div className="flex h-14 w-14 items-center justify-center rounded-full bg-slate-100 mb-4">
          <Sparkles size={28} className="text-slate-400" />
        </div>
        <h3 className="text-lg font-semibold text-slate-700 mb-1">
          {t('hospital.cases.detail.aiSummary.emptyTitle', undefined, 'No AI summary available')}
        </h3>
        <p className="text-sm text-slate-500 max-w-md">
          {t(
            'hospital.cases.detail.aiSummary.emptyDescription',
            undefined,
            'An AI-generated summary will appear here once the case has been processed.',
          )}
        </p>
      </div>
    );
  }

  return (
    <div className="bg-white p-6 rounded-[1.5rem] border border-slate-100 shadow-sm space-y-4">
      <h3 className="text-lg font-semibold text-slate-800 flex items-center gap-2">
        <Sparkles size={18} className="text-indigo-500" />
        {t('hospital.cases.detail.aiSummary.title', undefined, 'AI Summary')}
      </h3>
      <div className="bg-indigo-50/50 rounded-xl border border-indigo-100 p-5">
        <p className="text-sm text-slate-700 leading-relaxed whitespace-pre-wrap">{aiSummary}</p>
      </div>
    </div>
  );
}
