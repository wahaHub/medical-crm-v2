import type { ChatAutomationMode } from '@medical-crm/domain';
import type { PatientChatStateDTO } from '../../dtos/patient-conversation.dto.js';
import { normalizePatientChatLocale, patientChatCopy } from './patient-chat-i18n.js';

export type PatientChatActionKey = 'VIEW_PROCESS' | 'UPLOAD_RECORDS' | 'CONTACT_ADVISOR' | 'OPEN_QUESTIONNAIRE';

export interface ResolvePatientChatStateInput {
  sessionType: 'CARE_TEAM' | 'HOSPITAL';
  assistantMode: 'AI_ACTIVE' | 'HUMAN_TAKEOVER' | null;
  locale?: string | null;
  isWidgetSession: boolean;
  mechanicalFlowEnabled: boolean;
  automationMode?: ChatAutomationMode | null;
  processGuideConfirmed: boolean;
  questionnaireSubmitted: boolean;
  advisorRequested: boolean;
  medicalRecordsUploaded: boolean;
}

export function resolvePatientChatState(input: ResolvePatientChatStateInput): PatientChatStateDTO {
  const locale = normalizePatientChatLocale(input.locale);
  const botMode = resolveBotMode(input);

  if (botMode === 'human') {
    return {
      botMode,
      availableActions: [],
      composerPolicy: {
        textEnabled: true,
        attachmentsEnabled: true,
        sendEnabledWhen: 'text_or_attachment',
        placeholder: patientChatCopy(locale, 'composer.human'),
      },
    };
  }

  if (botMode === 'ai') {
    return {
      botMode,
      availableActions: [],
      composerPolicy: {
        textEnabled: true,
        attachmentsEnabled: true,
        sendEnabledWhen: 'text_or_attachment',
        placeholder: patientChatCopy(locale, 'composer.human'),
      },
    };
  }

  return {
    botMode: 'mechanical',
    availableActions: buildMechanicalActions(input, locale),
    composerPolicy: {
      textEnabled: true,
      attachmentsEnabled: true,
      sendEnabledWhen: 'text_or_attachment',
      placeholder: patientChatCopy(locale, 'composer.human'),
    },
  };
}

function resolveBotMode(input: ResolvePatientChatStateInput): PatientChatStateDTO['botMode'] {
  if (input.sessionType !== 'CARE_TEAM' || input.assistantMode === 'HUMAN_TAKEOVER') {
    return 'human';
  }

  if (input.automationMode === 'ai') {
    return 'ai';
  }

  if (input.automationMode === 'human') {
    return 'human';
  }

  if (input.isWidgetSession && input.mechanicalFlowEnabled) {
    return 'mechanical';
  }

  return 'ai';
}

function buildMechanicalActions(
  input: ResolvePatientChatStateInput,
  locale: ReturnType<typeof normalizePatientChatLocale>,
): PatientChatStateDTO['availableActions'] {
  return input.medicalRecordsUploaded
    ? []
    : [{ id: 'UPLOAD_RECORDS', label: patientChatCopy(locale, 'action.uploadRecords'), icon: 'upload' }];
}
