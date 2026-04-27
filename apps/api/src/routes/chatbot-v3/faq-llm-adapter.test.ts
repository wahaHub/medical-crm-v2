import { describe, expect, it, vi } from 'vitest';
import { FaqAgent } from './agents.js';
import { FaqLlmAdapter } from './faq-llm-adapter.js';
import { buildFaqAnswerPrompt, buildFaqPlanPrompt } from './faq-prompts.js';
import { createToolGateway } from './tool-gateway.js';
import { resolveFaqTaskPolicy, type FaqWorkerTask } from './worker-task.js';
import {
  FAQ_ANSWER_EVAL_FIXTURES,
} from './__fixtures__/degraded-path.fixtures.js';

function createFaqTask(latestUserMessage: string): FaqWorkerTask {
  return {
    agent: 'FaqAgent',
    fromStage: 'EXPLAIN_PROCESS',
    toStage: 'EXPLAIN_PROCESS',
    latestUserMessage,
    intent: 'faq',
    supervisorReason: 'user is asking an faq question',
  };
}

describe('FaqLlmAdapter', () => {
  it('keeps the FAQ degraded-path fixture set complete', () => {
    expect(FAQ_ANSWER_EVAL_FIXTURES.map((fixture) => fixture.id)).toEqual([
      'faq-degraded-fallback-no-grounding',
      'faq-low-confidence-grounded-answer',
    ]);
  });

  it('falls back to a deterministic plan when the plan output is invalid', async () => {
    const adapter = new FaqLlmAdapter({
      plan: {
        promptVersion: 'faq-plan-test',
        run: vi.fn(async () => ({
          category: 123,
          query: '',
          reason: null,
        })),
      },
    });

    await expect(adapter.plan({
      task: createFaqTask('How long does online consultation take to arrange?'),
    })).resolves.toEqual({
      query: 'How long does online consultation take to arrange?',
      reason: expect.stringContaining('fallback'),
    });
    expect(adapter.getLastRunMetadata()).toMatchObject({
      nodePromptVersion: 'faq-plan-test',
      fallbackUsed: true,
      schemaValidationFailed: true,
    });
  });

  it('marks citation fallback as schema validation failure in answer metadata', async () => {
    const adapter = new FaqLlmAdapter({
      answer: {
        promptVersion: 'faq-answer-test',
        model: 'gpt-4o-mini',
        run: vi.fn(async () => ({
          answer: 'Grounded answer',
          citedFaqIds: 'faq-1',
          confidence: 'high',
        })),
      },
    });

    await expect(adapter.answer({
      task: createFaqTask('How long does online consultation take to arrange?'),
      plan: {
        query: 'online consultation timing',
        reason: 'timing faq',
      },
      matches: [{
        id: 'faq-1',
        question: 'How long does online consultation take?',
        answer: 'Online consultations are usually arranged within 24 hours.',
        category: 'Consultation',
      }],
      details: [],
    })).resolves.toEqual({
      answer: 'Grounded answer',
      citedFaqIds: ['faq-1'],
      confidence: 'high',
    });
    expect(adapter.getLastRunMetadata()).toMatchObject({
      nodePromptVersion: 'faq-answer-test',
      nodeModel: 'gpt-4o-mini',
      fallbackUsed: true,
      schemaValidationFailed: true,
    });
  });

  it.each(FAQ_ANSWER_EVAL_FIXTURES)('$id', async (fixture) => {
    const adapter = new FaqLlmAdapter({
      answer: {
        promptVersion: `faq-answer-fixture:${fixture.id}`,
        run: vi.fn(async () => fixture.rawAnswer),
      },
    });

    await expect(adapter.answer({
      task: createFaqTask(fixture.latestUserMessage),
      plan: {
        query: fixture.latestUserMessage,
        reason: fixture.bucket,
      },
      matches: fixture.matches,
      details: fixture.details,
    })).resolves.toEqual(fixture.expected);

    expect(adapter.getLastRunMetadata()).toMatchObject({
      nodePromptVersion: `faq-answer-fixture:${fixture.id}`,
      fallbackUsed: fixture.expectedMetadata.fallbackUsed,
      schemaValidationFailed: fixture.expectedMetadata.schemaValidationFailed,
    });
  });

  it('passes safety redirect task rules through FAQ prompts', () => {
    const task: FaqWorkerTask = {
      ...createFaqTask('能不能保证治好？'),
      ...resolveFaqTaskPolicy({
        type: 'SAFE_MEDICAL_REDIRECT',
        riskType: 'guarantee_outcome',
      }),
    };

    expect(buildFaqPlanPrompt({ task })).toContain('response_mode=safe_medical_redirect');
    expect(buildFaqAnswerPrompt({
      task,
      plan: { query: 'guarantee outcome', reason: 'safety redirect' },
      matches: [],
      details: [],
    })).toContain('output_rules=do_not_diagnose, do_not_recommend_medication, do_not_guarantee_outcome, mention_emergency_care_when_urgent, ask_one_safe_next_step');
  });

  it('falls back with business-boundary redirect copy for out-of-scope tasks without FAQ matches', async () => {
    const adapter = new FaqLlmAdapter();
    const task: FaqWorkerTask = {
      ...createFaqTask('你们能不能帮我办美国绿卡？'),
      ...resolveFaqTaskPolicy({
        type: 'OUT_OF_SCOPE_REDIRECT',
        redirectTarget: 'US green card',
      }),
    };

    await expect(adapter.answer({
      task,
      plan: { query: 'US green card', reason: 'out of scope redirect' },
      matches: [],
      details: [],
    })).resolves.toEqual({
      answer: expect.stringContaining('Medora'),
      citedFaqIds: [],
      confidence: 'medium',
      policyGrounded: true,
    });
    expect(task.outputRules).toEqual(expect.arrayContaining([
      'do_not_claim_we_can_help_with_unsupported_service',
      'preserve_primary_stage',
    ]));
  });

  it('passes rejection and hesitation task rules through FAQ prompts', () => {
    const task: FaqWorkerTask = {
      ...createFaqTask('太贵了，我先考虑一下'),
      ...resolveFaqTaskPolicy({
        type: 'ANSWER_FAQ',
        topic: 'other',
        subtopic: 'rejection_or_hesitation',
      }),
    };

    expect(buildFaqPlanPrompt({ task })).toContain('response_mode=rejection_or_hesitation');
    expect(buildFaqAnswerPrompt({
      task,
      plan: { query: 'hesitation', reason: 'rejection side path' },
      matches: [],
      details: [],
    })).toContain('output_rules=acknowledge_without_pressure, preserve_primary_stage, offer_one_lower_friction_next_step');
  });
});

describe('FaqAgent', () => {
  it('lets the FAQ worker choose category and query, then calls faq tools before returning an answer', async () => {
    const categorySearch = vi.fn(async () => ({
      categories: [{ name: 'Online Consultation', sortOrder: 1 }],
    }));
    const search = vi.fn(async () => ({
      hits: [{
        id: 'faq-1',
        question: 'How long does online consultation take?',
        answer: 'Online consultations are usually arranged within 24 hours.',
        category: 'Online Consultation',
      }],
    }));
    const getByIds = vi.fn(async () => ({
      items: [{
        id: 'faq-1',
        question: 'How long does online consultation take?',
        answer: 'Online consultations are usually arranged within 24 hours.',
        category: 'Online Consultation',
      }],
    }));
    const gateway = createToolGateway({
      handlers: {
        faq: {
          categorySearch,
          search,
          getByIds,
        },
      },
    });
    const adapter = new FaqLlmAdapter({
      plan: {
        promptVersion: 'faq-plan-test',
        run: vi.fn(async () => ({
          query: 'online consultation timing',
          reason: 'user is asking about timing',
        })),
      },
      answer: {
        promptVersion: 'faq-answer-test',
        run: vi.fn(async ({ details }) => ({
          answer: details[0].answer,
          citedFaqIds: [details[0].id],
          confidence: 'high',
        })),
      },
    });
    const agent = new FaqAgent(gateway, adapter);

    const result = await agent.execute({
      type: 'faq.answer',
      input: {
        latestUserMessage: 'How long does online consultation take to arrange?',
        sessionId: 'session-faq-1',
        hospitalId: 'hospital-123',
      },
      meta: {
        task: createFaqTask('How long does online consultation take to arrange?'),
      },
    });

    expect(categorySearch).toHaveBeenCalledWith({
      hospitalId: 'hospital-123',
      query: 'online consultation timing',
      sessionId: 'session-faq-1',
    }, expect.any(Object));
    expect(search).toHaveBeenCalledWith({
      category: 'Online Consultation',
      hospitalId: 'hospital-123',
      query: 'online consultation timing',
      sessionId: 'session-faq-1',
    }, expect.any(Object));
    expect(getByIds).toHaveBeenCalledWith({
      hospitalId: 'hospital-123',
      ids: ['faq-1'],
      sessionId: 'session-faq-1',
    }, expect.any(Object));
    expect(result).toEqual({
      status: 'ok',
      data: {
        answer: 'Online consultations are usually arranged within 24 hours.',
        citedFaqIds: ['faq-1'],
        confidence: 'high',
      },
    });
  });

  it('falls back safely when the faq answer output is invalid', async () => {
    const gateway = createToolGateway({
      handlers: {
        faq: {
          search: vi.fn(async () => ({
            hits: [{
              id: 'faq-2',
              question: 'Can I schedule a consult after records review?',
              answer: 'Yes. We can help arrange the consult after your records are reviewed.',
              category: 'Online Consultation',
            }],
          })),
        },
      },
    });
    const adapter = new FaqLlmAdapter({
      plan: {
        promptVersion: 'faq-plan-test',
        run: vi.fn(async () => ({
          category: 'Online Consultation',
          query: 'schedule consult after review',
          reason: 'timing follow-up',
        })),
      },
      answer: {
        promptVersion: 'faq-answer-test',
        run: vi.fn(async () => ({
          answer: '',
          citedFaqIds: 'faq-2',
          confidence: 'extreme',
        })),
      },
    });
    const agent = new FaqAgent(gateway, adapter);

    const result = await agent.execute({
      type: 'faq.answer',
      input: {
        latestUserMessage: 'Can I schedule a consult after the records review?',
        sessionId: 'session-faq-2',
      },
      meta: {
        task: createFaqTask('Can I schedule a consult after the records review?'),
      },
    });

    expect(result).toEqual({
      status: 'ok',
      data: {
        answer: expect.stringContaining('I can help'),
        citedFaqIds: ['faq-2'],
        confidence: 'medium',
      },
    });
  });
});
