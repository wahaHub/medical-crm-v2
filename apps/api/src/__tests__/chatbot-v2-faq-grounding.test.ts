import { afterEach, describe, expect, it, vi } from 'vitest';
import { resolveChatbotV2FaqGrounding } from '../routes/chatbot-v2-faq-grounding.js';

describe('resolveChatbotV2FaqGrounding', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('does not silently fall back to the main dify client when faq grounding is not configured', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const difyApi = {
      createChatMessage: vi.fn(),
    };

    const result = await resolveChatbotV2FaqGrounding({
      services: {
        difyApi,
      } as never,
      scopeId: 'session-1',
      hospitalType: 'COSMETIC',
      query: 'How does the process work?',
      activeHospitalContext: null,
    });

    expect(result).toBeNull();
    expect(difyApi.createChatMessage).not.toHaveBeenCalled();
    expect(warn).toHaveBeenCalledWith(
      '[chatbot-v2] FAQ grounding client is not configured; skipping FAQ grounding for this turn.',
    );
  });

  it('uses the dedicated faq grounding client when configured', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const difyFaqGroundingApi = {
      createChatMessage: vi.fn().mockResolvedValue({
        answer: JSON.stringify({
          faqScope: 'GENERAL_ONLY',
          categories: ['Consultation Process'],
          groundedContext: 'Grounded FAQ context',
        }),
      }),
    };

    const result = await resolveChatbotV2FaqGrounding({
      services: {
        difyFaqGroundingApi,
        difyApi: {
          createChatMessage: vi.fn(),
        },
      } as never,
      scopeId: 'session-1',
      hospitalType: 'COSMETIC',
      query: 'How does the process work?',
      activeHospitalContext: null,
    });

    expect(result).toEqual({
      faqScope: 'GENERAL_ONLY',
      categories: ['Consultation Process'],
      groundedContext: 'Grounded FAQ context',
    });
    expect(difyFaqGroundingApi.createChatMessage).toHaveBeenCalledOnce();
    expect(warn).not.toHaveBeenCalled();
  });
});
