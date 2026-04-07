import { describe, expect, it } from 'vitest';
import {
  chatbotChatSchema,
  chatbotConvertSchema,
  chatbotHistoryResponseSchema,
  chatbotMessageBlockSchema,
  chatbotNextActionSchema,
  chatbotSemanticSignalsSchema,
} from '../chatbot.schema';
import {
  AI_POLICY_RECOMMENDATION_SIGNALS,
  AI_POLICY_RESOLVED_INTENTS,
  AI_POLICY_ENGAGEMENT_SIGNALS,
  AI_POLICY_PROGRESSION_SIGNALS,
} from '@medical-crm/utils';

describe('chatbotNextActionSchema', () => {
  it('accepts the full intended public action set', () => {
    const allowedActions = [
      'ANSWER_FAQ',
      'EXPLAIN_DOC_UPLOAD',
      'EXPLAIN_MEDICAL_TRAVEL_PROCESS',
      'EXPLAIN_CONSULT_PROCESS',
      'SHOW_HOSPITAL_RECOMMENDATIONS',
      'REQUEST_DOC_UPLOAD',
      'INVITE_ONLINE_CONSULT',
      'SHOW_PACKAGE',
      'HUMAN_HANDOFF',
      'SAFETY_HANDOFF',
    ] as const;

    for (const action of allowedActions) {
      expect(chatbotNextActionSchema.safeParse(action).success).toBe(true);
    }
  });

  it('rejects legacy public action names from the new response contract', () => {
    expect(chatbotNextActionSchema.safeParse('ANSWER').success).toBe(false);
    expect(chatbotNextActionSchema.safeParse('CONSULT_CONVERSION').success).toBe(false);
    expect(chatbotNextActionSchema.safeParse('CREATE_CASE').success).toBe(false);
    expect(chatbotNextActionSchema.safeParse('REQUEST_DOCS').success).toBe(false);
    expect(chatbotNextActionSchema.safeParse('ESCALATE').success).toBe(false);
    expect(chatbotNextActionSchema.safeParse('SAFETY').success).toBe(false);
  });
});

describe('chatbotMessageBlockSchema', () => {
  it('accepts questionnaire intake triggers and rejects the legacy doc upload card naming', () => {
    expect(chatbotMessageBlockSchema.safeParse({
      id: 'questionnaire-trigger-1',
      type: 'QUESTIONNAIRE_MODAL_TRIGGER',
      templateId: '7f8e26b8-4ea1-40b4-9145-327fde0fe4e6',
      title: 'Complete your medical questionnaire',
      description: 'This helps us guide the next step more accurately.',
      ctaLabel: 'Open questionnaire',
    }).success).toBe(true);

    expect(chatbotMessageBlockSchema.safeParse({
      id: 'doc-upload-card-1',
      type: 'DOC_UPLOAD_CARD',
      title: 'Upload your documents',
      sessionId: 'session-123',
      uploadInitPath: '/api/v2/chatbot/uploads/init',
    }).success).toBe(false);
  });

  it('requires the current hospital recommendation payload shape', () => {
    expect(chatbotMessageBlockSchema.safeParse({
      id: 'hospital-cards-1',
      type: 'HOSPITAL_RECOMMENDATION_CARDS',
      title: 'Recommended hospitals',
      description: 'Based on your current information, these look like the closest matches.',
      caseId: '5c3f8b47-9a2c-4bc7-8c32-dff44f4d5a80',
      selectPath: '/select-hospitals',
      hospitals: [{
        hospitalId: '95c80c26-b173-497d-a66c-713dd76ca2f4',
        name: 'Example Hospital',
        reason: 'Strong fit for the current case',
        summary: 'International patient desk and strong ENT coordination.',
        ctaUrl: '/hospitals/95c80c26-b173-497d-a66c-713dd76ca2f4',
        thumbnailUrl: 'https://example.com/thumbnail.jpg',
        thumbnailFallbackUrls: [
          'https://example.com/thumbnail-fallback-1.jpg',
          'https://example.com/thumbnail-fallback-2.jpg',
        ],
        slug: 'example-hospital',
        city: 'Shanghai',
        matchType: 'matched',
        reasonCodes: ['fit'],
      }],
    }).success).toBe(true);

    expect(chatbotMessageBlockSchema.safeParse({
      id: 'hospital-cards-1',
      type: 'HOSPITAL_RECOMMENDATION_CARDS',
      title: 'Recommended hospitals',
      hospitals: [{
        hospitalId: '95c80c26-b173-497d-a66c-713dd76ca2f4',
      }],
    }).success).toBe(false);
  });

  it('requires the current online consult booking draft payload', () => {
    expect(chatbotMessageBlockSchema.safeParse({
      id: 'consult-booking-1',
      type: 'ONLINE_CONSULT_BOOKING_CARD',
      title: 'Request online consultation',
      description: 'Submit your consultation request and we will confirm the next step.',
      requestedAction: 'INVITE_ONLINE_CONSULT',
      convertPath: '/api/v2/chatbot/convert',
      consultationStatus: 'not_started',
      conversionDraft: {
        sessionId: 'session-123',
        name: 'Jane Doe',
        email: 'jane@example.com',
        country: 'China',
        conditionSummary: 'Recurring eye pain and vision fluctuation',
        budget: 'to_be_discussed',
      },
    }).success).toBe(true);

    expect(chatbotMessageBlockSchema.safeParse({
      id: 'consult-booking-1',
      type: 'ONLINE_CONSULT_BOOKING_CARD',
      title: 'Request online consultation',
      requestedAction: 'INVITE_ONLINE_CONSULT',
      convertPath: '/api/v2/chatbot/convert',
    }).success).toBe(false);
  });
});

describe('chatbotConvertSchema', () => {
  it('keeps requestedAction available for the convert contract', () => {
    expect(chatbotConvertSchema.safeParse({
      sessionId: 'session-123',
      name: 'Jane Doe',
      email: 'jane@example.com',
      country: 'China',
      conditionSummary: 'Recurring eye pain and vision fluctuation',
      budget: 'to_be_discussed',
      requestedAction: 'INVITE_ONLINE_CONSULT',
    }).success).toBe(true);

    expect(chatbotConvertSchema.safeParse({
      sessionId: 'session-123',
      name: 'Jane Doe',
      email: 'jane@example.com',
      country: 'China',
      conditionSummary: 'Recurring eye pain and vision fluctuation',
      budget: 'to_be_discussed',
      requestedAction: 'CONSULT_CONVERSION',
    }).success).toBe(false);
  });
});

describe('chatbotChatSchema', () => {
  it('accepts attachment-only chat messages and rejects a fully empty send', () => {
    expect(chatbotChatSchema.safeParse({
      sessionId: 'session-123',
      hospitalType: 'COSMETIC',
      message: '',
      attachments: [{
        fileName: 'report.pdf',
        fileSize: 1024,
        mimeType: 'application/pdf',
        storageKey: 'crm/dev/chatbot/report.pdf',
      }],
    }).success).toBe(true);

    expect(chatbotChatSchema.safeParse({
      sessionId: 'session-123',
      hospitalType: 'COSMETIC',
      message: '',
    }).success).toBe(false);
  });

  it('allows existing chatbot sessions to omit hospitalType while still rejecting a fully empty send', () => {
    expect(chatbotChatSchema.safeParse({
      sessionId: 'session-123',
      message: 'Continue our conversation',
    }).success).toBe(true);

    expect(chatbotChatSchema.safeParse({
      sessionId: 'session-123',
      message: '',
    }).success).toBe(false);
  });
});

describe('chatbotHistoryResponseSchema', () => {
  it('accepts signed attachment objects in chatbot history messages', () => {
    expect(chatbotHistoryResponseSchema.safeParse({
      session: {
        sessionId: 'session-123',
        hospitalType: 'COSMETIC',
        status: 'ACTIVE',
        patientId: 'patient-1',
        createdAt: '2026-04-05T00:00:00.000Z',
        updatedAt: '2026-04-05T00:00:00.000Z',
      },
      messages: [{
        id: 'msg-1',
        role: 'USER',
        content: '',
        intent: null,
        topic: null,
        riskLevel: null,
        canAnswer: null,
        nextAction: null,
        secondaryAction: null,
        responseMode: null,
        citations: [],
        metadata: {},
        attachments: [{
          fileName: 'report.pdf',
          mimeType: 'application/pdf',
          fileSize: 1024,
          storageKey: 'crm/dev/chatbot/report.pdf',
          name: 'report.pdf',
          type: 'application/pdf',
          size: 1024,
          url: 'https://signed.example.com/report.pdf',
        }],
        createdAt: '2026-04-05T00:00:00.000Z',
      }],
    }).success).toBe(true);
  });
});

describe('chatbotSemanticSignalsSchema', () => {
  it('accepts only the canonical semantic payload', () => {
    expect(chatbotSemanticSignalsSchema.safeParse({
      resolvedIntent: 'ASK_FOR_HOSPITAL_RECOMMENDATION',
      engagementSignal: 'QUALIFIED_EXPLORATION',
      progressionSignal: 'OPEN_TO_NEXT_STEP',
      recommendationSignal: 'SEEKING_RECOMMENDATION',
      mentionsCondition: true,
      mentionsDoctorOrHospitalNeed: false,
    }).success).toBe(true);
  });

  it('rejects legacy weak semantic fields as a standalone payload', () => {
    expect(chatbotSemanticSignalsSchema.safeParse({
      possibleIntent: 'ASK_FOR_RECOMMENDATION',
      possibleRisk: 'SENSITIVE',
      affirmative: true,
      negative: false,
    }).success).toBe(false);
  });

  it('rejects invalid enum values in the canonical semantic payload', () => {
    expect(chatbotSemanticSignalsSchema.safeParse({
      resolvedIntent: 'ASK_FOR_RECOMMENDATION',
      engagementSignal: 'DEEP_WORKFLOW',
      progressionSignal: 'OPEN_TO_NEXT_STEP',
      recommendationSignal: 'SEEKING_RECOMMENDATION',
      mentionsCondition: true,
      mentionsDoctorOrHospitalNeed: false,
    }).success).toBe(false);

    expect(chatbotSemanticSignalsSchema.safeParse({
      resolvedIntent: 'ASK_FOR_HOSPITAL_RECOMMENDATION',
      engagementSignal: 'DEEP_WORKFLOW',
      progressionSignal: 'ADVANCING',
      recommendationSignal: 'SEEKING_RECOMMENDATION',
      mentionsCondition: true,
      mentionsDoctorOrHospitalNeed: false,
    }).success).toBe(false);

    expect(chatbotSemanticSignalsSchema.safeParse({
      resolvedIntent: 'ASK_FOR_HOSPITAL_RECOMMENDATION',
      engagementSignal: 'DEEP_WORKFLOW',
      progressionSignal: 'OPEN_TO_NEXT_STEP',
      recommendationSignal: 'CONSIDERING',
      mentionsCondition: true,
      mentionsDoctorOrHospitalNeed: false,
    }).success).toBe(false);
  });
});

describe('ai-policy semantic enum constants', () => {
  it('exposes the approved canonical enum values', () => {
    expect(AI_POLICY_RESOLVED_INTENTS).toEqual([
      'GENERAL_INFO',
      'ASK_MEDICAL_TRAVEL_PROCESS',
      'ASK_CONSULT_PROCESS',
      'ASK_FOR_DOCTOR_OR_HOSPITAL_DIRECTION',
      'ASK_FOR_HOSPITAL_RECOMMENDATION',
      'REQUEST_DOC_UPLOAD',
      'ACCEPT_DOC_UPLOAD',
      'ACCEPT_ONLINE_CONSULT_INVITE',
      'REQUEST_HUMAN_HANDOFF',
      'ASK_PACKAGE_INFO',
      'SMALL_TALK_OR_GREETING',
      'UNKNOWN',
    ]);

    expect(AI_POLICY_ENGAGEMENT_SIGNALS).toEqual([
      'LIGHT_DISCOVERY',
      'QUALIFIED_EXPLORATION',
      'DEEP_WORKFLOW',
    ]);

    expect(AI_POLICY_PROGRESSION_SIGNALS).toEqual([
      'NONE',
      'CURIOUS',
      'OPEN_TO_NEXT_STEP',
      'READY_TO_PROCEED',
      'EXPLICITLY_COMMITTING',
    ]);

    expect(AI_POLICY_RECOMMENDATION_SIGNALS).toEqual([
      'NONE',
      'SEEKING_DIRECTION',
      'SEEKING_RECOMMENDATION',
      'READY_FOR_RECOMMENDATION',
    ]);
  });
});
