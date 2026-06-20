import crypto from 'crypto';

function base64UrlEncode(input: string): string {
  return Buffer.from(input)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

function sign(input: string, secret: string): string {
  return crypto.createHmac('sha256', secret).update(input).digest('base64url');
}

export interface LiveKitTokenInput {
  roomName: string;
  identity: string;
  displayName?: string;
}

export interface LiveKitTokenResult {
  token: string;
  livekitUrl: string;
  identity: string;
  roomName: string;
}

export function createLiveKitToken(input: LiveKitTokenInput): LiveKitTokenResult {
  const livekitUrl = process.env.LIVEKIT_URL;
  const apiKey = process.env.LIVEKIT_API_KEY;
  const apiSecret = process.env.LIVEKIT_API_SECRET;

  if (!livekitUrl || !apiKey || !apiSecret) {
    throw new Error('LIVEKIT_URL, LIVEKIT_API_KEY and LIVEKIT_API_SECRET are required');
  }

  const now = Math.floor(Date.now() / 1000);
  const header = { alg: 'HS256', typ: 'JWT' };
  const payload = {
    iss: apiKey,
    sub: input.identity,
    name: input.displayName || input.identity,
    nbf: now,
    exp: now + 2 * 60 * 60,
    metadata: '',
    video: {
      room: input.roomName,
      roomJoin: true,
      canPublish: true,
      canSubscribe: true,
    },
  };

  const encodedHeader = base64UrlEncode(JSON.stringify(header));
  const encodedPayload = base64UrlEncode(JSON.stringify(payload));
  const signingInput = `${encodedHeader}.${encodedPayload}`;
  const signature = sign(signingInput, apiSecret);
  const token = `${signingInput}.${signature}`;

  return {
    token,
    livekitUrl,
    identity: input.identity,
    roomName: input.roomName,
  };
}
