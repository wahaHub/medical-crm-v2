import { buildTransactionalEmail } from './transactional-email.template.js';

export interface PatientRecordsUploadEmailPayload {
  patientName: string;
  fileName: string;
  dashboardLink: string;
  locale?: string | null;
}

export function buildPatientRecordsUploadEmail(payload: PatientRecordsUploadEmailPayload) {
  const isChinese = payload.locale?.toLowerCase().startsWith('zh') ?? false;

  if (isChinese) {
    return buildTransactionalEmail({
      locale: payload.locale,
      subject: '我们已收到您的医疗资料',
      preheader: '您上传的医疗资料已成功添加到 Medora 病例。',
      eyebrow: '资料上传确认',
      title: '您的医疗资料已上传成功',
      intro: [`${payload.patientName}，您好！`, `我们已成功收到文件“${payload.fileName}”。`],
      body: [
        '我们的医疗团队将审阅您提交的资料。',
        '如果您的情况适合下一步评估，我们会尽快与您联系，并安排与中国医生的线上面诊。',
      ],
      primaryAction: { label: '查看患者中心', url: payload.dashboardLink },
      fallbackLink: payload.dashboardLink,
      footerLines: [
        '此邮件由 Medora Health 系统自动发送。',
        '为保护您的隐私，请勿通过不安全的渠道转发医疗资料。',
      ],
    });
  }

  return buildTransactionalEmail({
    locale: payload.locale ?? 'en',
    subject: "We've received your medical records",
    preheader: 'Your uploaded medical record has been added to your Medora case.',
    eyebrow: 'Upload Confirmation',
    title: 'Your medical records were uploaded successfully',
    intro: [`Hello ${payload.patientName},`, `We have successfully received the following file: ${payload.fileName}.`],
    body: [
      'Our medical team will review the information you submitted.',
      'If your case is appropriate for the next stage of assessment, we will contact you as soon as possible to arrange an online consultation with a doctor in China.',
    ],
    primaryAction: { label: 'Open patient dashboard', url: payload.dashboardLink },
    fallbackLink: payload.dashboardLink,
    footerLines: [
      'This email was sent automatically by Medora Health.',
      'To protect your privacy, please do not forward medical records through unsecured channels.',
    ],
  });
}
