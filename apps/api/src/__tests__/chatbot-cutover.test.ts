import { afterEach, describe, expect, it } from 'vitest';
import { getChatbotV3CutoverState } from '../routes/chatbot-cutover.js';

const ORIGINAL_NODE_ENV = process.env.NODE_ENV;

describe('chatbot cutover helper', () => {
  afterEach(() => {
    if (ORIGINAL_NODE_ENV === undefined) {
      delete process.env.NODE_ENV;
    } else {
      process.env.NODE_ENV = ORIGINAL_NODE_ENV;
    }
    delete process.env['CHATBOT_V3_CUTOVER_ACTIVATED_AT'];
    delete process.env['CHATBOT_V3_CUTOVER_NOW'];
  });

  it('uses CHATBOT_V3_CUTOVER_NOW only in test env', () => {
    process.env.NODE_ENV = 'test';
    process.env['CHATBOT_V3_CUTOVER_ACTIVATED_AT'] = '2026-04-20T00:00:00.000Z';
    process.env['CHATBOT_V3_CUTOVER_NOW'] = '2026-04-21T00:00:00.000Z';

    const state = getChatbotV3CutoverState(new Date('2026-04-01T00:00:00.000Z'));

    expect(state.activatedAt.toISOString()).toBe('2026-04-20T00:00:00.000Z');
    expect(state.isWriteDisabled).toBe(true);
    expect(state.isHistoryDrainWindowOpen).toBe(true);
  });

  it('ignores CHATBOT_V3_CUTOVER_NOW outside test env', () => {
    process.env.NODE_ENV = 'production';
    process.env['CHATBOT_V3_CUTOVER_ACTIVATED_AT'] = '2026-04-20T00:00:00.000Z';
    process.env['CHATBOT_V3_CUTOVER_NOW'] = '2026-04-21T00:00:00.000Z';

    const state = getChatbotV3CutoverState(new Date('2026-04-01T00:00:00.000Z'));

    expect(state.activatedAt.toISOString()).toBe('2026-04-20T00:00:00.000Z');
    expect(state.isWriteDisabled).toBe(false);
    expect(state.isHistoryDrainWindowOpen).toBe(true);
  });
});
