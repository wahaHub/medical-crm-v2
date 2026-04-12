import type { AiChatStatusSnapshot } from '@medical-crm/domain';
import type { JourneyTruth } from './types.js';

type JourneyTruthOverrides = {
  medicalInputsSubmitted?: boolean;
  recommendationConfirmed?: boolean;
  onlineConsultSubmitted?: boolean;
};

export function deriveJourneyTruthFromStatusSnapshot(
  statusSnapshot: Partial<AiChatStatusSnapshot> | null | undefined,
  overrides: JourneyTruthOverrides = {},
): JourneyTruth {
  const medicalInputsSubmitted = overrides.medicalInputsSubmitted
    ?? hasPersistedStatus(statusSnapshot?.formStatus, ['COMPLETED', 'SUBMITTED']);
  const onlineConsultSubmitted = overrides.onlineConsultSubmitted
    ?? hasPersistedStatus(statusSnapshot?.consultationStatus, ['SCHEDULED', 'BOOKED', 'COMPLETED']);
  const persistedRecommendationConfirmed = hasPersistedStatus(statusSnapshot?.recommendationStatus, ['CONFIRMED', 'ACCEPTED'])
    || hasPersistedStatus(statusSnapshot?.packageStatus, ['CONFIRMED', 'ACCEPTED'])
    || onlineConsultSubmitted;
  const recommendationConfirmed = overrides.recommendationConfirmed ?? persistedRecommendationConfirmed;

  return {
    medicalInputsSubmitted,
    recommendationConfirmed,
    onlineConsultSubmitted,
  };
}

function hasPersistedStatus(value: string | null | undefined, expectedStates: string[]): boolean {
  return expectedStates.includes(normalize(value));
}

function normalize(value: string | null | undefined): string {
  return (value ?? '').trim().toUpperCase();
}
