import { describe, expect, it } from 'vitest';
import { StageCopyRegistryService } from '../../chatbot-v2/stage-copy-registry.service.js';

describe('StageCopyRegistryService', () => {
  const service = new StageCopyRegistryService();

  it('returns a canonical pre-stage reference for collect medical inputs', () => {
    expect(service.resolve({
      currentStage: 'COLLECT_MEDICAL_INPUTS',
      currentPhase: 'pre',
    })).toEqual(expect.objectContaining({
      stage: 'COLLECT_MEDICAL_INPUTS',
      phase: 'pre',
      referenceText: expect.stringContaining('gather the patient medical inputs'),
    }));
  });

  it('returns null for EXPLAIN_PROCESS.active because that stage does not use pre/post fixed copy', () => {
    expect(service.resolve({
      currentStage: 'EXPLAIN_PROCESS',
      currentPhase: 'active',
    })).toBeNull();
  });

  it('states that ONLINE_CONSULT.pre is a required step that cannot be dismissed', () => {
    expect(service.resolve({
      currentStage: 'ONLINE_CONSULT',
      currentPhase: 'pre',
    })).toEqual(expect.objectContaining({
      stage: 'ONLINE_CONSULT',
      phase: 'pre',
      referenceText: expect.stringMatching(/required|cannot be skipped|cannot be dismissed/i),
    }));
  });

  it('confirms in HUMAN_HANDOFF.post that the case has been sent to the administrator team', () => {
    expect(service.resolve({
      currentStage: 'HUMAN_HANDOFF',
      currentPhase: 'post',
    })).toEqual(expect.objectContaining({
      stage: 'HUMAN_HANDOFF',
      phase: 'post',
      referenceText: expect.stringMatching(/24 hours|administrator|human team/i),
    }));
  });
});
