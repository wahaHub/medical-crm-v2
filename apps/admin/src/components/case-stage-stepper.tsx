'use client';

import { useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { useQueryClient } from '@tanstack/react-query';
import { Button, Card } from '@medical-crm/ui';
import { Check, ChevronsRight } from 'lucide-react';
import { useCaseProgress } from '@/queries/use-cases';
import { updateCaseStage } from '@/actions/case-actions';
import type { CaseProgressItem, CaseSummary } from '@/lib/api-types';

const TREATMENT_STAGES = [
  { key: 'CONFIRMED', label: 'Confirmed' },
  { key: 'IN_TREATMENT', label: 'In Treatment' },
  { key: 'POST_TREATMENT', label: 'Post Treatment' },
  { key: 'COMPLETED', label: 'Completed' },
  { key: 'FOLLOW_UP', label: 'Follow Up' },
] as const;

type TreatmentStageKey = (typeof TREATMENT_STAGES)[number]['key'];

function stageReachedAt(progress: CaseProgressItem[], stage: TreatmentStageKey): string | null {
  const entry = progress
    .filter((item) => {
      if (item.progressType !== 'STATUS_CHANGE') return false;
      const metadata = item.metadata;
      return Boolean(metadata && typeof metadata === 'object' && metadata['to'] === stage);
    })
    .sort((a, b) => new Date(b.recordedAt).getTime() - new Date(a.recordedAt).getTime())[0];
  return entry?.recordedAt ?? null;
}

export function CaseStageStepper({ caseData }: { caseData: CaseSummary }) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { data: progressRaw } = useCaseProgress(caseData.id);
  const progress = (progressRaw as CaseProgressItem[] | undefined) ?? [];
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const currentStage = (caseData.treatmentStage as TreatmentStageKey | null) ?? null;
  const currentIndex = currentStage ? TREATMENT_STAGES.findIndex((s) => s.key === currentStage) : -1;
  const nextStage = currentIndex >= 0
    ? (TREATMENT_STAGES[currentIndex + 1] ?? null)
    : TREATMENT_STAGES[0];

  const reachedAtByStage = useMemo(() => {
    const map = new Map<TreatmentStageKey, string | null>();
    for (const stage of TREATMENT_STAGES) {
      map.set(stage.key, stageReachedAt(progress, stage.key));
    }
    return map;
  }, [progress]);

  function handleAdvance() {
    if (!nextStage) return;
    setError(null);
    startTransition(async () => {
      try {
        await updateCaseStage(caseData.id, nextStage.key);
        await queryClient.invalidateQueries({ queryKey: ['cases', caseData.id] });
        await queryClient.invalidateQueries({ queryKey: ['cases', caseData.id, 'progress'] });
        await queryClient.invalidateQueries({ queryKey: ['cases', caseData.id, 'timeline'] });
        router.refresh();
      } catch (err) {
        // Surface the state-machine rejection reason returned by the backend
        setError(err instanceof Error ? err.message : 'Failed to advance stage');
      }
    });
  }

  return (
    <Card>
      <div className="flex flex-wrap items-center justify-between gap-4">
        <ol className="flex flex-1 flex-wrap items-center gap-y-3">
          {TREATMENT_STAGES.map((stage, index) => {
            const isCompleted = currentIndex >= 0 && index < currentIndex;
            const isCurrent = index === currentIndex;
            const reachedAt = reachedAtByStage.get(stage.key);
            return (
              <li key={stage.key} className="flex items-center">
                <div className="flex flex-col items-center gap-1">
                  <div
                    className={`flex h-7 w-7 items-center justify-center rounded-full text-xs font-semibold ${
                      isCompleted
                        ? 'bg-emerald-500 text-white'
                        : isCurrent
                          ? 'bg-indigo-600 text-white'
                          : 'bg-slate-200 text-slate-500'
                    }`}
                  >
                    {isCompleted ? <Check size={14} /> : index + 1}
                  </div>
                  <span
                    className={`whitespace-nowrap text-[11px] ${
                      isCurrent ? 'font-semibold text-indigo-700' : 'text-slate-500'
                    }`}
                  >
                    {stage.label}
                  </span>
                  {(isCompleted || isCurrent) && reachedAt && (
                    <span className="whitespace-nowrap text-[10px] text-slate-400">
                      {new Date(reachedAt).toLocaleDateString()}
                    </span>
                  )}
                </div>
                {index < TREATMENT_STAGES.length - 1 && (
                  <div
                    className={`mx-2 mb-5 h-px w-8 sm:w-12 ${
                      index < currentIndex ? 'bg-emerald-400' : 'bg-slate-200'
                    }`}
                  />
                )}
              </li>
            );
          })}
        </ol>

        {nextStage && (
          <div className="flex flex-col items-end gap-1">
            <Button
              variant="default"
              size="sm"
              onClick={handleAdvance}
              disabled={isPending}
            >
              <ChevronsRight size={14} className="mr-1.5" />
              {isPending
                ? 'Advancing...'
                : currentIndex < 0
                  ? `Start: ${nextStage.label}`
                  : `Advance to ${nextStage.label}`}
            </Button>
          </div>
        )}
      </div>
      {error && (
        <div className="mt-3 rounded-xl border border-rose-200 bg-rose-50 px-4 py-2.5 text-sm text-rose-700">
          {error}
        </div>
      )}
    </Card>
  );
}
