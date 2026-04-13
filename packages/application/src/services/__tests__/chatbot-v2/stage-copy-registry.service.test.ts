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

  it('returns fixed copy for EXPLAIN_PROCESS.pre to support the first introductory answer', () => {
    expect(service.resolve({
      currentStage: 'EXPLAIN_PROCESS',
      currentPhase: 'pre',
    })).toEqual(expect.objectContaining({
      stage: 'EXPLAIN_PROCESS',
      phase: 'pre',
      referenceText: expect.stringContaining('what the service does'),
    }));
    expect(service.resolve({
      currentStage: 'EXPLAIN_PROCESS',
      currentPhase: 'pre',
    })?.referenceText).toMatch(/if you'd like|next i can walk you through/i);
  });

  it('returns fixed copy for EXPLAIN_PROCESS.active to support the mandatory process explanation step', () => {
    expect(service.resolve({
      currentStage: 'EXPLAIN_PROCESS',
      currentPhase: 'active',
    })).toEqual(expect.objectContaining({
      stage: 'EXPLAIN_PROCESS',
      phase: 'active',
      referenceText: expect.stringContaining('overall medical journey'),
    }));
    expect(service.resolve({
      currentStage: 'EXPLAIN_PROCESS',
      currentPhase: 'active',
    })?.referenceText).toMatch(/before formal recommendations/i);
    expect(service.resolve({
      currentStage: 'EXPLAIN_PROCESS',
      currentPhase: 'active',
    })?.referenceText).toMatch(/next step is collecting medical information/i);
  });

  it('supports both submitted and dismissed confirmation language in COLLECT_MEDICAL_INPUTS.post', () => {
    expect(service.resolve({
      currentStage: 'COLLECT_MEDICAL_INPUTS',
      currentPhase: 'post',
    })).toEqual(expect.objectContaining({
      stage: 'COLLECT_MEDICAL_INPUTS',
      phase: 'post',
      referenceText: expect.stringContaining('received'),
    }));
    expect(service.resolve({
      currentStage: 'COLLECT_MEDICAL_INPUTS',
      currentPhase: 'post',
    })?.referenceText).toMatch(/chose not to submit right now|dismissed/i);
    expect(service.resolve({
      currentStage: 'COLLECT_MEDICAL_INPUTS',
      currentPhase: 'post',
    })?.referenceText).toMatch(/come back later/i);
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
