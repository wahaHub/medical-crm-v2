import type {
  ChatbotV3ChatRequest,
} from '@medical-crm/validation';

interface RequestableApp {
  request(path: string, init?: RequestInit): Response | Promise<Response>;
}

export interface ChatbotV3SessionDriverOptions {
  app: RequestableApp;
  sessionId: string;
  path?: string;
  headers?: HeadersInit;
  cookies?: Record<string, string | null | undefined>;
}

export interface ChatbotV3SessionTurnInput {
  message: string;
  attachments?: ChatbotV3ChatRequest['attachments'];
  pageContext?: ChatbotV3ChatRequest['pageContext'];
  headers?: HeadersInit;
  cookies?: Record<string, string | null | undefined>;
}

export interface ChatbotV3SessionTurnResult<TBody = unknown> {
  status: number;
  body: TBody | undefined;
  response: Response;
}

export function createChatbotV3SessionDriver(
  options: ChatbotV3SessionDriverOptions,
) {
  const path = options.path ?? '/api/v3/chatbot/chat';
  const defaultHeaders = new Headers(options.headers);
  const cookieJar = { ...(options.cookies ?? {}) };

  return {
    async sendTurn<TBody = unknown>(
      turn: ChatbotV3SessionTurnInput,
    ): Promise<ChatbotV3SessionTurnResult<TBody>> {
      const headers = new Headers(defaultHeaders);
      headers.set('Content-Type', 'application/json');

      for (const [key, value] of new Headers(turn.headers).entries()) {
        headers.set(key, value);
      }

      const cookies = {
        ...cookieJar,
        ...(turn.cookies ?? {}),
      };
      const cookieHeader = serializeCookies(cookies);
      if (cookieHeader) {
        headers.set('Cookie', cookieHeader);
      } else {
        headers.delete('Cookie');
      }

      const response = await options.app.request(path, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          sessionId: options.sessionId,
          message: turn.message,
          ...(turn.attachments ? { attachments: turn.attachments } : {}),
          ...(turn.pageContext ? { pageContext: turn.pageContext } : {}),
        } satisfies ChatbotV3ChatRequest),
      });

      mergeSetCookiesIntoJar(cookieJar, response.headers);

      const responseClone = response.clone();
      const body = response.headers.get('content-type')?.includes('application/json')
        ? await responseClone.json() as TBody
        : undefined;

      return {
        status: response.status,
        body,
        response,
      };
    },
  };
}

function serializeCookies(
  cookies: Record<string, string | null | undefined>,
): string {
  return Object.entries(cookies)
    .filter((entry): entry is [string, string] => typeof entry[1] === 'string' && entry[1].length > 0)
    .map(([name, value]) => `${name}=${value}`)
    .join('; ');
}

function mergeSetCookiesIntoJar(
  cookieJar: Record<string, string | null | undefined>,
  headers: Headers,
) {
  for (const setCookie of readSetCookieHeaders(headers)) {
    const parsed = parseSetCookie(setCookie);
    if (!parsed) {
      continue;
    }

    if (parsed.cleared) {
      delete cookieJar[parsed.name];
      continue;
    }

    cookieJar[parsed.name] = parsed.value;
  }
}

function readSetCookieHeaders(headers: Headers): string[] {
  const withGetSetCookie = headers as Headers & {
    getSetCookie?: () => string[];
  };

  if (typeof withGetSetCookie.getSetCookie === 'function') {
    return withGetSetCookie.getSetCookie();
  }

  const combinedHeader = headers.get('set-cookie');
  if (!combinedHeader) {
    return [];
  }

  return combinedHeader.split(/,(?=[^;,]+=[^;,]+)/g);
}

function parseSetCookie(
  headerValue: string,
): { name: string; value: string; cleared: boolean } | null {
  const [cookiePair, ...attributes] = headerValue.split(';').map((part) => part.trim());
  const separatorIndex = cookiePair.indexOf('=');
  if (separatorIndex <= 0) {
    return null;
  }

  const name = cookiePair.slice(0, separatorIndex).trim();
  const value = cookiePair.slice(separatorIndex + 1).trim();
  const cleared = value.length === 0 || attributes.some((attribute) => /^max-age=0$/i.test(attribute));

  return {
    name,
    value,
    cleared,
  };
}
