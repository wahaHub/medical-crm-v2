import { describe, expect, it } from 'vitest';
import {
  SUPERVISOR_EVENT_TYPES,
  getAllowedSupervisorEvents,
  type DomainFacts,
  type JourneyReduction,
  type JourneyState,
  type NextAction,
  type SupervisorEvent,
} from '../../chatbot-v3/supervisor-event.types.js';

describe('supervisor-event.types', () => {
  it('defines generic semantic supervisor events and retires legacy semantic names', () => {
    expect(SUPERVISOR_EVENT_TYPES).toEqual(expect.arrayContaining([
      'TRIAGE_SUBMITTED',
      'TRIAGE_SKIPPED',
      'RECOMMENDATION_SELECTED',
      'RECOMMENDATION_SKIPPED',
      'DOCUMENTS_UPLOADED',
      'USER_EXPRESSED_NEED',
      'USER_ASKED_QUESTION',
      'USER_PROVIDED_INFORMATION',
      'USER_RESPONDED_TO_REQUEST',
      'USER_REQUESTED_HUMAN',
      'USER_ASKED_RISKY_MEDICAL_ADVICE',
      'USER_ASKED_OUT_OF_SCOPE_OR_RESTRICTED_SERVICE',
      'USER_MESSAGE_UNCLEAR',
    ]));

    expect(SUPERVISOR_EVENT_TYPES).not.toContain('USER_ASKED_FAQ');
    expect(SUPERVISOR_EVENT_TYPES).not.toContain('USER_ASKED_NEXT_STEP');
    expect(SUPERVISOR_EVENT_TYPES).not.toContain('USER_WANTS_TREATMENT_IN_CHINA');
    expect(SUPERVISOR_EVENT_TYPES).not.toContain('USER_PROVIDED_CONTACT_INFO');
    expect(SUPERVISOR_EVENT_TYPES).not.toContain('UNKNOWN_MESSAGE');
  });

  it('supports generic event targets and modifiers on semantic events', () => {
    const event: SupervisorEvent = {
      eventType: 'USER_ASKED_QUESTION',
      target: 'pricing',
      modifier: 'ask',
      confidence: 0.92,
      source: 'llm',
    };

    expect(event.target).toBe('pricing');
    expect(event.modifier).toBe('ask');
  });

  it('supports reducer-native control-plane shapes without legacy proposal authority', () => {
    const event: SupervisorEvent = {
      eventType: 'TRIAGE_SUBMITTED',
      confidence: 1,
      source: 'deterministic',
      metadata: {
        rawText: 'brain tumor, severe pain',
      },
    };
    const state: JourneyState = { primaryStage: 'COLLECT_MINIMAL_MEDICAL_FACTS' };
    const action: NextAction = { type: 'GENERATE_RECOMMENDATION' };
    const facts: DomainFacts = {
      language: 'zh',
      intake: { minimalTriageStatus: 'submitted' },
      recommendation: { status: 'none', selectedHospitalIds: [] },
      process: { explained: false },
      records: {
        supportingDocumentsCount: 0,
        availableDocumentTypes: [],
        missingDocumentTypes: [],
      },
      consult: { status: 'not_started' },
      handoff: { active: false },
    };
    const reduction: JourneyReduction = {
      state,
      facts,
      nextAction: action,
      reasonCode: 'TRIAGE_SUBMITTED_RECOMMENDATION_READY',
      isSidePath: false,
      sidePathType: 'none',
      primaryStagePreserved: false,
    };

    expect(SUPERVISOR_EVENT_TYPES).toContain('TRIAGE_SUBMITTED');
    expect(event.eventType).toBe('TRIAGE_SUBMITTED');
    expect(state.primaryStage).toBe('COLLECT_MINIMAL_MEDICAL_FACTS');
    expect(action.type).toBe('GENERATE_RECOMMENDATION');
    expect(facts.intake.minimalTriageStatus).toBe('submitted');
    expect({ type: 'SHOW_PROCESS_OVERVIEW' } satisfies NextAction).toEqual({
      type: 'SHOW_PROCESS_OVERVIEW',
    });
    expect({ type: 'CREATE_HANDOFF' } satisfies NextAction).toEqual({ type: 'CREATE_HANDOFF' });
    expect(reduction.reasonCode).toBe('TRIAGE_SUBMITTED_RECOMMENDATION_READY');
  });

  it('does not expose highIntentSignal in Phase 1 event metadata', () => {
    const allowedMetadataKeys = [
      'topic',
      'subtopic',
      'condition',
      'destination',
      'urgency',
      'extractedFacts',
      'selectedHospitalIds',
      'documentCount',
      'riskType',
      'redirectTarget',
      'rawText',
    ];

    expect(allowedMetadataKeys).not.toContain('highIntentSignal');
  });

  it('allows generic semantic events across stages', () => {
    expect(SUPERVISOR_EVENT_TYPES).toContain('USER_RESPONDED_TO_REQUEST');
    expect(SUPERVISOR_EVENT_TYPES).toContain('USER_PROVIDED_INFORMATION');

    expect(getAllowedSupervisorEvents({ currentStage: 'COLLECT_MEDICAL_INPUTS' })).toEqual(expect.arrayContaining([
      'USER_RESPONDED_TO_REQUEST',
      'USER_PROVIDED_INFORMATION',
      'USER_ASKED_QUESTION',
    ]));
    expect(getAllowedSupervisorEvents({ currentStage: 'HUMAN_HANDOFF' })).toEqual(expect.arrayContaining([
      'USER_RESPONDED_TO_REQUEST',
      'USER_PROVIDED_INFORMATION',
      'USER_ASKED_QUESTION',
    ]));
  });
});
