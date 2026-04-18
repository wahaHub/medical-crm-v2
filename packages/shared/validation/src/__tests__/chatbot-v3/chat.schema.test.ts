import { describe, expect, it } from 'vitest';
import {
  chatbotV3ChatRequestSchema,
  chatbotV3ChatResponseSchema,
  chatbotV3UploadInitRequestSchema,
  chatbotV3UploadInitResponseSchema,
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

  it('accepts COLLECT_MINIMAL_MEDICAL_FACTS in the v3 journey contract', () => {
    expect(chatbotV3ChatResponseSchema.safeParse({
      messages: [{
        role: 'assistant',
        text: 'Let us start with a few essential medical facts.',
      }],
      turnOutcome: {
        status: 'ok',
        recoverableErrorCode: null,
      },
      cards: [],
      journey: {
        stage: 'COLLECT_MINIMAL_MEDICAL_FACTS',
        phase: 'active',
      },
      handoff: {
        required: false,
        ticketId: null,
      },
    }).success).toBe(true);
  });

  it('accepts the v3 upload init request and response contract', () => {
    expect(chatbotV3UploadInitRequestSchema.safeParse({
      sessionId: 'session-123',
      fileName: 'report.pdf',
      fileSize: 2048,
      mimeType: 'application/pdf',
    }).success).toBe(true);

    expect(chatbotV3UploadInitResponseSchema.safeParse({
      upload: {
        uploadUrl: 'https://upload.example.com',
        storageKey: 'chatbot/session-123/report.pdf',
        expiresIn: 900,
      },
      asset: {
        fileName: 'report.pdf',
        fileSize: 2048,
        mimeType: 'application/pdf',
        storageKey: 'chatbot/session-123/report.pdf',
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

  it('rejects extra fields on the v3 upload init contract', () => {
    expect(chatbotV3UploadInitRequestSchema.safeParse({
      sessionId: 'session-123',
      fileName: 'report.pdf',
      fileSize: 2048,
      mimeType: 'application/pdf',
      hospitalType: 'COSMETIC',
    }).success).toBe(false);

    expect(chatbotV3UploadInitResponseSchema.safeParse({
      upload: {
        uploadUrl: 'https://upload.example.com',
        storageKey: 'chatbot/session-123/report.pdf',
        expiresIn: 900,
      },
      asset: {
        fileName: 'report.pdf',
        fileSize: 2048,
        mimeType: 'application/pdf',
        storageKey: 'chatbot/session-123/report.pdf',
      },
      sessionId: 'session-123',
    }).success).toBe(false);
  });

  it('rejects the missing prerequisite card type in the full response contract', () => {
    expect(chatbotV3ChatResponseSchema.safeParse({
      messages: [{
        role: 'assistant',
        text: 'Please upload records first.',
      }],
      turnOutcome: {
        status: 'degraded',
        recoverableErrorCode: 'UNKNOWN',
      },
      cards: [{
        cardId: 'card-missing-prereq-1',
        cardType: 'MISSING_PREREQUISITE',
        payload: {
          stage: 'RECOMMENDATION',
        },
        actions: [],
      }],
      journey: {
        stage: 'COLLECT_MEDICAL_INPUTS',
        phase: 'active',
      },
      handoff: {
        required: false,
        ticketId: null,
      },
    }).success).toBe(false);
  });
});
