import { describe, it, expect, vi, beforeEach } from 'vitest';
import { OpenAIBatchTranslationService } from '../services/openai-batch-translation.service.js';

function makeMockClient(content: string | null) {
  return {
    chat: {
      completions: {
        create: vi.fn().mockResolvedValue({
          choices: [{ message: { content } }],
        }),
      },
    },
  };
}

describe('OpenAIBatchTranslationService', () => {
  let service: OpenAIBatchTranslationService;

  beforeEach(() => {
    service = new OpenAIBatchTranslationService('test-api-key');
  });

  it('calls OpenAI with correct parameters', async () => {
    const mockClient = makeMockClient(
      JSON.stringify({
        detected_language: 'zh',
        translations: {
          en: { title: 'Rhinoplasty', description: 'A nose reshaping procedure.' },
          ko: { title: '코 성형', description: '코 모양을 바꾸는 수술.' },
        },
      }),
    );
    service['client'] = mockClient as never;

    const request = {
      fields: { title: '鼻子整形', description: '改变鼻子形状的手术。' },
      targetLanguages: ['en', 'ko'],
    };

    await service.translateBatch(request);

    expect(mockClient.chat.completions.create).toHaveBeenCalledOnce();
    const callArgs = mockClient.chat.completions.create.mock.calls[0][0] as {
      model: string;
      temperature: number;
      response_format: { type: string };
      messages: Array<{ role: string; content: string }>;
    };
    expect(callArgs.model).toBe('gpt-4o');
    expect(callArgs.temperature).toBe(0.3);
    expect(callArgs.response_format).toEqual({ type: 'json_object' });
    expect(callArgs.messages[0].role).toBe('system');
    expect(callArgs.messages[1].role).toBe('user');
    expect(callArgs.messages[1].content).toBe(JSON.stringify(request.fields));
    // System prompt should mention target languages
    expect(callArgs.messages[0].content).toContain('en');
    expect(callArgs.messages[0].content).toContain('ko');
    expect(callArgs.messages[0].content).toContain('Do not translate or remove non-language fields such as image_url');
    expect(callArgs.messages[0].content).toContain('department_code');
  });

  it('parses response correctly', async () => {
    const mockClient = makeMockClient(
      JSON.stringify({
        detected_language: 'zh',
        translations: {
          en: { title: 'Rhinoplasty' },
          ko: { title: '코 성형' },
        },
      }),
    );
    service['client'] = mockClient as never;

    const result = await service.translateBatch({
      fields: { title: '鼻子整形' },
      targetLanguages: ['en', 'ko'],
    });

    expect(result.detectedLanguage).toBe('zh');
    expect(result.translations).toEqual({
      en: { title: 'Rhinoplasty' },
      ko: { title: '코 성형' },
    });
  });

  it('removes source language from translations if OpenAI included it', async () => {
    const mockClient = makeMockClient(
      JSON.stringify({
        detected_language: 'en',
        translations: {
          // OpenAI accidentally included source language
          en: { title: 'Rhinoplasty (source)' },
          zh: { title: '鼻子整形' },
          ko: { title: '코 성형' },
        },
      }),
    );
    service['client'] = mockClient as never;

    const result = await service.translateBatch({
      fields: { title: 'Rhinoplasty' },
      targetLanguages: ['zh', 'ko'],
    });

    expect(result.detectedLanguage).toBe('en');
    // 'en' should be removed from translations
    expect(result.translations).not.toHaveProperty('en');
    expect(result.translations).toHaveProperty('zh');
    expect(result.translations).toHaveProperty('ko');
  });

  it('throws an error when OpenAI returns empty content', async () => {
    const mockClient = makeMockClient(null);
    service['client'] = mockClient as never;

    await expect(
      service.translateBatch({
        fields: { title: 'test' },
        targetLanguages: ['en'],
      }),
    ).rejects.toThrow('OpenAI returned an empty response for batch translation');
  });

  it('throws an error when response is missing required fields', async () => {
    const mockClient = makeMockClient(JSON.stringify({ detected_language: 'zh' })); // missing translations
    service['client'] = mockClient as never;

    await expect(
      service.translateBatch({
        fields: { title: 'test' },
        targetLanguages: ['en'],
      }),
    ).rejects.toThrow('OpenAI response is missing required fields');
  });
});
