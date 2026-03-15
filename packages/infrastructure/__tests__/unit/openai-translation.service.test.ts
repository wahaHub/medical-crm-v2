import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock the openai module before importing the service
vi.mock('openai', () => {
  const mockCreate = vi.fn();
  const MockOpenAI = vi.fn(() => ({
    chat: {
      completions: {
        create: mockCreate,
      },
    },
  }));
  // Attach mockCreate on the constructor for test access
  (MockOpenAI as unknown as Record<string, unknown>).__mockCreate = mockCreate;
  return { default: MockOpenAI };
});

describe('OpenAITranslationService', () => {
  let mockCreate: ReturnType<typeof vi.fn>;

  beforeEach(async () => {
    vi.resetModules();
    const openaiModule = await import('openai');
    const OpenAI = openaiModule.default as unknown as {
      new (opts: { apiKey: string }): { chat: { completions: { create: ReturnType<typeof vi.fn> } } };
      __mockCreate: ReturnType<typeof vi.fn>;
    };
    mockCreate = OpenAI.__mockCreate;
    mockCreate.mockReset();
  });

  describe('translate', () => {
    it('calls chat.completions.create with correct parameters', async () => {
      mockCreate.mockResolvedValue({
        choices: [{ message: { content: '你好世界' } }],
      });

      const { OpenAITranslationService } = await import('../../services/openai-translation.service.js');
      const service = new OpenAITranslationService('test-api-key');

      const result = await service.translate('Hello World', 'Chinese');

      expect(mockCreate).toHaveBeenCalledOnce();
      const callArgs = mockCreate.mock.calls[0]![0] as {
        model: string;
        temperature: number;
        max_tokens: number;
        messages: Array<{ role: string; content: string }>;
      };
      expect(callArgs.model).toBe('gpt-4o');
      expect(callArgs.temperature).toBe(0.3);
      expect(callArgs.max_tokens).toBe(1000);
      expect(callArgs.messages[0]?.role).toBe('system');
      expect(callArgs.messages[0]?.content).toContain('Chinese');
      expect(callArgs.messages[1]?.role).toBe('user');
      expect(callArgs.messages[1]?.content).toBe('Hello World');
      expect(result).toBe('你好世界');
    });

    it('trims whitespace from the response', async () => {
      mockCreate.mockResolvedValue({
        choices: [{ message: { content: '  Bonjour  ' } }],
      });

      const { OpenAITranslationService } = await import('../../services/openai-translation.service.js');
      const service = new OpenAITranslationService('test-api-key');

      const result = await service.translate('Hello', 'French');
      expect(result).toBe('Bonjour');
    });

    it('returns empty string when content is null', async () => {
      mockCreate.mockResolvedValue({
        choices: [{ message: { content: null } }],
      });

      const { OpenAITranslationService } = await import('../../services/openai-translation.service.js');
      const service = new OpenAITranslationService('test-api-key');

      const result = await service.translate('Hello', 'French');
      expect(result).toBe('');
    });

    it('returns empty string when choices are empty', async () => {
      mockCreate.mockResolvedValue({ choices: [] });

      const { OpenAITranslationService } = await import('../../services/openai-translation.service.js');
      const service = new OpenAITranslationService('test-api-key');

      const result = await service.translate('Hello', 'French');
      expect(result).toBe('');
    });

    it('propagates errors from the OpenAI SDK', async () => {
      mockCreate.mockRejectedValue(new Error('API rate limit exceeded'));

      const { OpenAITranslationService } = await import('../../services/openai-translation.service.js');
      const service = new OpenAITranslationService('test-api-key');

      await expect(service.translate('Hello', 'French')).rejects.toThrow('API rate limit exceeded');
    });
  });

  describe('summarizeMessage', () => {
    it('calls chat.completions.create with message type and language', async () => {
      mockCreate.mockResolvedValue({
        choices: [{ message: { content: 'A text message from the patient.' } }],
      });

      const { OpenAITranslationService } = await import('../../services/openai-translation.service.js');
      const service = new OpenAITranslationService('test-api-key');

      const result = await service.summarizeMessage(
        'Hello, I have a question about my appointment.',
        'TEXT',
        'English',
      );

      expect(mockCreate).toHaveBeenCalledOnce();
      const callArgs = mockCreate.mock.calls[0]![0] as {
        model: string;
        temperature: number;
        max_tokens: number;
        messages: Array<{ role: string; content: string }>;
      };
      expect(callArgs.model).toBe('gpt-4o');
      expect(callArgs.max_tokens).toBe(200);
      expect(callArgs.messages[0]?.content).toContain('text');
      expect(callArgs.messages[0]?.content).toContain('English');
      expect(result).toBe('A text message from the patient.');
    });

    it('lowercases the messageType in the prompt', async () => {
      mockCreate.mockResolvedValue({
        choices: [{ message: { content: 'Summary.' } }],
      });

      const { OpenAITranslationService } = await import('../../services/openai-translation.service.js');
      const service = new OpenAITranslationService('test-api-key');

      await service.summarizeMessage('image data', 'IMAGE', 'Chinese');

      const callArgs = mockCreate.mock.calls[0]![0] as {
        messages: Array<{ role: string; content: string }>;
      };
      expect(callArgs.messages[0]?.content).toContain('image');
    });

    it('returns empty string when content is null', async () => {
      mockCreate.mockResolvedValue({
        choices: [{ message: { content: null } }],
      });

      const { OpenAITranslationService } = await import('../../services/openai-translation.service.js');
      const service = new OpenAITranslationService('test-api-key');

      const result = await service.summarizeMessage('content', 'TEXT', 'English');
      expect(result).toBe('');
    });
  });
});
