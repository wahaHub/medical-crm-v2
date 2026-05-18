export type TransactionalEmailLocale = 'en' | 'zh' | 'fr' | 'es' | 'de';

type SummaryItem = {
  label: string;
  value: string;
};

type ActionLink = {
  label: string;
  url: string;
};

type ConversationItem = {
  speaker: string;
  text: string;
};

export interface TransactionalEmailPayload {
  locale?: string | null;
  subject: string;
  preheader?: string;
  eyebrow?: string;
  title: string;
  intro?: string[];
  summaryItems?: SummaryItem[];
  body?: string[];
  redLines?: string[];
  primaryAction?: ActionLink;
  secondaryAction?: ActionLink;
  conversationTitle?: string;
  conversationItems?: ConversationItem[];
  notice?: string;
  fallbackLink?: string;
  footerLines?: string[];
  logoBaseUrl?: string | null;
}

const STRINGS: Record<TransactionalEmailLocale, {
  brandTagline: string;
  fallbackLabel: string;
  conversationFallbackTitle: string;
}> = {
  en: {
    brandTagline: 'Premium Care, Right Fare',
    fallbackLabel: 'If the button does not work, copy and paste this link into your browser:',
    conversationFallbackTitle: 'Recent conversation',
  },
  zh: {
    brandTagline: 'Premium Care, Right Fare',
    fallbackLabel: '如果按钮无法点击，请复制以下链接到浏览器中打开：',
    conversationFallbackTitle: '近期对话',
  },
  fr: {
    brandTagline: 'Premium Care, Right Fare',
    fallbackLabel: 'Si le bouton ne fonctionne pas, copiez et collez ce lien dans votre navigateur :',
    conversationFallbackTitle: 'Conversation recente',
  },
  es: {
    brandTagline: 'Premium Care, Right Fare',
    fallbackLabel: 'Si el boton no funciona, copia y pega este enlace en tu navegador:',
    conversationFallbackTitle: 'Conversacion reciente',
  },
  de: {
    brandTagline: 'Premium Care, Right Fare',
    fallbackLabel: 'Wenn die Schaltflache nicht funktioniert, kopieren Sie diesen Link in Ihren Browser:',
    conversationFallbackTitle: 'Letzte Unterhaltung',
  },
};

function normalizeLocale(locale?: string | null): TransactionalEmailLocale {
  const base = locale?.toLowerCase().split(/[-_]/)[0];
  if (base === 'zh' || base === 'fr' || base === 'es' || base === 'de') {
    return base;
  }
  return 'en';
}

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function resolveLogoUrl(explicitBaseUrl?: string | null): string | null {
  const configured =
    process.env['EMAIL_LOGO_URL']?.trim()
    ?? process.env['MEDORA_LOGO_URL']?.trim()
    ?? explicitBaseUrl?.trim()
    ?? null;

  if (!configured) {
    return null;
  }

  return configured.replace(/\/+$/, '').endsWith('.png')
    ? configured.replace(/\/+$/, '')
    : `${configured.replace(/\/+$/, '')}/medora_logo.png`;
}

export function buildTransactionalEmail(payload: TransactionalEmailPayload) {
  const locale = normalizeLocale(payload.locale);
  const strings = STRINGS[locale];
  const logoUrl = resolveLogoUrl(payload.logoBaseUrl);

  const introHtml = (payload.intro ?? [])
    .map((line) => `<p style="margin: 0 0 14px;">${escapeHtml(line)}</p>`)
    .join('');

  const bodyHtml = (payload.body ?? [])
    .map((line) => {
      const isRed = payload.redLines?.includes(line);
      const style = isRed ? 'margin: 0 0 14px; color: #dc2626; font-weight: 600;' : 'margin: 0 0 14px;';
      return `<p style="${style}">${escapeHtml(line)}</p>`;
    })
    .join('');

  const summaryHtml = payload.summaryItems?.length
    ? `
      <div style="margin: 22px 0; padding: 18px 20px; border: 1px solid #dbe7f3; border-radius: 16px; background: #f8fbff;">
        ${payload.summaryItems
          .map((item) => `
            <div style="margin: 0 0 10px;">
              <div style="font-size: 12px; letter-spacing: 0.08em; text-transform: uppercase; color: #64748b; margin-bottom: 2px;">
                ${escapeHtml(item.label)}
              </div>
              <div style="font-size: 15px; color: #0f172a; font-weight: 600;">
                ${escapeHtml(item.value)}
              </div>
            </div>
          `)
          .join('')}
      </div>
    `
    : '';

  const conversationHtml = payload.conversationItems?.length
    ? `
      <div style="margin: 22px 0; padding: 18px 20px; border-radius: 16px; background: #f8fafc; border: 1px solid #e2e8f0;">
        <div style="font-size: 14px; font-weight: 700; color: #0f172a; margin-bottom: 12px;">
          ${escapeHtml(payload.conversationTitle ?? strings.conversationFallbackTitle)}
        </div>
        ${payload.conversationItems
          .map((item) => `
            <div style="margin: 0 0 10px;">
              <div style="font-size: 12px; color: #64748b; margin-bottom: 2px;">${escapeHtml(item.speaker)}</div>
              <div style="font-size: 14px; color: #0f172a;">${escapeHtml(item.text)}</div>
            </div>
          `)
          .join('')}
      </div>
    `
    : '';

  const primaryActionHtml = payload.primaryAction
    ? `
      <div style="margin: 26px 0 18px; text-align: center;">
        <a
          href="${payload.primaryAction.url}"
          style="display: inline-block; background: linear-gradient(90deg, #1da78a, #0f638e); color: #ffffff; text-decoration: none; padding: 14px 28px; border-radius: 9999px; font-weight: 700; font-size: 15px;"
        >
          ${escapeHtml(payload.primaryAction.label)}
        </a>
      </div>
    `
    : '';

  const secondaryActionHtml = payload.secondaryAction
    ? `
      <div style="margin: 0 0 18px; text-align: center;">
        <a
          href="${payload.secondaryAction.url}"
          style="display: inline-block; color: #0f638e; text-decoration: none; font-weight: 600; font-size: 14px;"
        >
          ${escapeHtml(payload.secondaryAction.label)}
        </a>
      </div>
    `
    : '';

  const noticeHtml = payload.notice
    ? `
      <div style="margin: 20px 0; padding: 14px 16px; border-radius: 12px; background: #fff7ed; border: 1px solid #fdba74; color: #9a3412; font-size: 14px;">
        ${escapeHtml(payload.notice)}
      </div>
    `
    : '';

  const fallbackLinkHtml = payload.fallbackLink
    ? `
      <div style="margin: 18px 0 0;">
        <div style="font-size: 13px; color: #64748b; margin-bottom: 8px;">
          ${escapeHtml(strings.fallbackLabel)}
        </div>
        <div style="padding: 12px 14px; border-radius: 12px; background: #f8fafc; border: 1px solid #e2e8f0; word-break: break-all; font-size: 13px;">
          <a href="${payload.fallbackLink}" style="color: #0f638e;">${escapeHtml(payload.fallbackLink)}</a>
        </div>
      </div>
    `
    : '';

  const footerHtml = (payload.footerLines ?? [])
    .map((line) => `<div style="margin: 0 0 4px;">${escapeHtml(line)}</div>`)
    .join('');

  const textSections = [
    payload.eyebrow,
    payload.title,
    '',
    ...(payload.intro ?? []),
    ...(payload.summaryItems?.length
      ? ['', ...payload.summaryItems.map((item) => `${item.label}: ${item.value}`)]
      : []),
    ...(payload.body ?? []).length ? ['', ...(payload.body ?? [])] : [],
    payload.primaryAction ? ['', `${payload.primaryAction.label}: ${payload.primaryAction.url}`] : [],
    payload.secondaryAction ? [`${payload.secondaryAction.label}: ${payload.secondaryAction.url}`] : [],
    ...(payload.conversationItems?.length
      ? [
          '',
          payload.conversationTitle ?? strings.conversationFallbackTitle,
          ...payload.conversationItems.map((item) => `${item.speaker}: ${item.text}`),
        ]
      : []),
    payload.notice ? ['', payload.notice] : [],
    payload.fallbackLink ? ['', `${strings.fallbackLabel}`, payload.fallbackLink] : [],
    ...(payload.footerLines?.length ? ['', ...payload.footerLines] : []),
  ]
    .filter((value): value is string => Boolean(value))
    .join('\n');

  const html = `
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
        <meta name="color-scheme" content="light only" />
        ${payload.preheader
          ? `<meta name="description" content="${escapeHtml(payload.preheader)}" />`
          : ''}
      </head>
      <body style="margin: 0; padding: 0; background: #eef8f7; color: #0f172a; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;">
        <div style="display: none; max-height: 0; overflow: hidden; opacity: 0;">
          ${escapeHtml(payload.preheader ?? payload.title)}
        </div>
        <div style="max-width: 640px; margin: 0 auto; padding: 28px 18px;">
          <div style="border-radius: 28px; overflow: hidden; background: #ffffff; box-shadow: 0 22px 48px rgba(15, 23, 42, 0.10);">
            <div style="padding: 34px 32px 22px; background: radial-gradient(circle at top, rgba(20,184,166,0.18), transparent 55%), linear-gradient(180deg, #f7fffd 0%, #f0fbf8 100%); text-align: center;">
              ${logoUrl
                ? `<img src="${logoUrl}" alt="Medora Health" style="height: 72px; width: auto; display: block; margin: 0 auto 16px;" />`
                : '<div style="font-size: 30px; font-weight: 800; color: #0f638e; letter-spacing: 0.02em; margin-bottom: 12px;">Medora Health</div>'}
              <div style="font-size: 13px; letter-spacing: 0.08em; text-transform: uppercase; color: #1d8f85; margin-bottom: 10px;">
                ${escapeHtml(payload.eyebrow ?? strings.brandTagline)}
              </div>
              <div style="font-size: 32px; line-height: 1.15; font-weight: 800; color: #0f172a;">
                ${escapeHtml(payload.title)}
              </div>
            </div>
            <div style="padding: 28px 32px 32px;">
              ${introHtml}
              ${summaryHtml}
              ${bodyHtml}
              ${primaryActionHtml}
              ${secondaryActionHtml}
              ${conversationHtml}
              ${noticeHtml}
              ${fallbackLinkHtml}
            </div>
            <div style="padding: 18px 24px 24px; background: #f8fafc; border-top: 1px solid #e2e8f0; color: #64748b; font-size: 13px; text-align: center;">
              ${footerHtml}
            </div>
          </div>
        </div>
      </body>
    </html>
  `;

  return {
    subject: payload.subject,
    text: textSections,
    html,
  };
}
