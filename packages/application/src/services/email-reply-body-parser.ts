export interface EmailReplyBodyInput {
  text?: string | null;
  html?: string | null;
}

const REPLY_MARKERS = [
  /^On .+ wrote:\s*$/i,
  /^-----Original Message-----\s*$/i,
  /^From:\s*/i,
  /^Sent:\s*/i,
];

export function parseEmailReplyBody(input: EmailReplyBodyInput): string {
  const body = input.text ?? stripHtml(input.html ?? '');
  return stripQuotedReply(body).trim();
}

function stripQuotedReply(body: string): string {
  const lines = body.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n');
  const keptLines: string[] = [];

  for (const line of lines) {
    if (REPLY_MARKERS.some((marker) => marker.test(line.trim()))) {
      break;
    }
    keptLines.push(line);
  }

  return keptLines.join('\n').replace(/[ \t]+\n/g, '\n').trim();
}

function stripHtml(html: string): string {
  return decodeHtmlEntities(
    html
      .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '')
      .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, '')
      .replace(/<(br|\/p|\/div|\/li|\/tr|\/h[1-6])\b[^>]*>/gi, '\n')
      .replace(/<[^>]+>/g, '')
      .replace(/\u00a0/g, ' '),
  );
}

function decodeHtmlEntities(value: string): string {
  return value
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'");
}
