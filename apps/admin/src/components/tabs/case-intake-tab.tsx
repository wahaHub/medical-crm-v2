'use client';

import { LoadingSpinner, QuestionnaireReadonlyView } from '@medical-crm/ui';
import { useCaseQuestionnaire } from '@/queries/use-cases';

// ── Main Export ──────────────────────────────────────────────────────

interface CaseIntakeTabProps {
  caseId: string;
}

export function CaseIntakeTab({ caseId }: CaseIntakeTabProps) {
  const { data: rawData, isLoading } = useCaseQuestionnaire(caseId);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <LoadingSpinner />
      </div>
    );
  }

  return <QuestionnaireReadonlyView data={rawData} />;
}
