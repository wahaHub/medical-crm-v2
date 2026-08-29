import { describe, expect, it } from 'vitest';
import type { voice } from '@livekit/agents';
import { privateAgentSessionStartOptions } from '../agent-session-privacy.js';
import { playoutAuthorityChanged } from '../livekit-media-adapter.js';
import { PlayoutArbiter } from '../playout-arbiter.js';
import { ProviderSlots } from '../provider-slots.js';
import { SpeakerTurnBoundary } from '../speaker-turn-boundary.js';
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
  it('drops a resumed utterance through its END regardless of async close latency', () => {
    const boundary = new SpeakerTurnBoundary();
    expect(boundary.onSpeechStart(true)).toBe('DISCARD_ACTIVE');
    // These frames arrive while provider/control-plane close is still pending.
    expect(boundary.acceptsPcm()).toBe(false);
    expect(boundary.onSpeechStart(false)).toBe('DROP');
    expect(boundary.acceptsPcm()).toBe(false);
    expect(boundary.onSpeechEnd()).toBe('DROPPED_END');
    expect(boundary.acceptsPcm()).toBe(true);
    expect(boundary.onSpeechStart(false)).toBe('START_TURN');
  });

  it('uses the same no-tail boundary for capacity loss and authorization revocation', () => {
    for (const reason of ['CAPACITY', 'AUTHORIZATION_REVOKED']) {
      const boundary = new SpeakerTurnBoundary();
      boundary.discardUntilSpeechEnd();
      expect(boundary.acceptsPcm(), reason).toBe(false);
      expect(boundary.onSpeechEnd(), reason).toBe('DROPPED_END');
      expect(boundary.acceptsPcm(), reason).toBe(true);
    }
  });

  it('caps provider sessions, immediately degrades overflow, and allows a later turn to retry', () => {
    const slots = new ProviderSlots(2);
    expect(slots.tryAcquire('a')).toBe('ACTIVE');
    expect(slots.tryAcquire('b')).toBe('ACTIVE');
    expect(slots.tryAcquire('c')).toBe('CAPACITY_UNAVAILABLE');
    expect(slots.isActive('c')).toBe(false);
    slots.release('a');
    // No mid-utterance promotion exists. A later explicit speech turn retries.
    expect(slots.isActive('c')).toBe(false);
    expect(slots.tryAcquire('c')).toBe('ACTIVE');
    slots.release('b');
    slots.release('c');
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

describe('playout authority snapshots', () => {
  const track = {
    id: 'track-1',
    participantIdentity: 'patient-1',
    trackSid: 'TR_1',
    sourceLanguage: 'en' as const,
    targetLanguage: 'zh' as const,
    languageVersion: 1,
    consentVersion: 1,
    authorizationRevision: 1,
    authorized: true,
  };

  it('invalidates on removal or any authority-version change, but not identical refreshes', () => {
    expect(playoutAuthorityChanged([track], [track])).toBe(false);
    expect(playoutAuthorityChanged([track], [])).toBe(true);
    expect(playoutAuthorityChanged([track], [{ ...track, authorizationRevision: 2 }])).toBe(true);
    expect(playoutAuthorityChanged([track], [{ ...track, languageVersion: 2 }])).toBe(true);
    expect(playoutAuthorityChanged([track], [{ ...track, consentVersion: 2 }])).toBe(true);
  });
});

describe('AgentSession privacy policy', () => {
  it('always opts the clinical session out of LiveKit recording and observability upload', () => {
    const agent = { name: 'interpretation-adapter' } as unknown as voice.Agent;
    expect(privateAgentSessionStartOptions(agent)).toEqual({ agent, record: false });
  });
});
