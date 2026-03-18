'use client';

import { LoadingSpinner, QuestionnaireReadonlyView } from '@medical-crm/ui';
import { useCaseQuestionnaire } from '@/queries/use-cases';

// ── Main Export ──────────────────────────────────────────────────────

interface CaseIntakeTabProps {
  caseId: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}

function normalizeQuestionnaireData(rawData: unknown): unknown {
  const payload = isRecord(rawData) && 'data' in rawData
    ? (rawData as { data?: unknown }).data
    : rawData;

  if (!payload || !isRecord(payload)) return payload;

  // API returns QCResponseDTO; UI expects questionnaire-shaped data.
  if ('responses' in payload && isRecord(payload.responses)) {
    const responses = payload.responses as Record<string, unknown>;
    const extractedData = isRecord(payload.extractedData)
      ? (payload.extractedData as Record<string, unknown>)
      : {};
    const medicalCondition = isRecord(responses.medicalCondition)
      ? responses.medicalCondition
      : {
          primaryDiagnosis: extractedData.primaryDiagnosis,
          medicalHistory: extractedData.medicalHistory,
        };

    return {
      ...responses,
      medicalIntake: responses.medicalIntake ?? responses,
      medicalCondition,
      riskLevel: responses.riskLevel ?? extractedData.riskLevel,
      aiSummary: responses.aiSummary ?? extractedData.aiSummary,
    };
  }

  return payload;
}

function getErrorMessage(error: unknown, fallback: string): string {
  if (error instanceof Error && error.message) {
    return error.message;
  }
  return fallback;
}

export function CaseIntakeTab({ caseId }: CaseIntakeTabProps) {
  const { data: rawData, isLoading, error } = useCaseQuestionnaire(caseId);
  const normalizedData = normalizeQuestionnaireData(rawData);

  if (isLoading) {
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

  return <QuestionnaireReadonlyView data={normalizedData} />;
}
