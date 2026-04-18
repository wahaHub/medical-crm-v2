import type { Context } from 'hono';

const CHATBOT_V3_CUTOVER_ACTIVATED_AT_ENV = 'CHATBOT_V3_CUTOVER_ACTIVATED_AT';
const CHATBOT_V3_CUTOVER_NOW_ENV = 'CHATBOT_V3_CUTOVER_NOW';
const CHATBOT_V3_CUTOVER_DRAIN_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;
const FALLBACK_CUTOVER_ACTIVATED_AT = new Date('2099-01-01T00:00:00.000Z');

function parseCutoverActivatedAt(rawValue: string | undefined): Date {
  if (rawValue) {
    const parsed = new Date(rawValue);
    if (!Number.isNaN(parsed.getTime())) {
      return parsed;
    }
  }

  return FALLBACK_CUTOVER_ACTIVATED_AT;
}

export function getChatbotV3CutoverActivatedAt(): Date {
  return parseCutoverActivatedAt(process.env[CHATBOT_V3_CUTOVER_ACTIVATED_AT_ENV]);
}

function resolveCutoverNow(now = new Date()): Date {
  const override = process.env[CHATBOT_V3_CUTOVER_NOW_ENV];
  if (process.env.NODE_ENV !== 'test' || !override) {
    return now;
  }

  const parsed = new Date(override);
  return Number.isNaN(parsed.getTime()) ? now : parsed;
}

export function getChatbotV3CutoverState(now = new Date()): {
  activatedAt: Date;
  isWriteDisabled: boolean;
  isHistoryDrainWindowOpen: boolean;
} {
  const effectiveNow = resolveCutoverNow(now);
  const activatedAt = getChatbotV3CutoverActivatedAt();
  const activatedAtMs = activatedAt.getTime();
  const nowMs = effectiveNow.getTime();

  return {
    activatedAt,
    isWriteDisabled: nowMs >= activatedAtMs,
    isHistoryDrainWindowOpen: nowMs < activatedAtMs + CHATBOT_V3_CUTOVER_DRAIN_WINDOW_MS,
  };
}

export function isChatbotV3WriteCutoverActive(now = new Date()): boolean {
  return getChatbotV3CutoverState(now).isWriteDisabled;
}

export function isChatbotV3HistoryDrainWindowOpen(now = new Date()): boolean {
  return getChatbotV3CutoverState(now).isHistoryDrainWindowOpen;
}

export function legacyChatbotGoneResponse(c: Context): Response {
  return c.json({ error: 'Gone' }, 410);
}
