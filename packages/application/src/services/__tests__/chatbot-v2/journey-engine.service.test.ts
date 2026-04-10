import { describe, expect, it } from 'vitest';
import { JourneyEngineService } from '../../chatbot-v2/journey-engine.service.js';

describe('JourneyEngineService', () => {
  const service = new JourneyEngineService();

  it('starts a brand-new case at EXPLAIN_PROCESS.active', () => {
    expect(service.deriveSnapshot({
      medicalInputsStarted: false,
      medicalInputsSubmitted: false,
      recommendationAvailable: false,
      recommendationConfirmed: false,
      onlineConsultRequired: false,
      onlineConsultStarted: false,
      onlineConsultSubmitted: false,
      humanHandoffActive: false,
      humanHandoffSubmitted: false,
    })).toEqual({
      currentStage: 'EXPLAIN_PROCESS',
      currentPhase: 'active',
    });
  });

  it('restores COLLECT_MEDICAL_INPUTS.active when intake has started but is not yet submitted', () => {
    expect(service.deriveSnapshot({
      medicalInputsStarted: true,
      medicalInputsSubmitted: false,
      recommendationAvailable: false,
      recommendationConfirmed: false,
      onlineConsultRequired: false,
      onlineConsultStarted: false,
      onlineConsultSubmitted: false,
      humanHandoffActive: false,
      humanHandoffSubmitted: false,
    })).toEqual({
      currentStage: 'COLLECT_MEDICAL_INPUTS',
      currentPhase: 'active',
    });
  });

  it('can transition into COLLECT_MEDICAL_INPUTS.pre when progression begins', () => {
    expect(service.advanceSnapshot(
      {
        currentStage: 'EXPLAIN_PROCESS',
        currentPhase: 'active',
      },
      { type: 'START_MEDICAL_INPUTS' },
    )).toEqual({
      currentStage: 'COLLECT_MEDICAL_INPUTS',
      currentPhase: 'pre',
    });
  });

  it('moves to RECOMMENDATION.active once medical inputs are submitted', () => {
    expect(service.deriveSnapshot({
      medicalInputsStarted: true,
      medicalInputsSubmitted: true,
      recommendationAvailable: false,
      recommendationConfirmed: false,
      onlineConsultRequired: false,
      onlineConsultStarted: false,
      onlineConsultSubmitted: false,
      humanHandoffActive: false,
      humanHandoffSubmitted: false,
    })).toEqual({
      currentStage: 'RECOMMENDATION',
      currentPhase: 'active',
    });
  });

  it('restores RECOMMENDATION.active when recommendation content has already been shown', () => {
    expect(service.deriveSnapshot({
      medicalInputsStarted: false,
      medicalInputsSubmitted: false,
      recommendationAvailable: true,
      recommendationConfirmed: false,
      onlineConsultRequired: false,
      onlineConsultStarted: false,
      onlineConsultSubmitted: false,
      humanHandoffActive: false,
      humanHandoffSubmitted: false,
    })).toEqual({
      currentStage: 'RECOMMENDATION',
      currentPhase: 'active',
    });
  });

  it('keeps package-style flows in RECOMMENDATION.post when consult is skipped', () => {
    expect(service.deriveSnapshot({
      medicalInputsStarted: true,
      medicalInputsSubmitted: true,
      recommendationAvailable: true,
      recommendationConfirmed: true,
      onlineConsultRequired: false,
      onlineConsultStarted: false,
      onlineConsultSubmitted: false,
      humanHandoffActive: false,
      humanHandoffSubmitted: false,
    })).toEqual({
      currentStage: 'RECOMMENDATION',
      currentPhase: 'post',
    });
  });

  it('restores ONLINE_CONSULT.active when the consult stage has been opened but not yet submitted', () => {
    expect(service.deriveSnapshot({
      medicalInputsStarted: true,
      medicalInputsSubmitted: true,
      recommendationAvailable: true,
      recommendationConfirmed: true,
      onlineConsultRequired: true,
      onlineConsultStarted: true,
      onlineConsultSubmitted: false,
      humanHandoffActive: false,
      humanHandoffSubmitted: false,
    })).toEqual({
      currentStage: 'ONLINE_CONSULT',
      currentPhase: 'active',
    });
  });

  it('does not let completed historical handoff override a newer consult stage', () => {
    expect(service.deriveSnapshot({
      medicalInputsStarted: true,
      medicalInputsSubmitted: true,
      recommendationAvailable: true,
      recommendationConfirmed: false,
      onlineConsultRequired: true,
      onlineConsultStarted: true,
      onlineConsultSubmitted: false,
      humanHandoffActive: false,
      humanHandoffSubmitted: true,
    })).toEqual({
      currentStage: 'ONLINE_CONSULT',
      currentPhase: 'active',
    });
  });

  it('still restores HUMAN_HANDOFF.active while a handoff is currently open', () => {
    expect(service.deriveSnapshot({
      medicalInputsStarted: true,
      medicalInputsSubmitted: true,
      recommendationAvailable: true,
      recommendationConfirmed: false,
      onlineConsultRequired: true,
      onlineConsultStarted: true,
      onlineConsultSubmitted: false,
      humanHandoffActive: true,
      humanHandoffSubmitted: true,
    })).toEqual({
      currentStage: 'HUMAN_HANDOFF',
      currentPhase: 'active',
    });
  });

  it('transitions any stage into HUMAN_HANDOFF.pre when a formal handoff is requested', () => {
    expect(service.advanceSnapshot(
      {
        currentStage: 'COLLECT_MEDICAL_INPUTS',
        currentPhase: 'active',
      },
      { type: 'REQUEST_HUMAN_HANDOFF' },
    )).toEqual({
      currentStage: 'HUMAN_HANDOFF',
      currentPhase: 'pre',
    });
  });
});
