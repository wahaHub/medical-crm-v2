import { describe, expect, it, vi } from 'vitest';
import { FaqAgent } from './agents.js';
import { FaqLlmAdapter } from './faq-llm-adapter.js';
import { createToolGateway } from './tool-gateway.js';

describe('FaqLlmAdapter', () => {
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
      taskPrompt: "goal=Answer the user's FAQ using the FAQ toolset only.",
      latestUserMessage: 'How long does online consultation take to arrange?',
    })).resolves.toEqual({
      query: 'How long does online consultation take to arrange?',
      reason: expect.stringContaining('fallback'),
    });
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
      },
      meta: {
        taskPrompt: [
          'agent=FaqAgent',
          "goal=Answer the user's FAQ using the FAQ toolset only.",
          'latest_user_message=How long does online consultation take to arrange?',
        ].join('\n'),
      },
    });

    expect(categorySearch).toHaveBeenCalledWith({
      query: 'online consultation timing',
      sessionId: 'session-faq-1',
    }, expect.any(Object));
    expect(search).toHaveBeenCalledWith({
      category: 'Online Consultation',
      query: 'online consultation timing',
      sessionId: 'session-faq-1',
    }, expect.any(Object));
    expect(getByIds).toHaveBeenCalledWith({
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
        taskPrompt: "goal=Answer the user's FAQ using the FAQ toolset only.",
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
