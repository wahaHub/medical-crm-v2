import { describe, expect, it } from 'vitest';
import {
  chatbotConvertSchema,
  chatbotMessageBlockSchema,
  chatbotNextActionSchema,
} from '../chatbot.schema';

describe('chatbotNextActionSchema', () => {
  it('accepts the full intended public action set', () => {
    const allowedActions = [
      'ANSWER_FAQ',
      'EXPLAIN_DOC_UPLOAD',
      'EXPLAIN_MEDICAL_TRAVEL_PROCESS',
      'EXPLAIN_CONSULT_PROCESS',
      'EXPLORE_HOSPITAL_RECOMMENDATIONS',
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
        ctaUrl: '/hospitals/95c80c26-b173-497d-a66c-713dd76ca2f4',
        thumbnailUrl: 'https://example.com/thumbnail.jpg',
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
      requestedAction: 'CONSULT_CONVERSION',
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
      requestedAction: 'CONSULT_CONVERSION',
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
      requestedAction: 'CONSULT_CONVERSION',
    }).success).toBe(true);
  });
});
