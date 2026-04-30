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
    expect(prompt).toContain('USER_EXPRESSED_INTEREST');
    expect(prompt).toContain('USER_ASKED_QUESTION');
    expect(prompt).toContain('USER_PROVIDED_INFORMATION');
    expect(prompt).toContain('USER_RESPONDED_TO_REQUEST');
    expect(prompt).toContain('USER_REQUESTED_ACTION');
    expect(prompt).toContain('USER_REQUESTED_HUMAN');
    expect(prompt).toContain('USER_MESSAGE_UNCLEAR');
    expect(prompt).not.toContain('USER_EXPRESSED_NEED');
    expect(prompt).not.toContain('USER_ASKED_MEDICAL_ADVICE');
    expect(prompt).not.toContain('USER_ASKED_OUT_OF_SCOPE_OR_RESTRICTED_SERVICE');
  });

  it('includes concise classification guidance for allowed semantic events', () => {
    const prompt = buildSupervisorPrompt(baseInput);

    expect(prompt).toContain('Classification guide:');
    expect(prompt).toContain('USER_EXPRESSED_INTEREST: user expresses a service goal or desire');
    expect(prompt).toContain('USER_PROVIDED_INFORMATION: user gives facts, preferences, records');
    expect(prompt).toContain('USER_RESPONDED_TO_REQUEST: user replies to the previous assistant request');
    expect(prompt).toContain('USER_REQUESTED_ACTION: user asks Medora to do something');
    expect(prompt).toContain('USER_ASKED_QUESTION: user asks an informational question');
    expect(prompt).toContain('USER_MESSAGE_UNCLEAR: no allowed event fits');
    expect(prompt).not.toContain('TRIAGE_SUBMITTED:');
    expect(prompt).not.toContain('DOCUMENTS_UPLOADED:');
    expect(prompt).not.toContain('RECOMMENDATION_SELECTED:');
    expect(prompt).not.toContain('USER_ASKED_FAQ:');
    expect(prompt).not.toContain('USER_WANTS_TREATMENT_IN_CHINA:');
  });

  it('explains the eventType, target, and modifier boundary', () => {
    const prompt = buildSupervisorPrompt(baseInput);

    expect(prompt).toContain('eventType is the user action shape');
    expect(prompt).toContain('target is the business domain');
    expect(prompt).toContain('modifier is the user posture');
    expect(prompt).toContain('Do not create skill-specific event types');
  });

  it('includes detailed guidance for semantic event classification', () => {
    const prompt = buildSupervisorPrompt(baseInput);

    expect(prompt).toContain('USER_EXPRESSED_INTEREST: goal/desire, not a concrete action.');
    expect(prompt).toContain('USER_ASKED_QUESTION: information/explanation/feasibility/policy/medical-orientation question.');
    expect(prompt).toContain('USER_PROVIDED_INFORMATION: facts, files, contact details, corrections.');
    expect(prompt).toContain('USER_RESPONDED_TO_REQUEST: answer to previous assistant request.');
    expect(prompt).toContain('USER_REQUESTED_ACTION: operational request for Medora to do something.');
    expect(prompt).toContain('USER_REQUESTED_HUMAN: explicit human/coordinator/contact request, always target=handoff.');
    expect(prompt).toContain('USER_MESSAGE_UNCLEAR: too unclear to classify safely.');
    expect(prompt).toContain('medical-advice questions use USER_ASKED_QUESTION with target=medical_advice');
    expect(prompt).toContain('online consultation timing, readiness, scheduling, or process questions use target=consult unless the user asks refund/payment policy');
    expect(prompt).toContain('outside Medora scope uses target=service_scope');
    expect(prompt).toContain('USER_REQUESTED_HUMAN always uses target=handoff');
    expect(prompt).toContain('Do not represent human requests as modifier=request_action');
  });

  it('defines supported service scope instead of enumerating out-of-scope examples', () => {
    const prompt = buildSupervisorPrompt(baseInput);

    expect(prompt).toContain('Medora supported service scope:');
    expect(prompt).toContain('understanding the patient\'s condition, destination, timing, preferences, and contact details.');
    expect(prompt).toContain('collecting or explaining needed medical records and supporting documents.');
    expect(prompt).toContain('matching the patient with hospitals, doctors, packages, or treatment-path options.');
    expect(prompt).toContain('arranging or preparing records-based review, online consults, appointments, or human coordinator handoff for the medical-travel case.');
    expect(prompt).toContain('Classify requests for a service outside that supported scope as USER_ASKED_QUESTION or USER_REQUESTED_ACTION with target=service_scope.');
    expect(prompt).toContain('Classify guarantee/promise/ensure outcome wording as USER_ASKED_QUESTION with target=medical_advice, not USER_EXPRESSED_INTEREST.');
    expect(prompt).not.toContain('Classify requests for a service outside that supported scope as USER_ASKED_OUT_OF_SCOPE_OR_RESTRICTED_SERVICE.');
    expect(prompt).not.toContain('Classify guarantee/promise/ensure outcome wording as USER_ASKED_MEDICAL_ADVICE');
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
    expect(allowedTurnEvents).toContain('USER_EXPRESSED_INTEREST');
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
    expect(allowedRecommendationEvents).toContain('USER_EXPRESSED_INTEREST');
    expect(allowedRecommendationEvents).toContain('USER_ASKED_QUESTION');
  });

  it('lists only skill-aligned targets and the canonical posture modifiers', () => {
    const prompt = buildSupervisorPrompt(baseInput);

    expect(prompt).toContain('Target guide: service_scope, policy, medical_advice, hospital, treatment, pricing, payment, travel, sales, consult, handoff, unknown.');
    expect(prompt).toContain('Modifier guide: ask, provide, confirm, reject, hesitate, correct, compare, revisit, request_action, urgent, unknown.');
    expect(prompt).not.toContain('Target guide: treatment, recommendation, documents');
    expect(prompt).not.toContain('medical_facts');
    expect(prompt).not.toContain('contact, human');
  });

  it('locks refined taxonomy classification scenarios with concrete examples', () => {
    const prompt = buildSupervisorPrompt(baseInput);

    expect(prompt).toContain('Concrete taxonomy examples:');
    expect(prompt).toContain('"Can I talk to a human coordinator?" -> eventType=USER_REQUESTED_HUMAN, target=handoff, modifier=ask.');
    expect(prompt).toContain('"Could this be trigeminal neuralgia?" -> eventType=USER_ASKED_QUESTION, target=medical_advice, modifier=ask.');
    expect(prompt).toContain('"Can you help me get a work visa?" -> eventType=USER_ASKED_QUESTION, target=service_scope, modifier=ask.');
    expect(prompt).toContain('"Please help me get school admission." -> eventType=USER_REQUESTED_ACTION, target=service_scope, modifier=request_action.');
    expect(prompt).toContain('"Can Medora submit my insurance claim or get reimbursement approval?" -> eventType=USER_ASKED_QUESTION, target=policy, modifier=ask.');
    expect(prompt).toContain('"Is the $400 online consultation refundable if I don\'t come to China?" -> eventType=USER_ASKED_QUESTION, target=policy, modifier=ask.');
    expect(prompt).toContain('"How long does online consultation take?" -> eventType=USER_ASKED_QUESTION, target=consult, modifier=ask.');
    expect(prompt).toContain('"Recommend hospitals in Shanghai for lung cancer." -> eventType=USER_REQUESTED_ACTION, target=hospital, modifier=request_action.');
    expect(prompt).toContain('"Which doctor should I see?" -> eventType=USER_REQUESTED_ACTION, target=hospital, modifier=request_action.');
    expect(prompt).toContain('"Recommend a doctor for my CT results." -> eventType=USER_REQUESTED_ACTION, target=hospital, modifier=request_action.');
    expect(prompt).toContain('Unclear messages -> eventType=USER_MESSAGE_UNCLEAR, target=unknown, modifier=unknown.');
    expect(prompt).toContain('Doctor matching belongs to target=hospital, not target=medical_advice.');
    expect(prompt).toContain('Do not add legacy out-of-scope or medical-advice event types for these scenarios.');
  });
});
