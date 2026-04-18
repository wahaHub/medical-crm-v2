import { buildTransactionalEmail } from './transactional-email.template.js';

export function buildAdminNewCaseEmail(params: {
  patientName: string;
  patientEmail: string;
  adminPortalLink: string;
  locale?: string | null;
}) {
  return buildTransactionalEmail({
    locale: params.locale ?? 'en',
    subject: 'New patient case needs review',
    preheader: 'A new Medora patient case was created and is ready for admin follow-up.',
    eyebrow: 'Admin Alert',
    title: 'A new patient case is open',
    intro: [
      `${params.patientName} created a new patient case in Medora.`,
    ],
    summaryItems: [
      { label: 'Patient', value: params.patientName },
      { label: 'Email', value: params.patientEmail },
    ],
    primaryAction: {
      label: 'Open case in admin portal',
      url: params.adminPortalLink,
    },
    footerLines: [
      'This email was sent automatically by Medora Health.',
      'You are receiving it because admin notifications are enabled for your account.',
    ],
    fallbackLink: params.adminPortalLink,
  });
}
