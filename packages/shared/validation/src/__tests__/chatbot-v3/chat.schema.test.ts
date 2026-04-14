import { describe, expect, it } from 'vitest';
import {
  chatbotV3ChatRequestSchema,
  chatbotV3ChatResponseSchema,
  chatbotV3CardSchema,
} from '../../chatbot-v3/chat.schema';

describe('chatbot-v3 chat schemas', () => {
  it('accepts a valid v3 chat request', () => {
    expect(chatbotV3ChatRequestSchema.safeParse({
      sessionId: 'session-123',
      message: 'Please explain the process',
      attachments: [{
        fileName: 'report.pdf',
        fileSize: 2048,
        mimeType: 'application/pdf',
        storageKey: 'chatbot/session-123/report.pdf',
      }],
      pageContext: {
        type: 'HOSPITAL_DETAIL',
        hospitalId: 'hospital-123',
      },
    }).success).toBe(true);
  });

  it('accepts a valid v3 chat response', () => {
    expect(chatbotV3ChatResponseSchema.safeParse({
      messages: [{
        role: 'assistant',
        text: 'Here is the process overview.',
      }],
      turnOutcome: {
        status: 'ok',
        recoverableErrorCode: null,
      },
      cards: [{
        cardId: 'card-process-1',
        cardType: 'PROCESS_GUIDE',
        payload: {
          guideId: 'guide-process',
          title: 'Medical travel process',
        },
        actions: [{
          actionType: 'OPEN_MODAL',
          label: 'View process',
          params: {
            modalKey: 'MEDICAL_TRAVEL_PROCESS',
          },
        }],
      }],
      journey: {
        stage: 'EXPLAIN_PROCESS',
        phase: 'active',
      },
      handoff: {
        required: false,
        ticketId: null,
      },
    }).success).toBe(true);
  });

  it('rejects legacy response fields such as nextAction', () => {
    expect(chatbotV3ChatResponseSchema.safeParse({
      messages: [{
        role: 'assistant',
        text: 'Here is the process overview.',
      }],
      turnOutcome: {
        status: 'ok',
        recoverableErrorCode: null,
      },
      cards: [],
      journey: {
        stage: 'EXPLAIN_PROCESS',
        phase: 'active',
      },
      handoff: {
        required: false,
        ticketId: null,
      },
      nextAction: 'ANSWER_FAQ',
    }).success).toBe(false);
  });

  it('rejects the missing prerequisite card type', () => {
    expect(chatbotV3CardSchema.safeParse({
      cardId: 'card-missing-prereq-1',
      cardType: 'MISSING_PREREQUISITE',
      payload: {
        stage: 'RECOMMENDATION',
      },
      actions: [],
    }).success).toBe(false);
  });
});
