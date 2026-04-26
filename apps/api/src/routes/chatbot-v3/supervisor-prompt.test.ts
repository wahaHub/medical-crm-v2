import { describe, expect, it } from 'vitest';
import { buildSupervisorPrompt } from './supervisor-prompt.js';

describe('buildSupervisorPrompt', () => {
  it('requires the full supervisor output contract including task fields', () => {
    const prompt = buildSupervisorPrompt({
      currentStage: 'COLLECT_MINIMAL_MEDICAL_FACTS',
      conversationSummary: 'The user just started and no recommendations have been shown.',
      latestUserMessage: 'Please recommend hospitals for me.',
      intake: {
        condition: 'lung cancer',
        targetDestination: 'Shanghai',
        language: 'en',
        gender: 'female',
      },
      availableReadDomains: ['records.status', 'recommendation.status'],
      conversationSummaryContract: {
        owner: 'runtime',
        refreshTrigger: 'after_final_assistant_response',
        sizeDiscipline: 'compact',
        freshness: 'latest_committed_turn',
        persistenceStrategy: 'persisted_with_session',
      },
    });

    expect(prompt).toContain('Required output keys: intent, suggestedStage.');
    expect(prompt).toContain('Optional keys: dispatchAgent, task, reason.');
    expect(prompt).toContain('For non-detour EXPLAIN_PROCESS progression, omit dispatchAgent and task.');
    expect(prompt).toContain('If task is present, it must include exactly: goal, latestUserMessage, necessaryFacts.');
    expect(prompt).toContain('requestedReadDomains');
    expect(prompt).toContain('Allowed intent values:');
    expect(prompt).toContain('Allowed dispatchAgent values when dispatchAgent is present:');
    expect(prompt).toContain('Available domain reads:');
    expect(prompt).toContain('records.status, recommendation.status');
  });

  it('renders fetched domain read results when runtime has already queried them', () => {
    const prompt = buildSupervisorPrompt({
      currentStage: 'RECOMMENDATION',
      conversationSummary: 'The user is waiting for recommendation refinement.',
      latestUserMessage: 'Can you compare hospitals again?',
      intake: {
        condition: 'lung cancer',
        targetDestination: 'Shanghai',
        language: 'en',
        gender: 'female',
      },
      availableReadDomains: ['recommendation.status'],
      domainReadResults: {
        'recommendation.status': {
          state: 'confirmed',
        },
      },
      conversationSummaryContract: {
        owner: 'runtime',
        refreshTrigger: 'after_final_assistant_response',
        sizeDiscipline: 'compact',
        freshness: 'latest_committed_turn',
        persistenceStrategy: 'persisted_with_session',
      },
    });

    expect(prompt).toContain('Fetched domain read results:');
    expect(prompt).toContain('"state":"confirmed"');
    expect(prompt).toContain('If fetched domain reads are already provided below');
  });

  it('surfaces the structured post-recommendation state for the supervisor prompt', () => {
    const prompt = buildSupervisorPrompt({
      currentStage: 'COLLECT_MEDICAL_INPUTS',
      conversationSummary: 'The user selected a hospital and has already uploaded supporting documents.',
      latestUserMessage: 'I uploaded another file.',
      intake: {
        condition: 'lung cancer',
        targetDestination: 'Shanghai',
        language: 'en',
        gender: 'female',
      },
      recommendationSelectionStatus: 'selected',
      recommendationSelectedHospitalIds: ['hospital-1'],
      processExplained: true,
      supportingDocuments: [
        {
          path: 'uploads/report-a.pdf',
          name: 'report-a.pdf',
        },
        {
          path: 'uploads/report-b.pdf',
          name: 'report-b.pdf',
        },
      ],
      availableReadDomains: ['records.status'],
      conversationSummaryContract: {
        owner: 'runtime',
        refreshTrigger: 'after_final_assistant_response',
        sizeDiscipline: 'compact',
        freshness: 'latest_committed_turn',
        persistenceStrategy: 'persisted_with_session',
      },
    });

    expect(prompt).toContain('Structured post-recommendation state:');
    expect(prompt).toContain('recommendation_selection_status=selected');
    expect(prompt).toContain('process.explained=true');
    expect(prompt).toContain('selected_hospital_ids=["hospital-1"]');
    expect(prompt).toContain('supporting_documents_count=2');
    expect(prompt).toContain('report-a.pdf');
    expect(prompt).toContain('report-b.pdf');
  });

  it('surfaces minimal triage summary as the sole triage-complete signal for routing', () => {
    const prompt = buildSupervisorPrompt({
      currentStage: 'COLLECT_MINIMAL_MEDICAL_FACTS',
      conversationSummary: 'The user just answered the triage follow-up in free-form text.',
      latestUserMessage: '1. 脑瘤，很疼 2. 半年前 3. 没有进行任何测试',
      intake: {
        condition: 'brain tumor',
        targetDestination: 'China',
        language: 'zh',
        gender: 'female',
      },
      minimalTriageAnswersSummary: '1. 脑瘤，很疼 2. 半年前 3. 没有进行任何测试',
      availableReadDomains: ['records.status', 'recommendation.status'],
      conversationSummaryContract: {
        owner: 'runtime',
        refreshTrigger: 'after_final_assistant_response',
        sizeDiscipline: 'compact',
        freshness: 'latest_committed_turn',
        persistenceStrategy: 'persisted_with_session',
      },
    });

    expect(prompt).toContain('minimal_triage_answers_summary=1. 脑瘤，很疼 2. 半年前 3. 没有进行任何测试');
    expect(prompt).toContain('If minimal_triage_answers_summary is non-empty and recommendation_selection_status=none, use intent=progression, suggestedStage=RECOMMENDATION, and dispatchAgent=RecommendationAgent.');
    expect(prompt).toContain('If the workflow is still gathering minimal triage follow-up and minimal_triage_answers_summary is empty');
    expect(prompt).toContain('Do not use EXPLAIN_PROCESS before recommendation_selection_status is selected or skipped');
  });

  it('uses a compact agent guide instead of the full registry dump', () => {
    const prompt = buildSupervisorPrompt({
      currentStage: 'COLLECT_MINIMAL_MEDICAL_FACTS',
      conversationSummary: 'The user just started and no recommendations have been shown.',
      latestUserMessage: 'Please recommend hospitals for me.',
      intake: {
        condition: 'lung cancer',
        targetDestination: 'Shanghai',
        language: 'en',
        gender: 'female',
      },
      availableReadDomains: ['records.status', 'recommendation.status'],
      conversationSummaryContract: {
        owner: 'runtime',
        refreshTrigger: 'after_final_assistant_response',
        sizeDiscipline: 'compact',
        freshness: 'latest_committed_turn',
        persistenceStrategy: 'persisted_with_session',
      },
    });

    expect(prompt).toContain('Compact agent guide:');
    expect(prompt).not.toContain('Supervisor-facing agent registry:');
  });

  it('documents the null-dispatch contract for normal explain-process progression', () => {
    const prompt = buildSupervisorPrompt({
      currentStage: 'RECOMMENDATION',
      conversationSummary: 'The user selected a hospital and needs the process overview.',
      latestUserMessage: 'What happens next?',
      intake: {
        condition: 'brain tumor',
        targetDestination: 'China',
        language: 'zh',
        gender: 'female',
      },
      availableReadDomains: ['records.status', 'recommendation.status'],
      conversationSummaryContract: {
        owner: 'runtime',
        refreshTrigger: 'after_final_assistant_response',
        sizeDiscipline: 'compact',
        freshness: 'latest_committed_turn',
        persistenceStrategy: 'persisted_with_session',
      },
    });

    expect(prompt).toContain('Allowed dispatchAgent values when dispatchAgent is present:');
    expect(prompt).toContain('For normal progression into EXPLAIN_PROCESS, omit dispatchAgent and task.');
    expect(prompt).toContain('Use FaqAgent inside EXPLAIN_PROCESS only for a real FAQ/resource detour');
  });
});
