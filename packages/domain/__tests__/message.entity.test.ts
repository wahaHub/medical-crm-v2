import { describe, it, expect } from 'vitest';
import { Message } from '../src/entities/message.entity.js';

function makeMessage(
  overrides: Partial<ConstructorParameters<typeof Message>[0]> = {},
) {
  return new Message({
    id: 'msg-1',
    conversationId: 'conv-1',
    senderId: 'user-1',
    content: 'Hello world',
    originalLanguage: 'en',
    translatedContent: null,
    messageType: 'TEXT',
    moderationStatus: 'REVIEW',
    attachments: [],
    aiSummary: null,
    createdAt: new Date('2026-01-01'),
    ...overrides,
  });
}

describe('Message', () => {
  it('constructor sets all fields including moderationStatus', () => {
    const m = makeMessage();
    expect(m.id).toBe('msg-1');
    expect(m.conversationId).toBe('conv-1');
    expect(m.senderId).toBe('user-1');
    expect(m.content).toBe('Hello world');
    expect(m.originalLanguage).toBe('en');
    expect(m.translatedContent).toBeNull();
    expect(m.messageType).toBe('TEXT');
    expect(m.moderationStatus).toBe('REVIEW');
    expect(m.attachments).toEqual([]);
    expect(m.aiSummary).toBeNull();
    expect(m.createdAt).toEqual(new Date('2026-01-01'));
  });

  it('approve() sets moderationStatus to ALLOWED', () => {
    const m = makeMessage({ moderationStatus: 'REVIEW' });
    m.approve();
    expect(m.moderationStatus).toBe('ALLOWED');
  });

  it('approve() throws when already BLOCKED', () => {
    const m = makeMessage({ moderationStatus: 'BLOCKED' });
    expect(() => m.approve()).toThrow();
  });

  it('reject() sets moderationStatus to BLOCKED', () => {
    const m = makeMessage({ moderationStatus: 'REVIEW' });
    m.reject();
    expect(m.moderationStatus).toBe('BLOCKED');
  });

  it('setTranslation(text) sets translatedContent', () => {
    const m = makeMessage();
    m.setTranslation('Hola mundo');
    expect(m.translatedContent).toBe('Hola mundo');
  });

  it('setAiSummary(text) sets aiSummary', () => {
    const m = makeMessage();
    m.setAiSummary('A greeting message.');
    expect(m.aiSummary).toBe('A greeting message.');
  });
});
