import { describe, expect, it } from 'vitest';
import type { voice } from '@livekit/agents';
import { privateAgentSessionStartOptions } from '../agent-session-privacy.js';
import { PlayoutArbiter } from '../playout-arbiter.js';
import { ProviderSlots } from '../provider-slots.js';
import { TurnGatedBuffer } from '../turn-gated-buffer.js';

function chunk(sequence: number, durationMs = 100, bytes = 16) {
  return {
    responseId: 'response-1',
    itemId: 'item-1',
    sequence,
    durationMs,
    bytes: new Uint8Array(bytes),
  };
}

describe('TURN_GATED_BUFFERED state', () => {
  it('starts the grace period at VAD speech-end instead of after EOT acceptance', () => {
    const buffer = new TurnGatedBuffer(30_000, 1_000, 700);
    expect(buffer.append(chunk(0))).toBe(true);
    expect(buffer.drain(10_000)).toEqual([]);
    buffer.speechEnded(1_000);
    expect(buffer.acceptEndOfTurn()).toBe(true);
    expect(buffer.markProviderFinal('response-1', 'item-1')).toBe(true);
    expect(buffer.drain(1_699)).toEqual([]);
    expect(buffer.drain(1_700)).toHaveLength(1);
  });

  it('plays immediately when EOT is accepted after the parallel grace period elapsed', () => {
    const buffer = new TurnGatedBuffer(30_000, 1_000, 700);
    buffer.append(chunk(0));
    buffer.speechEnded(1_000);
    buffer.markProviderFinal('response-1', 'item-1');
    expect(buffer.drain(1_800)).toEqual([]);
    expect(buffer.acceptEndOfTurn()).toBe(true);
    expect(buffer.drain(1_800)).toHaveLength(1);
  });

  it('latches EOT when its async callback arrives before VAD speech-end', () => {
    const buffer = new TurnGatedBuffer(30_000, 1_000, 700);
    buffer.append(chunk(0));
    expect(buffer.acceptEndOfTurn()).toBe(true);
    buffer.speechEnded(1_000);
    buffer.markProviderFinal('response-1', 'item-1');
    expect(buffer.drain(1_699)).toEqual([]);
    expect(buffer.drain(1_700)).toHaveLength(1);
  });

  it('keeps EOT and provider final latched until a later VAD grace clock starts', () => {
    const buffer = new TurnGatedBuffer(30_000, 1_000, 700);
    buffer.append(chunk(0));
    buffer.acceptEndOfTurn();
    buffer.markProviderFinal('response-1', 'item-1');
    expect(buffer.drain(99_999)).toEqual([]);
    buffer.speechEnded(2_000);
    expect(buffer.drain(2_699)).toEqual([]);
    expect(buffer.drain(2_700)).toHaveLength(1);
  });

  it('accepts mapped provider output after EOT while waiting for the final barrier', () => {
    const buffer = new TurnGatedBuffer(30_000, 1_000, 700);
    buffer.append(chunk(0));
    buffer.speechEnded(1_000);
    buffer.acceptEndOfTurn();
    expect(buffer.append(chunk(1))).toBe(true);
    expect(buffer.markProviderFinal('response-1', 'item-1')).toBe(true);
    expect(buffer.drain(1_700)).toHaveLength(2);
  });

  it('discards the whole turn on resume, overflow, or unproved mapping', () => {
    const resumed = new TurnGatedBuffer();
    resumed.append(chunk(0));
    resumed.speechEnded(1_000);
    resumed.speakerResumed();
    expect(resumed.discardReason).toBe('SPEAKER_RESUMED');
    expect(resumed.acceptEndOfTurn()).toBe(false);
    resumed.speechEnded(2_000);
    resumed.markProviderFinal('response-1', 'item-1');
    expect(resumed.drain(99_999)).toEqual([]);

    const overflow = new TurnGatedBuffer(150, 1_000);
    overflow.append(chunk(0, 100));
    expect(overflow.append(chunk(1, 100))).toBe(false);
    expect(overflow.discardReason).toBe('BUFFER_LIMIT');

    const discontinuity = new TurnGatedBuffer();
    expect(discontinuity.append(chunk(1))).toBe(false);
    expect(discontinuity.discardReason).toBe('MAPPING_UNPROVED');
  });
});

describe('provider slots and target-language arbiter', () => {
  it('caps provider sessions and deterministically admits waiting speakers', () => {
    const slots = new ProviderSlots(2);
    expect(slots.request({ trackId: 'a', observedAtMonotonicMs: 1 })).toBe('ACTIVE');
    expect(slots.request({ trackId: 'b', observedAtMonotonicMs: 2 })).toBe('ACTIVE');
    expect(slots.request({ trackId: 'd', observedAtMonotonicMs: 4 })).toBe('WAITING');
    expect(slots.request({ trackId: 'c', observedAtMonotonicMs: 3 })).toBe('WAITING');
    expect(slots.release('a')).toBe('c');
    expect(slots.isActive('c')).toBe(true);
    expect(slots.release('b')).toBe('d');
  });

  it('serializes same-language playout and drops items older than five seconds', () => {
    const arbiter = new PlayoutArbiter<string>();
    arbiter.enqueue({ id: 'later', targetLanguage: 'zh', eligibleAtMonotonicMs: 20, payload: '2' });
    arbiter.enqueue({ id: 'first', targetLanguage: 'zh', eligibleAtMonotonicMs: 10, payload: '1' });
    expect(arbiter.next('zh', 100)?.id).toBe('first');
    expect(arbiter.next('zh', 101)).toBeNull();
    arbiter.complete('zh');
    expect(arbiter.next('zh', 102)?.id).toBe('later');
    arbiter.complete('zh');
    arbiter.enqueue({ id: 'expired', targetLanguage: 'zh', eligibleAtMonotonicMs: 100, payload: 'x' });
    expect(arbiter.next('zh', 5_101)).toBeNull();
  });
});

describe('AgentSession privacy policy', () => {
  it('always opts the clinical session out of LiveKit recording and observability upload', () => {
    const agent = { name: 'interpretation-adapter' } as unknown as voice.Agent;
    expect(privateAgentSessionStartOptions(agent)).toEqual({ agent, record: false });
  });
});
