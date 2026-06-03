import { describe, expect, it } from 'vitest';
import { resolvePatientChatState } from '../src/use-cases/patient-chat/patient-chat-actions.js';

const baseInput = {
  sessionType: 'CARE_TEAM' as const,
  assistantMode: 'AI_ACTIVE' as const,
  locale: 'en',
  isWidgetSession: true,
  mechanicalFlowEnabled: true,
  automationMode: 'mechanical' as const,
  processGuideConfirmed: false,
  questionnaireSubmitted: false,
  advisorRequested: false,
  medicalRecordsUploaded: false,
};

describe('resolvePatientChatState', () => {
  it('returns backend-owned mechanical actions and attachment-only composer policy', () => {
    const state = resolvePatientChatState(baseInput);

    expect(state.botMode).toBe('mechanical');
    expect(state.availableActions.map((action) => action.id)).toEqual([
      'VIEW_PROCESS',
      'UPLOAD_RECORDS',
      'CONTACT_ADVISOR',
      'OPEN_QUESTIONNAIRE',
    ]);
    expect(state.composerPolicy).toMatchObject({
      textEnabled: false,
      attachmentsEnabled: true,
      sendEnabledWhen: 'attachment_only',
    });
  });

  it('hides completed mechanical actions from the patient action menu', () => {
    const state = resolvePatientChatState({
      ...baseInput,
      advisorRequested: true,
      medicalRecordsUploaded: true,
    });

    expect(state.availableActions.map((action) => action.id)).toEqual([
      'VIEW_PROCESS',
      'OPEN_QUESTIONNAIRE',
    ]);
  });

  it('switches to human composer policy for human takeover or hospital sessions', () => {
    const takeoverState = resolvePatientChatState({
      ...baseInput,
      assistantMode: 'HUMAN_TAKEOVER',
    });
    const hospitalState = resolvePatientChatState({
      ...baseInput,
      sessionType: 'HOSPITAL',
    });

    expect(takeoverState.botMode).toBe('human');
    expect(hospitalState.botMode).toBe('human');
    expect(takeoverState.availableActions).toEqual([]);
    expect(takeoverState.composerPolicy).toMatchObject({
      textEnabled: true,
      attachmentsEnabled: true,
      sendEnabledWhen: 'text_or_attachment',
    });
  });

  it('honors explicit AI automation mode over the mechanical widget default', () => {
    const state = resolvePatientChatState({
      ...baseInput,
      automationMode: 'ai',
    });

    expect(state.botMode).toBe('ai');
    expect(state.availableActions).toEqual([]);
    expect(state.composerPolicy.textEnabled).toBe(true);
  });
});
