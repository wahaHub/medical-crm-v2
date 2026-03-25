export interface HospitalInvitationEmailPayload {
  hospitalName: string;
  registrationUrl: string;
  expiresInHours?: number;
}

function resolveAppOrigin(): string {
  return (
    process.env['ADMIN_ORIGIN'] ??
    process.env['NEXT_PUBLIC_ADMIN_ORIGIN'] ??
    'http://localhost:3002'
  );
}

function resolveLogoUrl(registrationUrl: string): string | null {
  const explicitLogoUrl =
    process.env['EMAIL_LOGO_URL']?.trim() ??
    process.env['MEDORA_LOGO_URL']?.trim();

  if (explicitLogoUrl) {
    return explicitLogoUrl;
  }

  const appOrigin = resolveAppOrigin().replace(/\/+$/, '');
  if (!/https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/i.test(appOrigin)) {
    return `${appOrigin}/medora_logo.png`;
  }

  try {
    const registrationOrigin = new URL(registrationUrl).origin.replace(/\/+$/, '');
    if (!/https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/i.test(registrationOrigin)) {
      return `${registrationOrigin}/medora_logo.png`;
    }
  } catch {
    // Ignore malformed URLs and fall back to text-only brand header.
  }

  return null;
}

export function buildHospitalInvitationEmail(payload: HospitalInvitationEmailPayload) {
  const expiresInHours = payload.expiresInHours ?? 72;
  const logoUrl = resolveLogoUrl(payload.registrationUrl);

  const subject = `【Medora Health】${payload.hospitalName} - 医院账号注册邀请`;

  const text = [
    `欢迎加入 Medora Health`,
    '',
    `医院：${payload.hospitalName}`,
    `注册链接：${payload.registrationUrl}`,
    '',
    `注册步骤：`,
    `1) 打开注册链接`,
    `2) 设置用户名和密码`,
    `3) 完成注册后即可登录`,
    '',
    `注意：该链接 ${expiresInHours} 小时后过期。`,
  ].join('\n');

  const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <style>
        body {
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
          line-height: 1.6;
          color: #333;
          margin: 0;
          background: #f3f4f6;
        }
        .container {
          max-width: 600px;
          margin: 0 auto;
          padding: 20px;
        }
        .header {
          background: linear-gradient(135deg, #14b8a6 0%, #10b981 100%);
          padding: 30px 20px;
          text-align: center;
          border-radius: 8px 8px 0 0;
        }
        .header img {
          height: 52px;
          display: block;
          margin: 0 auto;
        }
        .header p {
          margin: 10px 0 0 0;
          color: rgba(255,255,255,0.92);
          font-size: 14px;
        }
        .content {
          padding: 30px;
          background: #ffffff;
          border: 1px solid #e5e7eb;
          border-top: none;
        }
        .info-box {
          background: #f0fdfa;
          border-left: 4px solid #14b8a6;
          padding: 15px;
          margin: 20px 0;
        }
        .hospital-name {
          font-size: 20px;
          font-weight: 600;
          color: #14b8a6;
          margin: 10px 0;
        }
        .button {
          display: inline-block;
          background: linear-gradient(135deg, #14b8a6 0%, #10b981 100%);
          color: white !important;
          padding: 14px 32px;
          text-decoration: none;
          border-radius: 6px;
          font-weight: 600;
          margin: 20px 0;
          box-shadow: 0 4px 6px rgba(20, 184, 166, 0.3);
        }
        .steps {
          background: #f9fafb;
          padding: 20px;
          border-radius: 6px;
          margin: 20px 0;
        }
        .step {
          margin: 12px 0;
          padding-left: 25px;
          position: relative;
        }
        .step:before {
          content: "→";
          position: absolute;
          left: 0;
          color: #14b8a6;
          font-weight: bold;
        }
        .expiry-notice {
          background: #fef3c7;
          border: 1px solid #fbbf24;
          padding: 12px;
          border-radius: 6px;
          margin: 20px 0;
          font-size: 14px;
        }
        .footer {
          padding: 20px;
          text-align: center;
          font-size: 13px;
          color: #6b7280;
          background: #f9fafb;
          border-radius: 0 0 8px 8px;
        }
        .link-box {
          background: #f3f4f6;
          padding: 12px;
          border-radius: 6px;
          margin: 15px 0;
          word-break: break-all;
          font-size: 13px;
          color: #6b7280;
        }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          ${logoUrl
            ? `<img src="${logoUrl}" alt="Medora Health" />`
            : '<div style="font-size: 28px; font-weight: 700; color: #ffffff; letter-spacing: 0.04em;">MEDORA</div>'}
          <p>医疗旅游案例管理系统</p>
        </div>
        <div class="content">
          <h2 style="color: #1f2937; margin-top: 0;">欢迎加入 Medora Health!</h2>

          <p>您好，</p>

          <p>我们已为您的医院创建了 Medora Health 平台账号:</p>

          <div class="info-box">
            <div class="hospital-name">${payload.hospitalName}</div>
            <div style="color: #6b7280; font-size: 14px;">医院管理员账号</div>
          </div>

          <p>请点击下方按钮完成账号注册:</p>

          <div style="text-align: center;">
            <a href="${payload.registrationUrl}" class="button">
              立即注册账号
            </a>
          </div>

          <div class="steps">
            <strong style="color: #1f2937;">注册步骤:</strong>
            <div class="step">点击上方注册按钮</div>
            <div class="step">设置您的用户名和登录密码</div>
            <div class="step">完成注册，即可登录使用</div>
          </div>

          <div class="expiry-notice">
            ⏰ <strong>注意:</strong> 此邀请链接将在 ${expiresInHours} 小时后失效，请尽快完成注册。
          </div>

          <p style="margin-top: 25px; font-size: 14px; color: #6b7280;">
            如果按钮无法点击，请复制以下链接到浏览器地址栏访问:
          </p>
          <div class="link-box">
            ${payload.registrationUrl}
          </div>
        </div>
        <div class="footer">
          <p>此邮件由 Medora Health 系统自动发送，请勿直接回复。</p>
          <p style="margin: 5px 0;">如有疑问，请联系系统管理员。</p>
        </div>
      </div>
    </body>
    </html>
  `;

  return { subject, html, text };
}
