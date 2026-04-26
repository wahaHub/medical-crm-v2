import { describe, expect, it } from 'vitest';
import { buildReadPlan } from '../../chatbot-v3/read-planner.js';

describe('buildReadPlan', () => {
  it('maps FAQ answers to FAQ knowledge reads', () => {
    const plan = buildReadPlan({ type: 'ANSWER_FAQ', topic: 'pricing', subtopic: 'deposit' });

    expect(plan.domains).toContain('knowledge.faq');
    expect(plan.reasonCode).toBe('answer_faq');
    expect(plan.params).toMatchObject({ topic: 'pricing', subtopic: 'deposit' });
  });

  it('maps recommendation generation to deterministic recommendation reads', () => {
    const plan = buildReadPlan({ type: 'GENERATE_RECOMMENDATION' });

    expect(plan.domains).toContain('records.summary');
    expect(plan.domains).toContain('hospital.catalog');
    expect(plan.reasonCode).toBe('generate_recommendation');
  });
});
