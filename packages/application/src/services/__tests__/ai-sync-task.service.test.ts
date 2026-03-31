import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AiSyncTaskService, renderFaqSyncDocument } from '../ai-sync-task.service.js';

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

  it('enqueues an UPSERT for active general faq items', async () => {
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

  it('enqueues an UPSERT for active hospital-scoped faq items so retrieval can filter by metadata later', async () => {
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
    expect(entity.action).toBe('UPSERT');
    expect(entity.entityKey).toBe('chatbot_faq_item:faq-2');
  });

  it('renders general FAQ output with GENERAL scope metadata', () => {
    const document = renderFaqSyncDocument({
      faqId: 'faq-1',
      category: 'General',
      question: 'What is recovery time?',
      answer: 'Most patients recover within a week.',
      hospitalType: 'COSMETIC',
      hospitalId: null,
      keywords: ['recovery'],
      attachments: [],
      isActive: true,
    });

    expect(document).toEqual({
      name: 'FAQ - General - What is recovery time?',
      text: [
        'Category: General',
        'Hospital Type: COSMETIC',
        'Hospital Scope: GLOBAL',
        '',
        'Question: What is recovery time?',
        '',
        'Answer:',
        'Most patients recover within a week.',
        '',
        'Keywords: recovery',
      ].join('\n'),
      metadata: {
        faq_id: 'faq-1',
        hospital_type: 'COSMETIC',
        scope: 'GENERAL',
        category: 'General',
        hospital_id: null,
        keywords: 'recovery',
      },
    });
  });

  it('renders FAQ sync output with unchanged text body and separate metadata', () => {
    const document = renderFaqSyncDocument({
      faqId: 'faq-3',
      category: 'Post-op Care',
      question: 'What is recovery time?',
      answer: 'Most patients recover within a week.',
      hospitalType: 'COSMETIC',
      hospitalId: 'hospital-123',
      keywords: ['recovery', 'healing'],
      attachments: [{ fileName: 'care-guide.pdf', storageKey: 'faq/care-guide.pdf' }],
      isActive: true,
    });

    expect(document).toEqual({
      name: 'FAQ - Post-op Care - What is recovery time?',
      text: [
        'Category: Post-op Care',
        'Hospital Type: COSMETIC',
        'Hospital Scope: hospital-123',
        '',
        'Question: What is recovery time?',
        '',
        'Answer:',
        'Most patients recover within a week.',
        '',
        'Keywords: recovery, healing',
        '',
        'Attachments:',
        '- care-guide.pdf',
      ].join('\n'),
      metadata: {
        faq_id: 'faq-3',
        hospital_type: 'COSMETIC',
        scope: 'HOSPITAL',
        category: 'Post-op Care',
        hospital_id: 'hospital-123',
        keywords: 'recovery, healing',
      },
    });
  });
});
