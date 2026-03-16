import { describe, it, expect } from 'vitest';
import { TREATMENT_STAGE_TRANSITIONS } from '../src/state-machine/treatment-stage-transitions.js';

describe('treatment-stage-transitions', () => {
  it('allows CONFIRMED → IN_TREATMENT', () => {
    expect(TREATMENT_STAGE_TRANSITIONS['CONFIRMED']).toContain('IN_TREATMENT');
  });
  it('allows IN_TREATMENT → POST_TREATMENT', () => {
    expect(TREATMENT_STAGE_TRANSITIONS['IN_TREATMENT']).toContain('POST_TREATMENT');
  });
  it('allows POST_TREATMENT → COMPLETED', () => {
    expect(TREATMENT_STAGE_TRANSITIONS['POST_TREATMENT']).toContain('COMPLETED');
  });
  it('allows COMPLETED → FOLLOW_UP', () => {
    expect(TREATMENT_STAGE_TRANSITIONS['COMPLETED']).toContain('FOLLOW_UP');
  });
  it('allows FOLLOW_UP → IN_TREATMENT (restart loop)', () => {
    expect(TREATMENT_STAGE_TRANSITIONS['FOLLOW_UP']).toContain('IN_TREATMENT');
  });
});
