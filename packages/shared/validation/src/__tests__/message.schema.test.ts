import { describe, it, expect } from 'vitest';
import { sendMessageSchema } from '../message.schema';

describe('sendMessageSchema', () => {
  it('accepts valid message', () => {
    const result = sendMessageSchema.safeParse({
      content: 'Hello doctor',
      conversationId: '550e8400-e29b-41d4-a716-446655440000',
    });
    expect(result.success).toBe(true);
  });

  it('rejects empty content', () => {
    const result = sendMessageSchema.safeParse({
      content: '',
      conversationId: '550e8400-e29b-41d4-a716-446655440000',
    });
    expect(result.success).toBe(false);
  });

  it('rejects invalid UUID for conversationId', () => {
    const result = sendMessageSchema.safeParse({
      content: 'Hello',
      conversationId: 'not-a-uuid',
    });
    expect(result.success).toBe(false);
  });

  it('sanitizes HTML in content via transform', () => {
    const result = sendMessageSchema.parse({
      content: '<p>Safe</p><script>alert(1)</script>',
      conversationId: '550e8400-e29b-41d4-a716-446655440000',
    });
    expect(result.content).toBe('<p>Safe</p>');
    expect(result.content).not.toContain('script');
  });
});
