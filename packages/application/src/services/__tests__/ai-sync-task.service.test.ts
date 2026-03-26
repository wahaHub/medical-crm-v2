import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AiSyncTaskService } from '../ai-sync-task.service.js';

describe('AiSyncTaskService', () => {
  const outboxRepo = {
    enqueue: vi.fn(),
    claimBatch: vi.fn(),
    markDone: vi.fn(),
    markRetry: vi.fn(),
    markFailed: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('enqueues an UPSERT for active global faq items', async () => {
    const service = new AiSyncTaskService(outboxRepo);

    await service.enqueueFaqUpsert({
      faqId: 'faq-1',
      category: 'General',
      question: 'What is recovery time?',
      answer: 'Most patients recover within a week.',
      hospitalType: 'COSMETIC',
      hospitalId: null,
      keywords: [],
      attachments: [],
      isActive: true,
    });

    expect(outboxRepo.enqueue).toHaveBeenCalledOnce();
    const entity = outboxRepo.enqueue.mock.calls[0]?.[0];
    expect(entity.action).toBe('UPSERT');
    expect(entity.entityKey).toBe('chatbot_faq_item:faq-1');
  });

  it('downgrades hospital-scoped faq items to DELETE so they do not enter shared datasets', async () => {
    const service = new AiSyncTaskService(outboxRepo);

    await service.enqueueFaqUpsert({
      faqId: 'faq-2',
      category: 'Hospital-only',
      question: 'Do you offer VIP pickup?',
      answer: 'Yes, for this hospital only.',
      hospitalType: 'COSMETIC',
      hospitalId: 'hospital-123',
      keywords: [],
      attachments: [],
      isActive: true,
    });

    expect(outboxRepo.enqueue).toHaveBeenCalledOnce();
    const entity = outboxRepo.enqueue.mock.calls[0]?.[0];
    expect(entity.action).toBe('DELETE');
    expect(entity.entityKey).toBe('chatbot_faq_item:faq-2');
  });
});
