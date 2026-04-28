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

    expect(prompt).toContain('Your only job is to classify the latest user message into one allowed eventType, target, and modifier.');
    expect(prompt).toContain('Return exactly one JSON object matching the provided schema.');
    expect(prompt).toContain('Required keys: eventType, target, modifier, confidence.');
    expect(prompt).not.toContain('source must be "llm"');
    expect(prompt).not.toContain('Do not include metadata');
    expect(prompt).not.toContain('Do not return suggestedStage');
    expect(prompt).not.toContain('Do not decide workflow state');
    expect(prompt).not.toContain('Required output keys: intent, suggestedStage.');
    expect(prompt).not.toContain('Allowed dispatchAgent values');
    expect(prompt).not.toContain('Compact agent guide:');
  });

  it('lists only the allowed semantic eventType values for the turn', () => {
    const prompt = buildSupervisorPrompt(baseInput);

    expect(prompt).toContain('You may only return one of these allowed eventType values:');
    expect(prompt).not.toContain('Allowed eventType values:');
    expect(prompt).not.toContain('TRIAGE_SUBMITTED');
    expect(prompt).not.toContain('RECOMMENDATION_SELECTED');
    expect(prompt).not.toContain('DOCUMENTS_UPLOADED');
    expect(prompt).toContain('USER_EXPRESSED_NEED');
    expect(prompt).toContain('USER_ASKED_QUESTION');
    expect(prompt).toContain('USER_PROVIDED_INFORMATION');
    expect(prompt).toContain('USER_RESPONDED_TO_REQUEST');
    expect(prompt).toContain('USER_REQUESTED_HUMAN');
    expect(prompt).toContain('USER_ASKED_RISKY_MEDICAL_ADVICE');
    expect(prompt).toContain('USER_MESSAGE_UNCLEAR');
  });

  it('includes concise classification guidance for allowed semantic events', () => {
    const prompt = buildSupervisorPrompt(baseInput);

    expect(prompt).toContain('Classification guide:');
    expect(prompt).toContain('USER_EXPRESSED_NEED: user asks for a result, service, or goal');
    expect(prompt).toContain('USER_PROVIDED_INFORMATION: user gives facts, preferences, records');
    expect(prompt).toContain('USER_RESPONDED_TO_REQUEST: user replies to the previous assistant request');
    expect(prompt).toContain('USER_ASKED_QUESTION: user asks a question about next step, process, pricing, documents, payment, travel, hospital, or consult');
    expect(prompt).toContain('USER_MESSAGE_UNCLEAR: no allowed event fits');
    expect(prompt).not.toContain('TRIAGE_SUBMITTED:');
    expect(prompt).not.toContain('DOCUMENTS_UPLOADED:');
    expect(prompt).not.toContain('RECOMMENDATION_SELECTED:');
    expect(prompt).not.toContain('USER_ASKED_FAQ:');
    expect(prompt).not.toContain('USER_WANTS_TREATMENT_IN_CHINA:');
  });

  it('defines supported service scope instead of enumerating out-of-scope examples', () => {
    const prompt = buildSupervisorPrompt(baseInput);

    expect(prompt).toContain('USER_ASKED_RISKY_MEDICAL_ADVICE: user asks for diagnosis, treatment decision, medication advice, urgent medical judgment, or outcome guarantee.');
    expect(prompt).toContain('USER_ASKED_OUT_OF_SCOPE_OR_RESTRICTED_SERVICE: user asks Medora to perform a service that is not part of the supported medical-travel coordination workflows listed below.');
    expect(prompt).toContain('Medora supported service scope:');
    expect(prompt).toContain('understanding the patient\'s condition, destination, timing, preferences, and contact details.');
    expect(prompt).toContain('collecting or explaining needed medical records and supporting documents.');
    expect(prompt).toContain('matching the patient with hospitals, doctors, packages, or treatment-path options.');
    expect(prompt).toContain('arranging or preparing records-based review, online consults, appointments, or human coordinator handoff for the medical-travel case.');
    expect(prompt).toContain('Classify requests for a service outside that supported scope as USER_ASKED_OUT_OF_SCOPE_OR_RESTRICTED_SERVICE.');
    expect(prompt).toContain('Classify guarantee/promise/ensure outcome wording as USER_ASKED_RISKY_MEDICAL_ADVICE, not USER_EXPRESSED_NEED.');
    expect(prompt).not.toContain('green card');
    expect(prompt).not.toContain('immigration');
  });

  it('includes an allowed-events section and compact classifier context', () => {
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

    expect(prompt).toContain('You may only return one of these allowed eventType values:');
    const allowedTurnEvents = getAllowedSupervisorEvents({
      ...baseInput,
      currentStage: 'COLLECT_MEDICAL_INPUTS',
    });
    expect(allowedTurnEvents).toContain('USER_EXPRESSED_NEED');
    expect(allowedTurnEvents).toContain('USER_REQUESTED_HUMAN');
    expect(allowedTurnEvents).not.toContain('TRIAGE_SUBMITTED');
    expect(allowedTurnEvents).not.toContain('DOCUMENTS_UPLOADED');
    expect(allowedTurnEvents).not.toContain('RECOMMENDATION_SELECTED');
    expect(allowedTurnEvents).not.toContain('RECOMMENDATION_SKIPPED');
    expect(prompt).toContain('current_stage=COLLECT_MEDICAL_INPUTS');
    expect(prompt).toContain('latest_user_message=I uploaded another file.');
    expect(prompt).toContain('last_question_type=');
    expect(prompt).toContain('last_question_expected_answer_type=');
    expect(prompt).toContain('known_condition=lung cancer');
    expect(prompt).toContain('known_destination=Shanghai');
    expect(prompt).toContain('recommendation_status=selected');
    expect(prompt).toContain('process_explained=true');
    expect(prompt).toContain('supporting_documents_count=2');
    expect(prompt).not.toContain('Conversation Summary Contract:');
    expect(prompt).not.toContain('owner=runtime');
    expect(prompt).not.toContain('persistence_strategy=');
    expect(prompt).not.toContain('selected_hospital_ids=');
    expect(prompt).not.toContain('supporting_documents=');
    expect(prompt).not.toContain('report-a.pdf');
    expect(prompt).not.toContain('report-b.pdf');
    expect(prompt).not.toContain('uploads/report-a.pdf');
    expect(prompt).not.toContain('uploads/report-b.pdf');
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
    expect(allowedRecommendationEvents).toContain('USER_REQUESTED_HUMAN');
    expect(allowedRecommendationEvents).toContain('USER_EXPRESSED_NEED');
    expect(allowedRecommendationEvents).toContain('USER_ASKED_QUESTION');
  });
});
