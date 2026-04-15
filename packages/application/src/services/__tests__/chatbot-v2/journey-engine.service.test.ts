import { describe, expect, it } from 'vitest';
import { JourneyEngineService } from '../../chatbot-v2/journey-engine.service.js';

describe('JourneyEngineService', () => {
  const service = new JourneyEngineService();

  it('enters COLLECT_MEDICAL_INPUTS.pre from an explain-stage decision', () => {
    expect(service.advanceSnapshot(
      {
        currentStage: 'EXPLAIN_PROCESS',
        currentPhase: 'active',
      },
      { type: 'ENTER_COLLECT_MEDICAL_INPUTS_PRE' },
    )).toEqual({
      currentStage: 'COLLECT_MEDICAL_INPUTS',
      currentPhase: 'pre',
    });
  });

  it('can move COLLECT_MEDICAL_INPUTS from pre to active', () => {
    expect(service.advanceSnapshot(
      {
        currentStage: 'COLLECT_MEDICAL_INPUTS',
        currentPhase: 'pre',
      },
      { type: 'ENTER_COLLECT_MEDICAL_INPUTS_ACTIVE' },
    )).toEqual({
      currentStage: 'COLLECT_MEDICAL_INPUTS',
      currentPhase: 'active',
    });
  });

  it('can move COLLECT_MEDICAL_INPUTS from active to post', () => {
    expect(service.advanceSnapshot(
      {
        currentStage: 'COLLECT_MEDICAL_INPUTS',
        currentPhase: 'active',
      },
      { type: 'ENTER_COLLECT_MEDICAL_INPUTS_POST' },
    )).toEqual({
      currentStage: 'COLLECT_MEDICAL_INPUTS',
      currentPhase: 'post',
    });
  });

  it('can enter RECOMMENDATION.pre after intake is complete', () => {
    expect(service.advanceSnapshot(
      {
        currentStage: 'COLLECT_MEDICAL_INPUTS',
        currentPhase: 'post',
      },
      { type: 'ENTER_RECOMMENDATION_PRE' },
    )).toEqual({
      currentStage: 'RECOMMENDATION',
      currentPhase: 'pre',
    });
  });

  it('can move RECOMMENDATION from pre to active', () => {
    expect(service.advanceSnapshot(
      {
        currentStage: 'RECOMMENDATION',
        currentPhase: 'pre',
      },
      { type: 'ENTER_RECOMMENDATION_ACTIVE' },
    )).toEqual({
      currentStage: 'RECOMMENDATION',
      currentPhase: 'active',
    });
  });

  it('can move RECOMMENDATION from active to post', () => {
    expect(service.advanceSnapshot(
      {
        currentStage: 'RECOMMENDATION',
        currentPhase: 'active',
      },
      { type: 'ENTER_RECOMMENDATION_POST' },
    )).toEqual({
      currentStage: 'RECOMMENDATION',
      currentPhase: 'post',
    });
  });

  it('can enter ONLINE_CONSULT.pre after recommendation is complete', () => {
    expect(service.advanceSnapshot(
      {
        currentStage: 'RECOMMENDATION',
        currentPhase: 'post',
      },
      { type: 'ENTER_ONLINE_CONSULT_PRE' },
    )).toEqual({
      currentStage: 'ONLINE_CONSULT',
      currentPhase: 'pre',
    });
  });

  it('can move ONLINE_CONSULT from pre to active', () => {
    expect(service.advanceSnapshot(
      {
        currentStage: 'ONLINE_CONSULT',
        currentPhase: 'pre',
      },
      { type: 'ENTER_ONLINE_CONSULT_ACTIVE' },
    )).toEqual({
      currentStage: 'ONLINE_CONSULT',
      currentPhase: 'active',
    });
  });

  it('can move ONLINE_CONSULT from active to post', () => {
    expect(service.advanceSnapshot(
      {
        currentStage: 'ONLINE_CONSULT',
        currentPhase: 'active',
      },
      { type: 'ENTER_ONLINE_CONSULT_POST' },
    )).toEqual({
      currentStage: 'ONLINE_CONSULT',
      currentPhase: 'post',
    });
  });

  it('can enter HUMAN_HANDOFF.pre from any stage', () => {
    expect(service.advanceSnapshot(
      {
        currentStage: 'RECOMMENDATION',
        currentPhase: 'active',
      },
      { type: 'ENTER_HUMAN_HANDOFF_PRE' },
    )).toEqual({
      currentStage: 'HUMAN_HANDOFF',
      currentPhase: 'pre',
    });
  });

  it('can move HUMAN_HANDOFF from pre to active', () => {
    expect(service.advanceSnapshot(
      {
        currentStage: 'HUMAN_HANDOFF',
        currentPhase: 'pre',
      },
      { type: 'ENTER_HUMAN_HANDOFF_ACTIVE' },
    )).toEqual({
      currentStage: 'HUMAN_HANDOFF',
      currentPhase: 'active',
    });
  });

  it('can move HUMAN_HANDOFF from active to post', () => {
    expect(service.advanceSnapshot(
      {
        currentStage: 'HUMAN_HANDOFF',
        currentPhase: 'active',
      },
      { type: 'ENTER_HUMAN_HANDOFF_POST' },
    )).toEqual({
      currentStage: 'HUMAN_HANDOFF',
      currentPhase: 'post',
    });
  });
});
