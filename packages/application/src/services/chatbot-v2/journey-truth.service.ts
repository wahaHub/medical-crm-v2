import type { AiChatStatusSnapshot } from '@medical-crm/domain';
import type { JourneyTruth } from './types.js';

type JourneyTruthOverrides = {
  medicalInputsSubmitted?: boolean;
  recommendationAvailable?: boolean;
  recommendationConfirmed?: boolean;
};

export function deriveJourneyTruthFromStatusSnapshot(
  statusSnapshot: Partial<AiChatStatusSnapshot> | null | undefined,
  overrides: JourneyTruthOverrides = {},
): JourneyTruth {
  const persistedRecommendationAvailable = hasPersistedStatus(
    statusSnapshot?.recommendationStatus,
    ['PRELIMINARY_SHOWN', 'SHORTLIST_SHOWN', 'EXPLORED'],
  ) || hasPersistedStatus(
    statusSnapshot?.packageStatus,
    ['SHOWN', 'INTERESTED', 'EXPLORED'],
  );
  const medicalInputsSubmitted = overrides.medicalInputsSubmitted
    ?? hasPersistedStatus(statusSnapshot?.formStatus, ['COMPLETED', 'SUBMITTED']);
  const recommendationAvailable = overrides.recommendationAvailable ?? persistedRecommendationAvailable;
  const medicalInputsStarted = medicalInputsSubmitted
    || hasPersistedStatus(statusSnapshot?.formStatus, ['IN_PROGRESS', 'STARTED'])
    || hasPersistedStatus(statusSnapshot?.docUploadStatus, ['REQUESTED', 'UPLOADING', 'UPLOADED', 'IN_PROGRESS', 'SUBMITTED', 'STARTED']);
  const onlineConsultSubmitted = hasPersistedStatus(statusSnapshot?.consultationStatus, ['SCHEDULED', 'BOOKED', 'COMPLETED']);
  const onlineConsultStarted = onlineConsultSubmitted
    || hasPersistedStatus(statusSnapshot?.consultationStatus, ['INTRODUCED', 'READY']);
  const humanHandoffActive = hasPersistedStatus(statusSnapshot?.handoffStatus, ['REQUESTED', 'OPEN', 'IN_PROGRESS']);
  const humanHandoffSubmitted = humanHandoffActive
    || hasPersistedStatus(statusSnapshot?.handoffStatus, ['COMPLETED']);
  const persistedRecommendationConfirmed = hasPersistedStatus(statusSnapshot?.recommendationStatus, ['CONFIRMED', 'ACCEPTED'])
    || hasPersistedStatus(statusSnapshot?.packageStatus, ['CONFIRMED', 'ACCEPTED'])
    || onlineConsultStarted
    || onlineConsultSubmitted;
  const recommendationConfirmed = overrides.recommendationConfirmed ?? persistedRecommendationConfirmed;

  return {
    medicalInputsStarted,
    medicalInputsSubmitted,
    recommendationAvailable,
    recommendationConfirmed,
    onlineConsultRequired: onlineConsultStarted || onlineConsultSubmitted,
    onlineConsultStarted,
    onlineConsultSubmitted,
    humanHandoffActive,
    humanHandoffSubmitted,
  };
}

function hasPersistedStatus(value: string | null | undefined, expectedStates: string[]): boolean {
  return expectedStates.includes(normalize(value));
}

function normalize(value: string | null | undefined): string {
  return (value ?? '').trim().toUpperCase();
}
