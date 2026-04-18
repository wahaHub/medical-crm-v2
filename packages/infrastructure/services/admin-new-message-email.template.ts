import { buildTransactionalEmail } from './transactional-email.template.js';

export function buildAdminNewMessageEmail(params: {
  patientName: string;
  messagePreview: string;
  adminPortalLink: string;
  locale?: string | null;
}) {
  return buildTransactionalEmail({
    locale: params.locale ?? 'en',
    subject: 'New patient message in Medora',
    preheader: 'A patient sent a new message while no admin was recently active.',
    eyebrow: 'Admin Alert',
    title: 'A patient sent a new message',
    intro: [
      `${params.patientName} sent a new message that may need follow-up.`,
    ],
    conversationItems: [
      {
        speaker: params.patientName,
        text: params.messagePreview,
      },
    ],
    primaryAction: {
      label: 'Open conversation',
      url: params.adminPortalLink,
    },
    footerLines: [
      'This email was sent automatically by Medora Health.',
      'You are receiving it because admin notifications are enabled for your account.',
    ],
    fallbackLink: params.adminPortalLink,
  });
}
