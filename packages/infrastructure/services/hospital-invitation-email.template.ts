import { buildTransactionalEmail } from './transactional-email.template.js';

export interface HospitalInvitationEmailPayload {
  hospitalName: string;
  registrationUrl: string;
  expiresInHours?: number;
  locale?: string | null;
}

export function buildHospitalInvitationEmail(payload: HospitalInvitationEmailPayload) {
  const expiresInHours = payload.expiresInHours ?? 72;

  return buildTransactionalEmail({
    locale: payload.locale ?? 'zh',
    subject: `【Medora Health】${payload.hospitalName} - 医院账号注册邀请`,
    preheader: `${payload.hospitalName} 的医院端注册邀请`,
    eyebrow: 'Hospital Portal',
    title: '欢迎加入 Medora Health',
    intro: [
      '我们已经为您的医院准备好了 Medora Health 医院端账号。',
      '请使用下面的安全注册链接完成账号激活和密码设置。',
    ],
    summaryItems: [
      { label: 'Hospital', value: payload.hospitalName },
      { label: 'Access', value: 'Hospital administrator account' },
    ],
    body: [
      '完成注册后，您就可以登录医院端，管理患者案例、报价和沟通。',
    ],
    primaryAction: {
      label: '完成医院注册',
      url: payload.registrationUrl,
    },
    notice: `此注册链接将在 ${expiresInHours} 小时后失效，请尽快完成注册。`,
    fallbackLink: payload.registrationUrl,
    footerLines: [
      '此邮件由 Medora Health 系统自动发送，请勿直接回复。',
      '如需帮助，请联系 Medora Health 支持团队。',
    ],
  });
}
