import { describe, it, expect } from 'vitest';
import { Conversation } from '../src/entities/conversation.entity.js';

function makeConversation(
  overrides: Partial<ConstructorParameters<typeof Conversation>[0]> = {},
) {
  return new Conversation({
    id: 'conv-1',
    caseId: 'case-1',
    category: 'HOSPITAL',
    title: 'Test Conversation',
    hospitalId: 'h-1',
    lastMessageId: null,
    lastMessageAt: null,
    lastMessagePreview: null,
    lastSenderId: null,
    createdAt: new Date('2026-01-01'),
    updatedAt: new Date('2026-01-01'),
    ...overrides,
  });
}

describe('Conversation', () => {
  it('constructor sets all fields', () => {
    const c = makeConversation();
    expect(c.id).toBe('conv-1');
    expect(c.caseId).toBe('case-1');
    expect(c.category).toBe('HOSPITAL');
    expect(c.title).toBe('Test Conversation');
    expect(c.hospitalId).toBe('h-1');
    expect(c.lastMessageId).toBeNull();
    expect(c.lastMessageAt).toBeNull();
    expect(c.lastMessagePreview).toBeNull();
    expect(c.lastSenderId).toBeNull();
    expect(c.createdAt).toEqual(new Date('2026-01-01'));
    expect(c.updatedAt).toEqual(new Date('2026-01-01'));
  });

  it('updateLastMessage() updates denormalized fields', () => {
    const c = makeConversation();
    const msgCreatedAt = new Date('2026-02-01T10:00:00Z');
    c.updateLastMessage({
      id: 'msg-1',
      content: 'Hello world',
      senderId: 'user-1',
      createdAt: msgCreatedAt,
    });
    expect(c.lastMessageId).toBe('msg-1');
    expect(c.lastMessageAt).toEqual(msgCreatedAt);
    expect(c.lastMessagePreview).toBe('Hello world');
    expect(c.lastSenderId).toBe('user-1');
    expect(c.updatedAt.getTime()).toBeGreaterThanOrEqual(msgCreatedAt.getTime());
  });

  it('updateLastMessage() truncates preview to 100 chars', () => {
    const c = makeConversation();
    const longContent = 'A'.repeat(150);
    c.updateLastMessage({
      id: 'msg-2',
      content: longContent,
      senderId: 'user-2',
      createdAt: new Date(),
    });
    expect(c.lastMessagePreview).toHaveLength(100);
    expect(c.lastMessagePreview).toBe('A'.repeat(100));
  });
});
