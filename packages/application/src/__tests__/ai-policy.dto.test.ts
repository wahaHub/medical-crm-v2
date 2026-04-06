import { describe, expect, it } from 'vitest';
import {
  AI_POLICY_ENGAGEMENT_SIGNALS,
  AI_POLICY_PROGRESSION_SIGNALS,
  AI_POLICY_RECOMMENDATION_SIGNALS,
  AI_POLICY_RESOLVED_INTENTS,
} from '../index.js';

describe('application ai-policy public exports', () => {
  it('re-exports the canonical semantic enum constants from the package root', () => {
    expect(AI_POLICY_RESOLVED_INTENTS).toEqual([
      'GENERAL_INFO',
      'ASK_MEDICAL_TRAVEL_PROCESS',
      'ASK_CONSULT_PROCESS',
      'ASK_FOR_DOCTOR_OR_HOSPITAL_DIRECTION',
      'ASK_FOR_HOSPITAL_RECOMMENDATION',
      'REQUEST_DOC_UPLOAD',
      'ACCEPT_DOC_UPLOAD',
      'ACCEPT_ONLINE_CONSULT_INVITE',
      'REQUEST_HUMAN_HANDOFF',
      'ASK_PACKAGE_INFO',
      'SMALL_TALK_OR_GREETING',
      'UNKNOWN',
    ]);

    expect(AI_POLICY_ENGAGEMENT_SIGNALS).toEqual([
      'LIGHT_DISCOVERY',
      'QUALIFIED_EXPLORATION',
      'DEEP_WORKFLOW',
    ]);

    expect(AI_POLICY_PROGRESSION_SIGNALS).toEqual([
      'NONE',
      'CURIOUS',
      'OPEN_TO_NEXT_STEP',
      'READY_TO_PROCEED',
      'EXPLICITLY_COMMITTING',
    ]);

    expect(AI_POLICY_RECOMMENDATION_SIGNALS).toEqual([
      'NONE',
      'SEEKING_DIRECTION',
      'SEEKING_RECOMMENDATION',
      'READY_FOR_RECOMMENDATION',
    ]);
  });
});
