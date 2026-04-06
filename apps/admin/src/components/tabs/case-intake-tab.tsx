'use client';

import React from 'react';
import { LoadingSpinner, QuestionnaireReadonlyView } from '@medical-crm/ui';
import { useCaseQuestionnaire } from '@/queries/use-cases';
import { useQuestionTemplate } from '@/queries/use-question-collectors';

// ── Main Export ──────────────────────────────────────────────────────

interface CaseIntakeTabProps {
  caseId: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}

function unwrapQuestionnairePayload(rawData: unknown): Record<string, unknown> | null {
  const payload = isRecord(rawData) && 'data' in rawData
    ? (rawData as { data?: unknown }).data
    : rawData;

  return isRecord(payload) ? payload : null;
}

function getErrorMessage(error: unknown, fallback: string): string {
  if (error instanceof Error && error.message) {
    return error.message;
  }
  return fallback;
}

export function CaseIntakeTab({ caseId }: CaseIntakeTabProps) {
  const { data: rawData, isLoading, error } = useCaseQuestionnaire(caseId);
  const questionnairePayload = unwrapQuestionnairePayload(rawData);
  const templateId = typeof questionnairePayload?.['templateId'] === 'string'
    ? questionnairePayload['templateId']
    : null;
  const {
    data: template,
    isLoading: isLoadingTemplate,
  } = useQuestionTemplate(templateId);

  if (isLoading || (templateId && isLoadingTemplate)) {
    return (
      <div className="flex items-center justify-center py-20">
        <LoadingSpinner />
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
        {getErrorMessage(error, 'Failed to load medical intake')}
      </div>
    );
  }

  return <QuestionnaireReadonlyView template={template ?? null} response={questionnairePayload} />;
}
