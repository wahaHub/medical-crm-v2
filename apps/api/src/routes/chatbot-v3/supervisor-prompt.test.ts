import { describe, expect, it } from 'vitest';
import { buildSupervisorPrompt, getAllowedSupervisorEvents } from './supervisor-prompt.js';

const baseInput = {
  currentStage: 'COLLECT_MINIMAL_MEDICAL_FACTS' as const,
  conversationSummary: 'The user just started and no recommendations have been shown.',
  latestUserMessage: 'Please recommend hospitals for me.',
  intake: {
    condition: 'lung cancer',
    targetDestination: 'Shanghai',
    language: 'en',
    gender: 'female',
  },
  availableReadDomains: ['records.status', 'recommendation.status'] as const,
  conversationSummaryContract: {
    owner: 'runtime' as const,
    refreshTrigger: 'after_final_assistant_response' as const,
    sizeDiscipline: 'compact' as const,
    freshness: 'latest_committed_turn' as const,
    persistenceStrategy: 'persisted_with_session' as const,
  },
};

describe('buildSupervisorPrompt', () => {
  it('requires exactly one SupervisorEvent object and forbids proposal fields', () => {
    const prompt = buildSupervisorPrompt(baseInput);

    expect(prompt).toContain('Return exactly one SupervisorEvent JSON object.');
    expect(prompt).toContain('Required keys: eventType, confidence, source.');
    expect(prompt).toContain('Do not include metadata in the current strict schema.');
    expect(prompt).toContain('Do not return suggestedStage, dispatchAgent, task, intent, requestedReadDomains, or write patches.');
    expect(prompt).not.toContain('Required output keys: intent, suggestedStage.');
    expect(prompt).not.toContain('Allowed dispatchAgent values');
    expect(prompt).not.toContain('Compact agent guide:');
  });

  it('lists the complete allowed SupervisorEvent eventType set', () => {
    const prompt = buildSupervisorPrompt(baseInput);

    expect(prompt).toContain('Allowed eventType values:');
    expect(prompt).toContain('TRIAGE_SUBMITTED');
    expect(prompt).toContain('RECOMMENDATION_SELECTED');
    expect(prompt).toContain('DOCUMENTS_UPLOADED');
    expect(prompt).toContain('USER_ASKED_FAQ');
    expect(prompt).toContain('USER_ASKED_RISKY_MEDICAL_ADVICE');
    expect(prompt).toContain('UNKNOWN_MESSAGE');
  });

  it('includes an allowed-events section and compact minimal context', () => {
    const prompt = buildSupervisorPrompt({
      ...baseInput,
      currentStage: 'COLLECT_MEDICAL_INPUTS',
      conversationSummary: 'The user selected a hospital and has uploaded supporting documents.',
      latestUserMessage: 'I uploaded another file.',
      recommendationSelectionStatus: 'selected',
      recommendationSelectedHospitalIds: ['hospital-1'],
      processExplained: true,
      supportingDocuments: [
        { path: 'uploads/report-a.pdf', name: 'report-a.pdf' },
        { path: 'uploads/report-b.pdf', name: 'report-b.pdf' },
      ],
    });

    expect(prompt).toContain('Allowed events for this turn:');
    const allowedTurnEvents = getAllowedSupervisorEvents({
      ...baseInput,
      currentStage: 'COLLECT_MEDICAL_INPUTS',
    });
    expect(allowedTurnEvents).toContain('USER_INTERESTED_IN_CONSULT');
    expect(allowedTurnEvents).not.toContain('USER_REQUESTED_HUMAN');
    expect(allowedTurnEvents).not.toContain('TRIAGE_SUBMITTED');
    expect(allowedTurnEvents).not.toContain('DOCUMENTS_UPLOADED');
    expect(allowedTurnEvents).not.toContain('RECOMMENDATION_SELECTED');
    expect(allowedTurnEvents).not.toContain('RECOMMENDATION_SKIPPED');
    expect(prompt).toContain('current_stage=COLLECT_MEDICAL_INPUTS');
    expect(prompt).toContain('latest_user_message=I uploaded another file.');
    expect(prompt).toContain('recommendation_selection_status=selected');
    expect(prompt).toContain('supporting_documents_count=2');
    expect(prompt).toContain('report-a.pdf');
    expect(prompt).toContain('report-b.pdf');
  });

  it('keeps structured frontend actions out of semantic allowed events', () => {
    const allowedRecommendationEvents = getAllowedSupervisorEvents({
      ...baseInput,
      currentStage: 'RECOMMENDATION',
    });

    expect(allowedRecommendationEvents).not.toContain('TRIAGE_SUBMITTED');
    expect(allowedRecommendationEvents).not.toContain('TRIAGE_SKIPPED');
    expect(allowedRecommendationEvents).not.toContain('RECOMMENDATION_SELECTED');
    expect(allowedRecommendationEvents).not.toContain('RECOMMENDATION_SKIPPED');
    expect(allowedRecommendationEvents).not.toContain('DOCUMENTS_UPLOADED');
    expect(allowedRecommendationEvents).not.toContain('USER_REQUESTED_HUMAN');
    expect(allowedRecommendationEvents).toContain('USER_WANTS_DOCTOR_OR_HOSPITAL_MATCHING');
  });
});
