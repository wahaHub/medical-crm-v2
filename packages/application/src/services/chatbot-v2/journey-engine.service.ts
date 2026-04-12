import type { JourneySnapshot, JourneyTransitionDecision } from './types.js';

export class JourneyEngineService {
  advanceSnapshot(_current: JourneySnapshot, decision: JourneyTransitionDecision): JourneySnapshot {
    switch (decision.type) {
      case 'ENTER_EXPLAIN_PROCESS_ACTIVE':
        return {
          currentStage: 'EXPLAIN_PROCESS',
          currentPhase: 'active',
        };
      case 'ENTER_COLLECT_MEDICAL_INPUTS_PRE':
        return {
          currentStage: 'COLLECT_MEDICAL_INPUTS',
          currentPhase: 'pre',
        };
      case 'ENTER_COLLECT_MEDICAL_INPUTS_ACTIVE':
        return {
          currentStage: 'COLLECT_MEDICAL_INPUTS',
          currentPhase: 'active',
        };
      case 'ENTER_COLLECT_MEDICAL_INPUTS_POST':
        return {
          currentStage: 'COLLECT_MEDICAL_INPUTS',
          currentPhase: 'post',
        };
      case 'ENTER_RECOMMENDATION_PRE':
        return {
          currentStage: 'RECOMMENDATION',
          currentPhase: 'pre',
        };
      case 'ENTER_RECOMMENDATION_ACTIVE':
        return {
          currentStage: 'RECOMMENDATION',
          currentPhase: 'active',
        };
      case 'ENTER_RECOMMENDATION_POST':
        return {
          currentStage: 'RECOMMENDATION',
          currentPhase: 'post',
        };
      case 'ENTER_ONLINE_CONSULT_PRE':
        return {
          currentStage: 'ONLINE_CONSULT',
          currentPhase: 'pre',
        };
      case 'ENTER_ONLINE_CONSULT_ACTIVE':
        return {
          currentStage: 'ONLINE_CONSULT',
          currentPhase: 'active',
        };
      case 'ENTER_ONLINE_CONSULT_POST':
        return {
          currentStage: 'ONLINE_CONSULT',
          currentPhase: 'post',
        };
      case 'ENTER_HUMAN_HANDOFF_PRE':
        return {
          currentStage: 'HUMAN_HANDOFF',
          currentPhase: 'pre',
        };
      case 'ENTER_HUMAN_HANDOFF_ACTIVE':
        return {
          currentStage: 'HUMAN_HANDOFF',
          currentPhase: 'active',
        };
      case 'ENTER_HUMAN_HANDOFF_POST':
        return {
          currentStage: 'HUMAN_HANDOFF',
          currentPhase: 'post',
        };
      default: {
        const exhaustiveCheck: never = decision;
        return exhaustiveCheck;
      }
    }
  }
}
