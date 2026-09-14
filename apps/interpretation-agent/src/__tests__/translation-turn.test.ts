import { EventEmitter } from 'node:events';
import { describe, expect, it, vi } from 'vitest';
import type { TranslationDoneEvent } from '../openai-realtime-translation.js';
import {
  TranslationTurn,
  type TranslationTransport,
  type TranslationTransportEvents,
} from '../translation-turn.js';

class FakeTransport extends EventEmitter<TranslationTransportEvents> implements TranslationTransport {
  appended: Uint8Array[] = [];
  aborted = false;
  closeEvent: TranslationDoneEvent = { type: 'session.closed', event_id: 'close-event' };

  async connect(): Promise<void> {
    this.emit('event', { type: 'session.updated', session: { id: 'provider-session-1' } });
  }

  appendPcm16(pcm16: Uint8Array): void {
    this.appended.push(pcm16);
  }

  async closeAndDrain(): Promise<TranslationDoneEvent> {
    this.emit('closed', this.closeEvent);
    return this.closeEvent;
  }

  abort(): void {
    this.aborted = true;
  }
}

// Mirrors the production event ordering: session.closed resolves the drain,
// then the provider flushes the remaining transcript deltas.
class LateFlushTransport extends FakeTransport {
  override async closeAndDrain(): Promise<TranslationDoneEvent> {
    const closed = super.closeAndDrain();
    this.emit('inputTranscriptDelta', { type: 'session.input_transcript.delta', delta: 'hello' });
    this.emit('outputTranscriptDelta', { type: 'session.output_transcript.delta', delta: '你好' });
    return closed;
  }
}

describe('single-session translation turn', () => {
  it('waits for provider drain, EOT, and the parallel VAD grace before releasing audio', async () => {
    const transport = new FakeTransport();
    const wait = vi.fn(async () => undefined);
    const captions: Array<{ isFinal: boolean }> = [];
    const streamedAudio: Uint8Array[] = [];
    const turn = new TranslationTurn({
      transport,
      sourceLanguage: 'en',
      targetLanguage: 'zh',
      now: () => 1_200,
      wait,
      onCaption: (caption) => captions.push(caption),
      onAudioChunk: (chunk) => streamedAudio.push(chunk),
    });
    await turn.connect();
    expect(turn.appendPcm16(new Uint8Array([1, 0]), true)).toBe(true);
    transport.emit('inputTranscriptDelta', { type: 'session.input_transcript.delta', delta: 'hello' });
    transport.emit('outputTranscriptDelta', { type: 'session.output_transcript.delta', delta: '你好' });
    transport.emit('outputAudioDelta', { type: 'session.output_audio.delta', delta: 'AQI=' }, new Uint8Array([1, 2]));
    expect(streamedAudio).toHaveLength(1);

    const completed = await turn.finish(1_000, Promise.resolve(true));
    expect(wait).toHaveBeenCalledWith(500);
    expect(completed?.providerCloseReference).toBe('provider-session-1');
    expect(completed?.caption).toMatchObject({ sourceText: 'hello', translatedText: '你好', isFinal: true });
    expect(completed?.audio).toHaveLength(1);
    expect(captions.at(-1)?.isFinal).toBe(true);
  });

  it('discards all buffered speech when the speaker resumes', async () => {
    const transport = new FakeTransport();
    const turn = new TranslationTurn({ transport, sourceLanguage: 'zh', targetLanguage: 'en' });
    await turn.connect();
    transport.emit('outputTranscriptDelta', { type: 'session.output_transcript.delta', delta: 'hello' });
    transport.emit('outputAudioDelta', { type: 'session.output_audio.delta', delta: 'AQI=' }, new Uint8Array([1, 2]));
    turn.speakerResumed();
    expect(turn.discardReason).toBe('SPEAKER_RESUMED');
    expect(transport.aborted).toBe(true);
    expect(await turn.finish(0, Promise.resolve(true))).toBeNull();
  });

  it('completes when the source transcript never arrives', async () => {
    // Production failure mode: the provider flushes input transcripts lazily,
    // so a turn can hold a full translation with an empty source text.
    const transport = new FakeTransport();
    const turn = new TranslationTurn({ transport, sourceLanguage: 'en', targetLanguage: 'zh', wait: async () => undefined });
    await turn.connect();
    turn.appendPcm16(new Uint8Array([1, 0]), true);
    transport.emit('outputTranscriptDelta', { type: 'session.output_transcript.delta', delta: '你好' });
    transport.emit('outputAudioDelta', { type: 'session.output_audio.delta', delta: 'AQI=' }, new Uint8Array([1, 2]));

    const completed = await turn.finish(0, Promise.resolve(true));
    expect(completed).not.toBeNull();
    expect(completed?.audio).toHaveLength(1);
    expect(completed?.caption).toMatchObject({ sourceText: '', translatedText: '你好', isFinal: true });
  });

  it('completes on translated audio alone, without publishing an empty caption', async () => {
    const transport = new FakeTransport();
    const captions: Array<{ isFinal: boolean }> = [];
    const turn = new TranslationTurn({
      transport,
      sourceLanguage: 'en',
      targetLanguage: 'zh',
      onCaption: (caption) => captions.push(caption),
      wait: async () => undefined,
    });
    await turn.connect();
    turn.appendPcm16(new Uint8Array([1, 0]), true);
    transport.emit('outputAudioDelta', { type: 'session.output_audio.delta', delta: 'AQI=' }, new Uint8Array([1, 2]));

    const completed = await turn.finish(0, Promise.resolve(true));
    expect(completed).not.toBeNull();
    expect(completed?.audio).toHaveLength(1);
    expect(captions.filter((c) => c.isFinal)).toHaveLength(0);
  });

  it('counts transcript deltas flushed after session.closed during the drain window', async () => {
    const transport = new LateFlushTransport();
    const captions: Array<{ isFinal: boolean; translatedText: string }> = [];
    const turn = new TranslationTurn({
      transport,
      sourceLanguage: 'en',
      targetLanguage: 'zh',
      onCaption: (caption) => captions.push(caption),
      wait: async () => undefined,
    });
    await turn.connect();
    turn.appendPcm16(new Uint8Array([1, 0]), true);
    transport.emit('outputAudioDelta', { type: 'session.output_audio.delta', delta: 'AQI=' }, new Uint8Array([1, 2]));

    const completed = await turn.finish(0, Promise.resolve(true));
    expect(completed).not.toBeNull();
    expect(completed?.caption).toMatchObject({ sourceText: 'hello', translatedText: '你好', isFinal: true });
    expect(captions.at(-1)).toMatchObject({ isFinal: true, translatedText: '你好' });
  });

  it('returns null for an empty turn with no translated output at all', async () => {
    const transport = new FakeTransport();
    const turn = new TranslationTurn({ transport, sourceLanguage: 'en', targetLanguage: 'zh', wait: async () => undefined });
    await turn.connect();
    turn.appendPcm16(new Uint8Array([1, 0]), true);
    transport.emit('inputTranscriptDelta', { type: 'session.input_transcript.delta', delta: 'hello' });

    expect(await turn.finish(0, Promise.resolve(true))).toBeNull();
  });

  it('fails closed on authorization loss or bounded-audio overflow', async () => {
    const revokedTransport = new FakeTransport();
    const revoked = new TranslationTurn({
      transport: revokedTransport,
      sourceLanguage: 'en',
      targetLanguage: 'zh',
    });
    await revoked.connect();
    expect(revoked.appendPcm16(new Uint8Array([1, 0]), false)).toBe(false);
    expect(revoked.discardReason).toBe('AUTHORIZATION_REVOKED');

    const overflowTransport = new FakeTransport();
    const overflow = new TranslationTurn({
      transport: overflowTransport,
      sourceLanguage: 'en',
      targetLanguage: 'zh',
      maxAudioBytes: 2,
    });
    await overflow.connect();
    overflowTransport.emit(
      'outputAudioDelta',
      { type: 'session.output_audio.delta', delta: 'AQIDBA==' },
      new Uint8Array([1, 2, 3, 4]),
    );
    expect(overflow.discardReason).toBe('BUFFER_LIMIT');
    expect(overflowTransport.aborted).toBe(true);
  });

  it('accepts translated medical speech longer than the former 30-second limit', async () => {
    const transport = new FakeTransport();
    const turn = new TranslationTurn({
      transport,
      sourceLanguage: 'en',
      targetLanguage: 'zh',
      wait: async () => undefined,
    });
    await turn.connect();
    turn.appendPcm16(new Uint8Array([1, 0]), true);
    transport.emit('outputTranscriptDelta', { type: 'session.output_transcript.delta', delta: '完整译文' });
    transport.emit(
      'outputAudioDelta',
      { type: 'session.output_audio.delta', delta: 'buffered-test-audio' },
      new Uint8Array(24_000 * 2 * 31),
    );

    expect(turn.discardReason).toBeNull();
    expect(await turn.finish(0, Promise.resolve(true))).not.toBeNull();
  });

  it('uses a completion-style full transcript when no output deltas ever arrive', async () => {
    const transport = new FakeTransport();
    const turn = new TranslationTurn({
      transport,
      sourceLanguage: 'en',
      targetLanguage: 'zh',
      wait: async () => undefined,
    });
    await turn.connect();
    turn.appendPcm16(new Uint8Array([1, 0]), true);
    transport.emit('inputTranscript', 'Okay, we will schedule the surgery next week.');
    transport.emit('outputTranscript', '好的，我们下周安排手术。');
    transport.emit('outputAudioDelta', { type: 'session.output_audio.delta', delta: 'AQI=' }, new Uint8Array([1, 2]));

    const completed = await turn.finish(0, Promise.resolve(true));
    expect(completed).not.toBeNull();
    expect(completed?.caption).toMatchObject({
      sourceText: 'Okay, we will schedule the surgery next week.',
      translatedText: '好的，我们下周安排手术。',
      isFinal: true,
    });
  });

  it('keeps the longer text when full transcripts and deltas race', async () => {
    const transport = new FakeTransport();
    const turn = new TranslationTurn({
      transport,
      sourceLanguage: 'en',
      targetLanguage: 'zh',
      wait: async () => undefined,
    });
    await turn.connect();
    turn.appendPcm16(new Uint8Array([1, 0]), true);
    transport.emit('outputTranscriptDelta', { type: 'session.output_transcript.delta', delta: '好的，我们下周安排手术。' });
    // Shorter than the delta-accumulated text: must not clobber it.
    transport.emit('outputTranscript', '好的');
    transport.emit('outputAudioDelta', { type: 'session.output_audio.delta', delta: 'AQI=' }, new Uint8Array([1, 2]));

    const completed = await turn.finish(0, Promise.resolve(true));
    expect(completed?.caption.translatedText).toBe('好的，我们下周安排手术。');
  });
});
