import { buildTransactionalEmail } from './transactional-email.template.js';

export function buildPatientNewMessageEmail(params: {
  patientName: string;
  messagePreview: string;
  body?: string[];
  dashboardLink: string;
  locale?: string | null;
  subject?: string;
  preheader?: string;
  eyebrow?: string;
  title?: string;
  introLine?: string;
  primaryActionLabel?: string;
  speaker?: string;
}) {
  return buildTransactionalEmail({
    locale: params.locale ?? 'en',
    subject: params.subject ?? 'Your Medora care team sent a new message',
    preheader: params.preheader ?? 'Open your patient dashboard to read the latest update from Medora.',
    eyebrow: params.eyebrow ?? 'Patient Update',
    title: params.title ?? 'You have a new message',
    intro: [
      params.introLine ?? `${params.patientName}, your Medora care team sent a new update.`,
    ],
    body: params.body,
    conversationItems: [
      {
        speaker: params.speaker ?? 'Medora care team',
        text: params.messagePreview,
      },
    ],
    primaryAction: {
      label: params.primaryActionLabel ?? 'Open patient dashboard',
      url: params.dashboardLink,
    },
    footerLines: [
      'This email was sent automatically by Medora Health.',
      'Please do not reply directly to this message.',
    ],
    fallbackLink: params.dashboardLink,
  });
}
