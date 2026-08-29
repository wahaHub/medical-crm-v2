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

describe('single-session translation turn', () => {
  it('waits for provider drain, EOT, and the parallel VAD grace before releasing audio', async () => {
    const transport = new FakeTransport();
    const wait = vi.fn(async () => undefined);
    const captions: Array<{ isFinal: boolean }> = [];
    const turn = new TranslationTurn({
      transport,
      sourceLanguage: 'en',
      targetLanguage: 'zh',
      now: () => 1_200,
      wait,
      onCaption: (caption) => captions.push(caption),
    });
    await turn.connect();
    expect(turn.appendPcm16(new Uint8Array([1, 0]), true)).toBe(true);
    transport.emit('inputTranscriptDelta', { type: 'session.input_transcript.delta', delta: 'hello' });
    transport.emit('outputTranscriptDelta', { type: 'session.output_transcript.delta', delta: '你好' });
    transport.emit('outputAudioDelta', { type: 'session.output_audio.delta', delta: 'AQI=' }, new Uint8Array([1, 2]));

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
});
