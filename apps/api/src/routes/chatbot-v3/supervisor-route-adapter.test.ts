import { describe, expect, it, vi } from 'vitest';
import { createChatbotV3SupervisorRouteAdapter } from './supervisor-route-adapter.js';

const gatewayInput = {
  currentStage: 'COLLECT_MINIMAL_MEDICAL_FACTS' as const,
  conversationSummary: 'No recommendations have been shown yet.',
  latestUserMessage: 'Please recommend hospitals for me.',
  intake: {
    condition: 'lung cancer',
    targetDestination: 'Shanghai',
    language: 'en',
    gender: 'female',
  },
  availableReadDomains: ['records.status', 'recommendation.status'] as const,
  conversationSummaryContract: {
    owner: 'runtime' as const,
    refreshTrigger: 'after_final_assistant_response' as const,
    sizeDiscipline: 'compact' as const,
    freshness: 'latest_committed_turn' as const,
    persistenceStrategy: 'persisted_with_session' as const,
  },
};

describe('createChatbotV3SupervisorRouteAdapter', () => {
  it('uses strict SupervisorEvent structured output and parses a valid event', async () => {
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        choices: [{
          message: {
            content: JSON.stringify({
              eventType: 'USER_ASKED_QUESTION',
              target: 'pricing',
              modifier: 'ask',
              confidence: 0.82,
            }),
          },
        }],
      }),
    });

    const adapter = createChatbotV3SupervisorRouteAdapter({
      enabled: true,
      apiKey: 'test-openai-key',
      fetchImpl: fetchImpl as typeof fetch,
      model: 'gpt-4o-mini',
      reasoningEffort: 'none',
    });

    await expect(adapter?.run(gatewayInput)).resolves.toEqual({
      eventType: 'USER_ASKED_QUESTION',
      target: 'pricing',
      modifier: 'ask',
      confidence: 0.82,
      source: 'llm',
    });

    expect(fetchImpl).toHaveBeenCalledOnce();
    const request = fetchImpl.mock.calls[0]?.[1];
    const payload = request?.body ? JSON.parse(String(request.body)) : null;
    expect(payload).not.toHaveProperty('temperature');
    expect(payload.reasoning_effort).toBe('none');
    expect(payload.response_format).toEqual(expect.objectContaining({
      type: 'json_schema',
      json_schema: expect.objectContaining({
        strict: true,
        name: 'chatbot_v3_supervisor_event',
      }),
    }));
    expect(payload.response_format.json_schema.schema.properties.eventType.enum).toEqual(expect.arrayContaining([
      'USER_EXPRESSED_NEED',
      'USER_ASKED_QUESTION',
      'USER_PROVIDED_INFORMATION',
      'USER_RESPONDED_TO_REQUEST',
      'USER_REQUESTED_HUMAN',
      'USER_MESSAGE_UNCLEAR',
    ]));
    expect(payload.response_format.json_schema.schema.properties.eventType.enum).not.toContain('TRIAGE_SUBMITTED');
    expect(payload.response_format.json_schema.schema.properties.eventType.enum).not.toContain('RECOMMENDATION_SELECTED');
    expect(payload.response_format.json_schema.schema.required).toEqual(['eventType', 'target', 'modifier', 'confidence']);
    expect(payload.response_format.json_schema.schema.properties.target).toEqual(expect.objectContaining({
      type: 'string',
      enum: expect.arrayContaining(['pricing', 'next_step', 'hospital', 'unknown']),
    }));
    expect(payload.response_format.json_schema.schema.properties.modifier).toEqual(expect.objectContaining({
      type: 'string',
      enum: expect.arrayContaining(['ask', 'provide', 'confirm', 'reject', 'hesitate', 'revisit', 'unknown']),
    }));
    expect(payload.response_format.json_schema.schema.properties).not.toHaveProperty('source');
    expect(payload.response_format.json_schema.schema.properties).not.toHaveProperty('metadata');
  });

  it('returns fallback_unknown when the llm output violates the SupervisorEvent schema', async () => {
    const invalidResponse = {
      ok: true,
      json: async () => ({
        choices: [{
          message: {
            content: JSON.stringify({
              intent: 'progression',
              suggestedStage: 'RECOMMENDATION',
              dispatchAgent: 'RecommendationAgent',
              task: { goal: 'old proposal shape' },
            }),
          },
        }],
      }),
    };
    const fetchImpl = vi.fn()
      .mockResolvedValueOnce(invalidResponse)
      .mockResolvedValueOnce(invalidResponse);

    const adapter = createChatbotV3SupervisorRouteAdapter({
      enabled: true,
      apiKey: 'test-openai-key',
      fetchImpl: fetchImpl as typeof fetch,
      model: 'gpt-4o-mini',
    });

    const result = await adapter?.runWithLlmMetadata(gatewayInput);
    expect(result?.output).toEqual({
      eventType: 'USER_MESSAGE_UNCLEAR',
      target: 'unknown',
      modifier: 'unknown',
      confidence: 0,
      source: 'fallback_unknown',
      metadata: {
        rawText: 'supervisor route llm returned invalid SupervisorEvent schema',
      },
    });
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it('preserves final response-content failure metadata on fallback', async () => {
    const fetchImpl = vi.fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          choices: [{
            message: {
              content: 'not json',
            },
          }],
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          choices: [{
            message: {
              content: 'still not json',
            },
          }],
        }),
      });

    const adapter = createChatbotV3SupervisorRouteAdapter({
      enabled: true,
      apiKey: 'test-openai-key',
      fetchImpl: fetchImpl as typeof fetch,
      model: 'gpt-4o-mini',
    });

    const result = await adapter?.runWithLlmMetadata(gatewayInput);
    expect(result?.output).toEqual({
      eventType: 'USER_MESSAGE_UNCLEAR',
      target: 'unknown',
      modifier: 'unknown',
      confidence: 0,
      source: 'fallback_unknown',
      metadata: {
        rawText: 'supervisor route llm returned invalid SupervisorEvent schema',
      },
    });
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    expect(result?.llmRunMetadata).toEqual(expect.objectContaining({
      llmFailurePhase: 'response_content',
      llmErrorName: 'NonJsonContentError',
      llmResponseContentLength: 'still not json'.length,
      llmResponseContentStartsWithBrace: false,
    }));
  });

  it('retries once before falling back when the first structured output is invalid', async () => {
    const fetchImpl = vi.fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          choices: [{
            message: {
              content: JSON.stringify({
                intent: 'progression',
                suggestedStage: 'RECOMMENDATION',
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
                eventType: 'USER_EXPRESSED_NEED',
                target: 'recommendation',
                modifier: 'ask',
                confidence: 0.87,
              }),
            },
          }],
        }),
      });

    const adapter = createChatbotV3SupervisorRouteAdapter({
      enabled: true,
      apiKey: 'test-openai-key',
      fetchImpl: fetchImpl as typeof fetch,
      model: 'gpt-5.1-mini',
      reasoningEffort: 'none',
    });

    await expect(adapter?.run(gatewayInput)).resolves.toEqual({
      eventType: 'USER_EXPRESSED_NEED',
      target: 'recommendation',
      modifier: 'ask',
      confidence: 0.87,
      source: 'llm',
    });
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it('retries when the llm returns an eventType outside the per-turn allowed set', async () => {
    const fetchImpl = vi.fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          choices: [{
            message: {
              content: JSON.stringify({
                eventType: 'TRIAGE_SUBMITTED',
                target: 'medical_facts',
                modifier: 'provide',
                confidence: 0.93,
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
                eventType: 'USER_ASKED_QUESTION',
                target: 'next_step',
                modifier: 'ask',
                confidence: 0.66,
              }),
            },
          }],
        }),
      });

    const adapter = createChatbotV3SupervisorRouteAdapter({
      enabled: true,
      apiKey: 'test-openai-key',
      fetchImpl: fetchImpl as typeof fetch,
      model: 'gpt-5.1-mini',
      reasoningEffort: 'none',
    });

    await expect(adapter?.run(gatewayInput)).resolves.toEqual({
      eventType: 'USER_ASKED_QUESTION',
      target: 'next_step',
      modifier: 'ask',
      confidence: 0.66,
      source: 'llm',
    });
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it('retries once when the first request attempt rejects', async () => {
    const fetchImpl = vi.fn()
      .mockRejectedValueOnce(new Error('temporary network failure'))
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          choices: [{
            message: {
              content: JSON.stringify({
                eventType: 'USER_ASKED_QUESTION',
                target: 'pricing',
                modifier: 'ask',
                confidence: 0.75,
              }),
            },
          }],
        }),
      });

    const adapter = createChatbotV3SupervisorRouteAdapter({
      enabled: true,
      apiKey: 'test-openai-key',
      fetchImpl: fetchImpl as typeof fetch,
      model: 'gpt-5.1-mini',
      reasoningEffort: 'none',
    });

    await expect(adapter?.run(gatewayInput)).resolves.toEqual({
      eventType: 'USER_ASKED_QUESTION',
      target: 'pricing',
      modifier: 'ask',
      confidence: 0.75,
      source: 'llm',
    });
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it('returns undefined when the supervisor llm route is disabled', () => {
    expect(createChatbotV3SupervisorRouteAdapter({
      enabled: false,
      apiKey: 'test-openai-key',
    })).toBeUndefined();
  });

  it('retries invalid target and modifier strings before falling back', async () => {
    const invalidResponse = {
      ok: true,
      json: async () => ({
        choices: [{
          message: {
            content: JSON.stringify({
              eventType: 'USER_EXPRESSED_NEED',
              target: 'budget',
              modifier: 'refine',
              confidence: 0.8,
            }),
          },
        }],
      }),
    };
    const fetchImpl = vi.fn()
      .mockResolvedValueOnce(invalidResponse)
      .mockResolvedValueOnce(invalidResponse);

    const adapter = createChatbotV3SupervisorRouteAdapter({
      enabled: true,
      apiKey: 'test-openai-key',
      fetchImpl: fetchImpl as typeof fetch,
      model: 'gpt-5.1-mini',
      reasoningEffort: 'none',
    });

    await expect(adapter?.run(gatewayInput)).resolves.toEqual({
      eventType: 'USER_MESSAGE_UNCLEAR',
      target: 'unknown',
      modifier: 'unknown',
      confidence: 0,
      source: 'fallback_unknown',
      metadata: {
        rawText: 'supervisor route llm returned invalid SupervisorEvent schema',
      },
    });
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });
});
