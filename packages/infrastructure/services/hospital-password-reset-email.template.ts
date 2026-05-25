import { buildTransactionalEmail } from './transactional-email.template.js';

export interface HospitalPasswordResetEmailPayload {
  hospitalName: string;
  resetUrl: string;
  expiresInMinutes?: number;
  locale?: string | null;
}

export function buildHospitalPasswordResetEmail(payload: HospitalPasswordResetEmailPayload) {
  const expiresInMinutes = payload.expiresInMinutes ?? 60;

  return buildTransactionalEmail({
    locale: payload.locale ?? 'zh',
    subject: `【Medora Health】${payload.hospitalName} - 重置医院端账户密码`,
    preheader: '使用安全链接重置您的医院端登录密码',
    eyebrow: 'Hospital Portal Security',
    title: '重置您的医院端密码',
    intro: [
      '我们收到了一个重置医院端账户密码的请求。',
      '请点击下面的安全链接设置新密码。',
    ],
    summaryItems: [
      { label: 'Hospital', value: payload.hospitalName },
      { label: 'Request', value: 'Password reset' },
    ],
    body: [
      '如果这是您本人发起的操作，请继续完成密码重置。',
      '如果您没有请求重置密码，可以忽略这封邮件，当前密码不会被更改。',
    ],
    primaryAction: {
      label: '重置密码',
      url: payload.resetUrl,
    },
    notice: `此密码重置链接将在 ${expiresInMinutes} 分钟后失效，并且只能使用一次。`,
    fallbackLink: payload.resetUrl,
    footerLines: [
      '此邮件由 Medora Health 系统自动发送，请勿直接回复。',
      '为了账户安全，请不要将此链接转发给其他人。',
    ],
  });
}
