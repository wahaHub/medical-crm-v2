import { buildTransactionalEmail } from './transactional-email.template.js';

function optionalItem(label: string, value?: string | null) {
  const trimmed = value?.trim();
  if (!trimmed) return null;
  return { label, value: trimmed };
}

export function buildPatientOnboardingEmail(params: {
  dashboardLink: string;
  locale?: string | null;
  summary: {
    country?: string | null;
    department?: string | null;
    condition?: string | null;
    destination?: string | null;
    treatmentTimeline?: string | null;
  };
}) {
  return buildTransactionalEmail({
    locale: params.locale ?? 'en',
    subject: 'Your patient case is open',
    preheader: 'We received your consultation request and opened your Medora patient case.',
    eyebrow: 'Patient Case',
    title: 'Your patient case is open',
    intro: [
      'We received your consultation request and created your Medora patient case.',
      'You can reopen your dashboard at any time to continue the intake and chat with the care team.',
    ],
    summaryItems: [
      optionalItem('Country', params.summary.country),
      optionalItem('Department', params.summary.department),
      optionalItem('Condition', params.summary.condition),
      optionalItem('Destination', params.summary.destination),
      optionalItem('Treatment timeline', params.summary.treatmentTimeline),
    ].filter((item): item is { label: string; value: string } => item !== null),
    body: [
      'Our team will review the information you shared and guide you through the next step.',
      'What happens next?',
      '1. Our medical team will review your case within 48 hours.',
      '2. We will match you with suitable hospitals and specialists.',
      '3. You will receive personalized treatment recommendations and next-step guidance.',
      'Questions or updates?',
      'Email: contact@medicaltourismchina.health',
      'WhatsApp: (+1) 470-861-3825',
    ],
    primaryAction: {
      label: 'Open patient dashboard',
      url: params.dashboardLink,
    },
    fallbackLink: params.dashboardLink,
    footerLines: [
      'This email was sent automatically by Medora Health.',
      'If you did not submit this consultation request, you can safely ignore this message.',
    ],
  });
}
