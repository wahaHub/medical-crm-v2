import { describe, it, expect } from 'vitest';
import { UploadPolicyRegistry } from '../registry.js';
import { messageAttachmentPolicy } from '../message-attachment.policy.js';

describe('UploadPolicyRegistry', () => {
  const registry = new UploadPolicyRegistry([messageAttachmentPolicy]);

  it('returns policy by policyId', () => {
    const policy = registry.get('message_attachment');
    expect(policy.policyId).toBe('message_attachment');
    expect(policy.backend).toBe('r2-private');
  });

  it('throws for unknown policyId', () => {
    expect(() => registry.get('unknown' as any)).toThrow('Unknown upload policy');
  });
});
