import { describe, expect, it, vi } from 'vitest';
import { Conversation, type Message } from '@medical-crm/domain';
import { HandlePatientChatEventUseCase } from './handle-patient-chat-event.use-case.js';

const makeConversation = () =>
  new Conversation({
    id: 'conv-care-team',
    caseId: 'case-1',
    category: 'ADMIN_PATIENT',
    title: 'Medora Care Team',
    hospitalId: null,
    assistantMode: 'AI_ACTIVE',
    lastMessageId: null,
    lastMessageAt: null,
    lastMessagePreview: null,
    lastSenderId: null,
    createdAt: new Date('2026-06-17T00:00:00.000Z'),
    updatedAt: new Date('2026-06-17T00:00:00.000Z'),
  });

describe('HandlePatientChatEventUseCase', () => {
  it('preserves all attachments on widget text submissions', async () => {
    const conversation = makeConversation();
    const savedMessages: Message[] = [];
    const conversationRepo = {
      findByPatientId: vi.fn().mockResolvedValue([conversation]),
      findById: vi.fn().mockResolvedValue(conversation),
      save: vi.fn().mockResolvedValue(conversation),
    };
    const messageRepo = {
      save: vi.fn(async (message: Message) => {
        savedMessages.push(message);
        return message;
      }),
    };
    const getPatientSessionDetail = {
      execute: vi.fn().mockResolvedValue({ sessionId: 'widget-chat:patient-1:case-1', data: [] }),
    };
    const useCase = new HandlePatientChatEventUseCase(
      conversationRepo as any,
      messageRepo as any,
      { findBySessionId: vi.fn().mockResolvedValue(null) } as any,
      getPatientSessionDetail as any,
      { execute: vi.fn() },
      { execute: vi.fn() } as any,
    );
    const attachments = Array.from({ length: 5 }, (_, index) => ({
      fileName: `beauty-hair-view-${index + 1}.jpg`,
      mimeType: 'image/jpeg',
      fileSize: 1024 + index,
      storageKey: `crm/dev/beauty/view-${index + 1}.jpg`,
    }));

    await useCase.execute({
      patientId: 'patient-1',
      sessionId: 'widget-chat:patient-1:case-1',
      site: 'beauty',
      eventType: 'TEXT_MESSAGE_SUBMITTED',
      locale: 'en',
      payload: {
        content: '[Beauty Consultation Upload]\nFive views: Front, Left 45, Left 90, Right 45, Right 90',
        messageType: 'IMAGE',
        attachments,
      },
    });
    const savedMessage = savedMessages[0];

    if (!savedMessage) {
      throw new Error('Expected patient chat message to be saved');
    }

    expect(savedMessage).toEqual(expect.objectContaining({
      conversationId: 'conv-care-team',
      senderId: 'patient-1',
      messageType: 'IMAGE',
      attachments,
    }));
    expect(savedMessage?.attachments).toHaveLength(5);
    expect(conversationRepo.save).toHaveBeenCalledWith(
      expect.objectContaining({
        lastMessageId: savedMessage?.id,
        lastMessagePreview: expect.stringContaining('[Beauty Consultation Upload]'),
      }),
      undefined,
    );
  });
});
