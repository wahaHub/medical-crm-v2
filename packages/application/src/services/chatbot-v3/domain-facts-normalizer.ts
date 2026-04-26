import type { AiChatStatusSnapshot } from '@medical-crm/domain';
import type { MinimalIntakeSeed } from './minimal-intake.types.js';
import type {
  DomainFacts,
  MinimalTriageFactsStatus,
  RecommendationFactsStatus,
} from './supervisor-event.types.js';

type StatusSnapshotForDomainFacts = Partial<Pick<
  AiChatStatusSnapshot,
  | 'minimalTriageStatus'
  | 'minimalTriageAnswersSummary'
  | 'minimalTriageComplete'
  | 'processExplained'
  | 'recommendationGenerated'
  | 'recommendationSelected'
  | 'recommendationSelectionStatus'
  | 'recommendationSelectedHospitalIds'
  | 'supportingDocuments'
  | 'consultCompleted'
  | 'handoffActive'
>>;

export interface NormalizeFactsFromStatusSnapshotOptions {
  intake?: MinimalIntakeSeed | null;
  language?: string | null;
}

export function normalizeFactsFromStatusSnapshot(
  statusSnapshot: StatusSnapshotForDomainFacts | null | undefined,
  options: NormalizeFactsFromStatusSnapshotOptions = {},
): DomainFacts {
  const snapshot = statusSnapshot ?? {};
  const triageSummary = normalizeOptionalString(snapshot.minimalTriageAnswersSummary);
  const selectedHospitalIds = Array.isArray(snapshot.recommendationSelectedHospitalIds)
    ? snapshot.recommendationSelectedHospitalIds.filter((id): id is string => typeof id === 'string')
    : [];
  const supportingDocuments = Array.isArray(snapshot.supportingDocuments)
    ? snapshot.supportingDocuments
    : [];

  return {
    language: options.language ?? options.intake?.language ?? null,
    intake: {
      minimalTriageStatus: normalizeMinimalTriageStatus(snapshot, triageSummary),
      minimalTriageSummary: triageSummary,
      condition: options.intake?.condition ?? null,
      destination: options.intake?.targetDestination ?? null,
      patientGender: options.intake?.gender ?? null,
      relationToPatient: null,
    },
    recommendation: {
      status: normalizeRecommendationStatus(snapshot, selectedHospitalIds),
      selectedHospitalIds,
      generated: snapshot.recommendationGenerated ?? null,
    },
    process: {
      explained: snapshot.processExplained === true,
    },
    records: {
      supportingDocumentsCount: supportingDocuments.length,
      availableDocumentTypes: [],
      missingDocumentTypes: [],
    },
    consult: {
      status: snapshot.consultCompleted === true ? 'scheduled' : 'not_started',
    },
    handoff: {
      active: snapshot.handoffActive === true,
    },
  };
}

function normalizeMinimalTriageStatus(
  snapshot: StatusSnapshotForDomainFacts,
  triageSummary: string | null,
): MinimalTriageFactsStatus {
  if (snapshot.minimalTriageStatus === 'skipped') {
    return 'skipped';
  }

  if (snapshot.minimalTriageStatus === 'pending' && hasSubmittedTriageSummary(triageSummary)) {
    return 'submitted';
  }

  if (snapshot.minimalTriageStatus === 'pending' && snapshot.minimalTriageComplete === true) {
    return 'submitted';
  }

  return 'not_started';
}

function normalizeRecommendationStatus(
  snapshot: StatusSnapshotForDomainFacts,
  selectedHospitalIds: string[],
): RecommendationFactsStatus {
  if (snapshot.recommendationSelected === true || selectedHospitalIds.length > 0) {
    return 'selected';
  }

  switch (snapshot.recommendationSelectionStatus) {
    case 'selected':
      return 'selected';
    case 'skipped':
      return 'skipped';
    case 'pending':
      return 'generated';
    default:
      return snapshot.recommendationGenerated === true ? 'generated' : 'none';
  }
}

function hasSubmittedTriageSummary(summary: string | null): boolean {
  return summary !== null && summary.trim().length > 0;
}

function normalizeOptionalString(value: string | null | undefined): string | null {
  if (typeof value !== 'string') {
    return null;
  }

  // Summary compaction happens before reducer input; preserve the submitted summary verbatim.
  return value;
}
