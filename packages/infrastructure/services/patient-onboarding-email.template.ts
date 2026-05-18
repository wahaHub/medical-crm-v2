import { buildTransactionalEmail } from './transactional-email.template.js';

function optionalItem(label: string, value?: string | null) {
  const trimmed = value?.trim();
  if (!trimmed) return null;
  return { label, value: trimmed };
}

type OnboardingCategory = 'general' | 'plastic' | 'bariatric' | 'stem_cell' | 'dental';

function resolveOnboardingCategory(
  department?: string | null,
  condition?: string | null,
): OnboardingCategory {
  const text = `${department ?? ''} ${condition ?? ''}`.toLowerCase();

  if (/\b(plastic|aesthetic|cosmetic|beauty|face|body|整形|医美|整容|美容)\b/.test(text)) {
    return 'plastic';
  }
  if (/\b(bariatric|weight loss|gastric|sleeve|bypass|obesity|减肥|减重|缩胃)\b/.test(text)) {
    return 'bariatric';
  }
  if (/\b(stem cell|regenerative|干细胞)\b/.test(text)) {
    return 'stem_cell';
  }
  if (/\b(dental|teeth|tooth|implant|veneer|orthodontics|oral|牙|口腔|种植|矫正)\b/.test(text)) {
    return 'dental';
  }

  return 'general';
}

function buildCategoryEmail(
  category: OnboardingCategory,
  params: {
    dashboardLink: string;
    locale?: string | null;
    summary: {
      country?: string | null;
      department?: string | null;
      condition?: string | null;
      destination?: string | null;
      treatmentTimeline?: string | null;
    };
  },
) {
  const summaryItems = [
    optionalItem('Country', params.summary.country),
    optionalItem('Department', params.summary.department),
    optionalItem('Condition', params.summary.condition),
    optionalItem('Destination', params.summary.destination),
    optionalItem('Treatment timeline', params.summary.treatmentTimeline),
  ].filter((item): item is { label: string; value: string } => item !== null);

  const commonFooter = [
    'This email was sent automatically by Medora Health.',
    'If you did not submit this consultation request, you can safely ignore this message.',
  ];

  const commonAction = {
    label: 'Open patient dashboard',
    url: params.dashboardLink,
  };

  switch (category) {
    case 'plastic':
      return buildTransactionalEmail({
        locale: params.locale ?? 'en',
        subject: 'Your aesthetic consultation is open',
        preheader: 'We received your aesthetic consultation request and opened your Medora patient case.',
        eyebrow: 'Patient Case',
        title: 'Your aesthetic consultation is open',
        intro: [
          'Thank you for reaching out to Medora Health.',
          'We partner with leading plastic surgery hospitals and certified specialists in China, offering advanced aesthetic procedures at a fraction of global costs.',
          'To explore our services: https://www.medicaltourismchina.health/steps',
        ],
        summaryItems,
        body: [
          'To get started, simply reply to this email with:',
          '• Photos of the area you\'d like to improve (optional but helpful)',
          '• Your desired outcome or concerns',
          '• Any previous procedures (if applicable)',
          '',
          'What happens next?',
          '• Our specialists evaluate your case and recommend suitable hospitals',
          '• You receive a customized treatment plan and pricing options',
          '• We can arrange an online consultation with your doctor before travel',
          '• Full support for travel, hospital booking, and recovery planning',
          '',
          'You can directly upload your requirements and photos by replying to this email, or submit them through the chat interface on your dashboard.',
          '',
          'We make your transformation safe, transparent, and personalized.',
          '',
          'Questions or updates?',
          'Email: contact@medicaltourismchina.health',
          'WhatsApp: (+1) 470-861-3825',
        ],
        redLines: [
          'To get started, simply reply to this email with:',
          '• Photos of the area you\'d like to improve (optional but helpful)',
          '• Your desired outcome or concerns',
          '• Any previous procedures (if applicable)',
          'You can directly upload your requirements and photos by replying to this email, or submit them through the chat interface on your dashboard.',
        ],
        primaryAction: commonAction,
        fallbackLink: params.dashboardLink,
        footerLines: commonFooter,
      });

    case 'bariatric':
      return buildTransactionalEmail({
        locale: params.locale ?? 'en',
        subject: 'Your bariatric consultation is open',
        preheader: 'We received your bariatric consultation request and opened your Medora patient case.',
        eyebrow: 'Patient Case',
        title: 'Your bariatric consultation is open',
        intro: [
          'Thank you for reaching out to Medora Health.',
          'We work with top bariatric surgery centers in China, offering safe and effective weight loss procedures such as gastric sleeve and gastric bypass.',
          'To learn more about our service process: https://www.medicaltourismchina.health/steps',
        ],
        summaryItems,
        body: [
          'To begin, please reply with:',
          '• Your height and current weight',
          '• Any known medical conditions (e.g. diabetes, hypertension)',
          '• Previous weight loss attempts (optional)',
          '',
          'What happens next?',
          '• Our medical team evaluates your eligibility',
          '• You receive recommended procedures and expected outcomes',
          '• We provide a full cost estimate and timeline',
          '• Optional: speak directly with a bariatric surgeon before deciding',
          '',
          'You may directly reply to this email to upload your medical records, or submit them through the chat interface on your dashboard.',
          '',
          'Our goal is to help you achieve long-term, sustainable results safely.',
          '',
          'Questions or updates?',
          'Email: contact@medicaltourismchina.health',
          'WhatsApp: (+1) 470-861-3825',
        ],
        redLines: [
          'To begin, please reply with:',
          '• Your height and current weight',
          '• Any known medical conditions (e.g. diabetes, hypertension)',
          '• Previous weight loss attempts (optional)',
          'You may directly reply to this email to upload your medical records, or submit them through the chat interface on your dashboard.',
        ],
        primaryAction: commonAction,
        fallbackLink: params.dashboardLink,
        footerLines: commonFooter,
      });

    case 'stem_cell':
      return buildTransactionalEmail({
        locale: params.locale ?? 'en',
        subject: 'Your stem cell therapy consultation is open',
        preheader: 'We received your stem cell therapy consultation request and opened your Medora patient case.',
        eyebrow: 'Patient Case',
        title: 'Your stem cell therapy consultation is open',
        intro: [
          'Thank you for reaching out to Medora Health.',
          'We collaborate with leading hospitals in China offering advanced stem cell therapies under regulated clinical frameworks.',
          'To learn more about our service process: https://www.medicaltourismchina.health/steps',
        ],
        summaryItems,
        body: [
          'To better understand your case, please reply with:',
          '• Your condition or diagnosis',
          '• Any relevant medical history (if available)',
          '• Your treatment goals or expectations',
          '',
          'What happens next?',
          '• Our team evaluates whether stem cell therapy is suitable for you',
          '• We match you with specialized hospitals and doctors',
          '• You receive a personalized treatment approach and estimated cost',
          '• Optional: book a 1-on-1 consultation to discuss feasibility in detail',
          '',
          'You may directly reply to this email to upload your medical records, or submit them through the chat interface on your dashboard.',
          '',
          'We prioritize safety, transparency, and evidence-based recommendations.',
          '',
          'Questions or updates?',
          'Email: contact@medicaltourismchina.health',
          'WhatsApp: (+1) 470-861-3825',
        ],
        redLines: [
          'To better understand your case, please reply with:',
          '• Your condition or diagnosis',
          '• Any relevant medical history (if available)',
          '• Your treatment goals or expectations',
          'You may directly reply to this email to upload your medical records, or submit them through the chat interface on your dashboard.',
        ],
        primaryAction: commonAction,
        fallbackLink: params.dashboardLink,
        footerLines: commonFooter,
      });

    case 'dental':
      return buildTransactionalEmail({
        locale: params.locale ?? 'en',
        subject: 'Your dental consultation is open',
        preheader: 'We received your dental consultation request and opened your Medora patient case.',
        eyebrow: 'Patient Case',
        title: 'Your dental consultation is open',
        intro: [
          'Thank you for reaching out to Medora Health.',
          'We partner with top dental clinics in China offering high-quality treatments such as implants, veneers, and full-mouth restoration at highly competitive prices.',
          'To learn more about our service process: https://www.medicaltourismchina.health/steps',
        ],
        summaryItems,
        body: [
          'To get started, simply reply with:',
          '• A photo of your teeth (optional)',
          '• Your main concern (e.g. missing teeth, alignment, aesthetics)',
          '• Any previous dental work (if applicable)',
          '',
          'What happens next?',
          '• Our dental specialists review your case',
          '• You receive treatment options and pricing',
          '• Fast scheduling — appointments often available within days',
          '• Optional: consult with your dentist online before travel',
          '',
          'You may directly reply to this email to upload your medical records, or submit them through the chat interface on your dashboard.',
          '',
          'We make your smile transformation simple and affordable.',
          '',
          'Questions or updates?',
          'Email: contact@medicaltourismchina.health',
          'WhatsApp: (+1) 470-861-3825',
        ],
        redLines: [
          'To get started, simply reply with:',
          '• A photo of your teeth (optional)',
          '• Your main concern (e.g. missing teeth, alignment, aesthetics)',
          '• Any previous dental work (if applicable)',
          'You may directly reply to this email to upload your medical records, or submit them through the chat interface on your dashboard.',
        ],
        primaryAction: commonAction,
        fallbackLink: params.dashboardLink,
        footerLines: commonFooter,
      });

    case 'general':
    default:
      return buildTransactionalEmail({
        locale: params.locale ?? 'en',
        subject: 'Your patient case is open',
        preheader: 'We received your consultation request and opened your Medora patient case.',
        eyebrow: 'Patient Case',
        title: 'Your patient case is open',
        intro: [
          'Thank you for reaching out to Medora Health.',
          'We are proud to connect international patients with 200+ top-tier hospitals and world-class specialists across China.',
          'To learn more about our service process: https://www.medicaltourismchina.health/steps',
        ],
        summaryItems,
        body: [
          'To begin building your personalized treatment plan, please reply with your medical records, reports, or any relevant documents.',
          '',
          'What happens next?',
          '• Our medical team reviews your case within 24–48 hours',
          '• We match you with the most suitable specialists and hospitals',
          '• You receive a personalized treatment recommendation and cost estimate',
          '• Optional: schedule a 1-on-1 online consultation with your doctor',
          '',
          'We look forward to supporting you every step of the way.',
          '',
          'You may directly reply to this email to upload your medical records, or submit them through the chat interface on your dashboard.',
          '',
          'Questions or updates?',
          'Email: contact@medicaltourismchina.health',
          'WhatsApp: (+1) 470-861-3825',
        ],
        redLines: [
          'To begin building your personalized treatment plan, please reply with your medical records, reports, or any relevant documents.',
          'You may directly reply to this email to upload your medical records, or submit them through the chat interface on your dashboard.',
        ],
        primaryAction: commonAction,
        fallbackLink: params.dashboardLink,
        footerLines: commonFooter,
      });
  }
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
  const category = resolveOnboardingCategory(
    params.summary.department,
    params.summary.condition,
  );

  return buildCategoryEmail(category, params);
}
