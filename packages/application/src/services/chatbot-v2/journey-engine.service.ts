import type { JourneySnapshot, JourneyTransitionEvent, JourneyTruth } from './types.js';

export class JourneyEngineService {
  deriveSnapshot(truth: JourneyTruth): JourneySnapshot {
    if (truth.humanHandoffActive) {
      return {
        currentStage: 'HUMAN_HANDOFF',
        currentPhase: 'active',
      };
    }

    if (truth.onlineConsultSubmitted) {
      return {
        currentStage: 'ONLINE_CONSULT',
        currentPhase: 'post',
      };
    }

    if (truth.onlineConsultStarted) {
      return {
        currentStage: 'ONLINE_CONSULT',
        currentPhase: 'active',
      };
    }

    if (truth.recommendationConfirmed) {
      return {
        currentStage: truth.onlineConsultRequired ? 'ONLINE_CONSULT' : 'RECOMMENDATION',
        currentPhase: truth.onlineConsultRequired ? 'active' : 'post',
      };
    }

    if (truth.recommendationAvailable || truth.medicalInputsSubmitted) {
      return {
        currentStage: 'RECOMMENDATION',
        currentPhase: 'active',
      };
    }

    if (truth.medicalInputsStarted) {
      return {
        currentStage: 'COLLECT_MEDICAL_INPUTS',
        currentPhase: 'active',
      };
    }

    return {
      currentStage: 'EXPLAIN_PROCESS',
      currentPhase: 'active',
    };
  }

  advanceSnapshot(current: JourneySnapshot, event: JourneyTransitionEvent): JourneySnapshot {
    if (event.type === 'REQUEST_HUMAN_HANDOFF') {
      return {
        currentStage: 'HUMAN_HANDOFF',
        currentPhase: 'pre',
      };
    }

    if (event.type === 'START_MEDICAL_INPUTS' && current.currentStage === 'EXPLAIN_PROCESS') {
      return {
        currentStage: 'COLLECT_MEDICAL_INPUTS',
        currentPhase: 'pre',
      };
    }

    return current;
  }
}
