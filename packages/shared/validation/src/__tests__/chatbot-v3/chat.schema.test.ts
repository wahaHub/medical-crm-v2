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

  it('accepts structured TRIAGE_SUBMITTED action payloads with non-empty message text', () => {
    expect(chatbotV3ChatRequestSchema.safeParse({
      sessionId: 'session-triage-submitted-1',
      message: 'I have had chest pain for three days and already did a blood test.',
      action: {
        type: 'TRIAGE_SUBMITTED',
      },
    }).success).toBe(true);
  });

  it('accepts TRIAGE_SKIPPED without message text', () => {
    expect(chatbotV3ChatRequestSchema.safeParse({
      sessionId: 'session-triage-skipped-1',
      action: {
        type: 'TRIAGE_SKIPPED',
      },
    }).success).toBe(true);
  });

  it('rejects TRIAGE_SUBMITTED when message text is missing', () => {
    expect(chatbotV3ChatRequestSchema.safeParse({
      sessionId: 'session-triage-submitted-missing-1',
      action: {
        type: 'TRIAGE_SUBMITTED',
      },
    }).success).toBe(false);
  });

  it('rejects TRIAGE_SUBMITTED when message text is blank or whitespace', () => {
    expect(chatbotV3ChatRequestSchema.safeParse({
      sessionId: 'session-triage-submitted-blank-1',
      message: '   ',
      action: {
        type: 'TRIAGE_SUBMITTED',
      },
    }).success).toBe(false);
  });

  it('allows message to be omitted when a structured action or attachments are present', () => {
    expect(chatbotV3ChatRequestSchema.safeParse({
      sessionId: 'session-no-message-no-action-1',
    }).success).toBe(false);

    expect(chatbotV3ChatRequestSchema.safeParse({
      sessionId: 'session-no-message-no-action-attachments-1',
      attachments: [{
        fileName: 'report.pdf',
        fileSize: 2048,
        mimeType: 'application/pdf',
        storageKey: 'chatbot/session-no-message-no-action-attachments-1/report.pdf',
      }],
    }).success).toBe(true);

    expect(chatbotV3ChatRequestSchema.safeParse({
      sessionId: 'session-recommendation-skipped-1',
      action: {
        type: 'RECOMMENDATION_SKIPPED',
      },
    }).success).toBe(true);
  });

  it('requires exactly one non-empty hospitalId for RECOMMENDATION_SELECTED', () => {
    expect(chatbotV3ChatRequestSchema.safeParse({
      sessionId: 'session-recommendation-selected-1',
      action: {
        type: 'RECOMMENDATION_SELECTED',
        hospitalId: 'hospital-123',
      },
    }).success).toBe(true);

    expect(chatbotV3ChatRequestSchema.safeParse({
      sessionId: 'session-recommendation-selected-missing',
      action: {
        type: 'RECOMMENDATION_SELECTED',
      },
    }).success).toBe(false);

    expect(chatbotV3ChatRequestSchema.safeParse({
      sessionId: 'session-recommendation-selected-blank',
      action: {
        type: 'RECOMMENDATION_SELECTED',
        hospitalId: '',
      },
    }).success).toBe(false);

    expect(chatbotV3ChatRequestSchema.safeParse({
      sessionId: 'session-recommendation-selected-many',
      action: {
        type: 'RECOMMENDATION_SELECTED',
        hospitalId: ['hospital-1', 'hospital-2'],
      },
    }).success).toBe(false);
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

  it('accepts recommendation cards with both select and skip submit actions', () => {
    expect(chatbotV3ChatResponseSchema.safeParse({
      messages: [{
        role: 'assistant',
        text: 'Here are the hospital recommendations based on your current information.',
      }],
      turnOutcome: {
        status: 'ok',
        recoverableErrorCode: null,
      },
      cards: [{
        cardId: 'card-recommendation-1',
        cardType: 'RECOMMENDATION_LIST',
        payload: {
          candidates: [{
            hospitalId: 'hospital-1',
            name: 'Shanghai Chest Hospital',
            reason: 'Thoracic oncology focus',
          }],
        },
        actions: [{
          actionType: 'SUBMIT',
          label: 'Select Shanghai Chest Hospital',
          params: {
            hospitalId: 'hospital-1',
          },
        }, {
          actionType: 'SUBMIT',
          label: 'Continue without selecting a hospital',
          params: {
            actionKey: 'RECOMMENDATION_SKIPPED',
          },
        }],
      }],
      journey: {
        stage: 'RECOMMENDATION',
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

  it('accepts the maximum recommendation action set of 5 selections plus 1 skip action', () => {
    expect(chatbotV3ChatResponseSchema.safeParse({
      messages: [{
        role: 'assistant',
        text: 'Here are the current hospital recommendations.',
      }],
      turnOutcome: {
        status: 'ok',
        recoverableErrorCode: null,
      },
      cards: [{
        cardId: 'card-recommendation-max-1',
        cardType: 'RECOMMENDATION_LIST',
        payload: {
          candidates: Array.from({ length: 5 }, (_, index) => ({
            hospitalId: `hospital-${index + 1}`,
            name: `Hospital ${index + 1}`,
            reason: `Reason ${index + 1}`,
          })),
        },
        actions: Array.from({ length: 5 }, (_, index) => ({
          actionType: 'SUBMIT' as const,
          label: `Select Hospital ${index + 1}`,
          params: {
            hospitalId: `hospital-${index + 1}`,
          },
        })).concat([{
          actionType: 'SUBMIT' as const,
          label: 'Continue without selecting a hospital',
          params: {
            actionKey: 'RECOMMENDATION_SKIPPED' as const,
          },
        }]),
      }],
      journey: {
        stage: 'RECOMMENDATION',
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
