import { buildTransactionalEmail } from './transactional-email.template.js';

export function buildPatientNewMessageEmail(params: {
  patientName: string;
  messagePreview: string;
  dashboardLink: string;
  locale?: string | null;
}) {
  return buildTransactionalEmail({
    locale: params.locale ?? 'en',
    subject: 'Your Medora care team sent a new message',
    preheader: 'Open your patient dashboard to read the latest update from Medora.',
    eyebrow: 'Patient Update',
    title: 'You have a new message',
    intro: [
      `${params.patientName}, your Medora care team sent a new update.`,
    ],
    conversationItems: [
      {
        speaker: 'Medora care team',
        text: params.messagePreview,
      },
    ],
    primaryAction: {
      label: 'Open patient dashboard',
      url: params.dashboardLink,
    },
    footerLines: [
      'This email was sent automatically by Medora Health.',
      'Please do not reply directly to this message.',
    ],
    fallbackLink: params.dashboardLink,
  });
}
