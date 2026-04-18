import { buildTransactionalEmail } from './transactional-email.template.js';

export function buildAdminNewTicketEmail(params: {
  ticketNumber: string;
  patientName: string;
  subject: string;
  descriptionPreview: string;
  adminPortalLink: string;
  locale?: string | null;
}) {
  return buildTransactionalEmail({
    locale: params.locale ?? 'en',
    subject: `New support ticket ${params.ticketNumber}`,
    preheader: 'A new support ticket was created in Medora and needs review.',
    eyebrow: 'Admin Alert',
    title: 'A new support ticket is open',
    summaryItems: [
      { label: 'Ticket', value: params.ticketNumber },
      { label: 'Patient', value: params.patientName },
      { label: 'Subject', value: params.subject },
    ],
    body: [
      params.descriptionPreview,
    ],
    primaryAction: {
      label: 'Open ticket',
      url: params.adminPortalLink,
    },
    footerLines: [
      'This email was sent automatically by Medora Health.',
      'You are receiving it because admin notifications are enabled for your account.',
    ],
    fallbackLink: params.adminPortalLink,
  });
}
