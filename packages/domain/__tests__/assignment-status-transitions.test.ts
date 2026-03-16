import { describe, it, expect } from 'vitest';
import { ASSIGNMENT_STATUS_TRANSITIONS } from '../src/state-machine/assignment-status-transitions.js';

describe('assignment-status-transitions', () => {
  it('allows UNASSIGNED → ASSIGNED', () => {
    expect(ASSIGNMENT_STATUS_TRANSITIONS['UNASSIGNED']).toContain('ASSIGNED');
  });
  it('allows ASSIGNED → UNASSIGNED (admin reset)', () => {
    expect(ASSIGNMENT_STATUS_TRANSITIONS['ASSIGNED']).toContain('UNASSIGNED');
  });
});
