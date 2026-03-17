import { describe, it, expect } from 'vitest';
import { sendMessageSchema, updateMessageSchema, messageListQuerySchema } from '../message.schema';

describe('sendMessageSchema', () => {
  it('accepts valid message', () => {
    const result = sendMessageSchema.safeParse({
      content: 'Hello doctor',
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.messageType).toBe('TEXT');
    }
  });

  it('rejects empty content', () => {
    const result = sendMessageSchema.safeParse({
      content: '',
    });
    expect(result.success).toBe(false);
  });

  it('accepts optional messageType and attachments', () => {
    const result = sendMessageSchema.safeParse({
      content: 'File attached',
      messageType: 'IMAGE',
      attachments: [{ fileName: 'photo.jpg', fileSize: 1024, mimeType: 'image/jpeg', storageKey: 'abc123' }],
    });
    expect(result.success).toBe(true);
  });

  it('accepts attachment-only messages', () => {
    const result = sendMessageSchema.safeParse({
      content: '',
      messageType: 'FILE',
      attachments: [{ fileName: 'report.pdf', fileSize: 2048, mimeType: 'application/pdf', storageKey: 'files/report.pdf' }],
    });
    expect(result.success).toBe(true);
  });

  it('sanitizes HTML in content via transform', () => {
    const result = sendMessageSchema.parse({
      content: '<p>Safe</p><script>alert(1)</script>',
    });
    expect(result.content).toBe('<p>Safe</p>');
    expect(result.content).not.toContain('script');
  });
});

describe('updateMessageSchema', () => {
  it('accepts valid update', () => {
    const result = updateMessageSchema.safeParse({
      content: 'Updated content',
    });
    expect(result.success).toBe(true);
  });
});

describe('messageListQuerySchema', () => {
  it('provides defaults', () => {
    const result = messageListQuerySchema.parse({});
    expect(result.page).toBe(1);
    expect(result.limit).toBe(50);
  });
});
