import { buildTransactionalEmail } from './transactional-email.template.js';

export function buildPatientMagicLinkEmail(params: {
  magicLink: string;
  locale?: string | null;
}) {
  return buildTransactionalEmail({
    locale: params.locale ?? 'en',
    subject: 'Your Medora patient login link',
    preheader: 'Open your Medora patient session securely in this browser.',
    eyebrow: 'Patient Session',
    title: 'Open your patient session',
    intro: [
      'Use the secure link below to reopen your Medora patient session in this browser.',
    ],
    primaryAction: {
      label: 'Open patient session',
      url: params.magicLink,
    },
    body: [
      'If you did not request this email, you can safely ignore it.',
    ],
    fallbackLink: params.magicLink,
    footerLines: [
      'This email was sent automatically by Medora Health.',
      'Please do not reply directly to this message.',
    ],
  });
}
