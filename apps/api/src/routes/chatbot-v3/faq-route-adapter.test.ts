import { describe, expect, it, vi } from 'vitest';
import { createChatbotV3FaqRouteAdapter } from './faq-route-adapter.js';

describe('createChatbotV3FaqRouteAdapter', () => {
  it('uses an external llm client when configured and parses structured json output', async () => {
    const fetchImpl = vi.fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          choices: [{
            message: {
              content: JSON.stringify({
                query: 'consultation scheduling',
                reason: 'focused faq retrieval query',
              }),
            },
          }],
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          choices: [{
            message: {
              content: JSON.stringify({
                answer: 'Grounded FAQ answer from the route adapter.',
                citedFaqIds: ['faq-1'],
                confidence: 'high',
              }),
            },
          }],
        }),
      });

    const adapter = createChatbotV3FaqRouteAdapter({
      enabled: true,
      apiKey: 'test-openai-key',
      fetchImpl: fetchImpl as typeof fetch,
      model: 'gpt-4o-mini',
    });

    const plan = await adapter.plan({
      taskPrompt: 'agent=FaqAgent',
      latestUserMessage: 'How long does online consultation usually take to schedule?',
    });
    const answer = await adapter.answer({
      taskPrompt: 'agent=FaqAgent',
      latestUserMessage: 'How long does online consultation usually take to schedule?',
      plan,
      matches: [{
        id: 'faq-1',
        question: 'How long does online consultation usually take to schedule?',
        answer: 'Online consultations are usually arranged within 24 hours.',
        category: 'Consultation',
      }],
      details: [],
    });

    expect(plan).toEqual({
      query: 'consultation scheduling',
      reason: 'focused faq retrieval query',
    });
    expect(answer).toEqual({
      answer: 'Grounded FAQ answer from the route adapter.',
      citedFaqIds: ['faq-1'],
      confidence: 'high',
    });
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it('aborts slow llm calls and falls back safely', async () => {
    const fetchImpl = vi.fn((_input: RequestInfo | URL, init?: RequestInit) => new Promise((_, reject) => {
      init?.signal?.addEventListener('abort', () => {
        reject(new Error('aborted'));
      }, { once: true });
    }));

    const adapter = createChatbotV3FaqRouteAdapter({
      enabled: true,
      apiKey: 'test-openai-key',
      fetchImpl: fetchImpl as typeof fetch,
      model: 'gpt-4o-mini',
      timeoutMs: 1,
    });

    const plan = await adapter.plan({
      taskPrompt: 'agent=FaqAgent',
      latestUserMessage: 'How long does online consultation usually take to schedule?',
    });

    expect(plan).toEqual({
      query: 'How long does online consultation usually take to schedule?',
      reason: 'fallback faq plan derived from latest user message',
    });
    expect(fetchImpl).toHaveBeenCalledOnce();
  });
});
