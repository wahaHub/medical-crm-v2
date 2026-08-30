import { EventEmitter } from 'node:events';
import { describe, expect, it } from 'vitest';
import {
  RealtimeTranslationSession,
  type RealtimeTranslationOptions,
  type RealtimeWebSocket,
  type RealtimeWebSocketFactory,
} from '../openai-realtime-translation.js';

class FakeSocket extends EventEmitter implements RealtimeWebSocket {
  readyState = 1;
  sent: string[] = [];
  terminated = false;

  send(data: string): void {
    this.sent.push(data);
  }

  close(): void {
    this.readyState = 3;
    this.emit('close');
  }

  terminate(): void {
    this.terminated = true;
    this.readyState = 3;
  }
}

function harness(overrides: Partial<RealtimeTranslationOptions> = {}) {
  const socket = new FakeSocket();
  let address = '';
  let headers: Record<string, string> = {};
  const factory: RealtimeWebSocketFactory = (nextAddress, options) => {
    address = nextAddress;
    headers = options.headers;
    return socket;
  };
  const session = new RealtimeTranslationSession({
    apiKey: 'test-api-key',
    targetLanguage: 'zh',
    safetyIdentifier: 'opaque-test-identifier',
    webSocketFactory: factory,
    ...overrides,
  });
  return { session, socket, getAddress: () => address, getHeaders: () => headers };
}

describe('OpenAI Realtime Translation protocol', () => {
  it('uses the dedicated endpoint, configures language, streams PCM16, and drains with session.close', async () => {
    const { session, socket, getAddress, getHeaders } = harness();
    const connecting = session.connect();
    socket.emit('open');
    expect(JSON.parse(socket.sent[0]!)).toEqual({
      type: 'session.update',
      session: {
        audio: {
          input: {
            transcription: { model: 'gpt-realtime-whisper' },
            noise_reduction: { type: 'near_field' },
          },
          output: { language: 'zh' },
        },
      },
    });
    socket.emit('message', Buffer.from(JSON.stringify({
      type: 'session.updated',
      session: { id: 'translation-session-1' },
    })));
    await connecting;
    expect(getAddress()).toContain('/v1/realtime/translations?model=gpt-realtime-translate');
    expect(getHeaders()).toEqual({
      Authorization: 'Bearer test-api-key',
      'OpenAI-Safety-Identifier': 'opaque-test-identifier',
    });

    session.appendPcm16(new Uint8Array([1, 0, 2, 0]));
    expect(JSON.parse(socket.sent[1]!)).toEqual({
      type: 'session.input_audio_buffer.append',
      audio: 'AQACAA==',
    });
    const closing = session.closeAndDrain();
    expect(JSON.parse(socket.sent[2]!)).toEqual({ type: 'session.close' });
    socket.emit('message', Buffer.from(JSON.stringify({
      type: 'session.closed',
      event_id: 'close-1',
    })));
    await expect(closing).resolves.toMatchObject({ type: 'session.closed' });
  });

  it('decodes audio deltas and fails closed on malformed events', async () => {
    const { session, socket } = harness();
    const audio: Uint8Array[] = [];
    const failures: Error[] = [];
    session.on('outputAudioDelta', (_event, pcm16) => audio.push(pcm16));
    session.on('sessionError', (error) => failures.push(error));
    const connecting = session.connect();
    socket.emit('open');
    socket.emit('message', Buffer.from(JSON.stringify({ type: 'session.updated', session: { id: 's' } })));
    await connecting;
    socket.emit('message', Buffer.from(JSON.stringify({ type: 'session.output_audio.delta', delta: 'AQI=' })));
    expect([...audio[0]!]).toEqual([1, 2]);
    socket.emit('message', Buffer.from(JSON.stringify({ type: 'session.output_audio.delta', delta: 'AQ==' })));
    expect(failures.at(-1)?.message).toContain('invalid_pcm16_delta');
    expect(() => session.appendPcm16(new Uint8Array([1, 0]))).toThrow('not accepting audio');
  });

  it.each([
    ['clean socket close', (socket: FakeSocket) => socket.emit('close')],
    ['provider error', (socket: FakeSocket) => socket.emit('message', Buffer.from(JSON.stringify({
      type: 'error',
      error: { code: 'bad_session', message: 'rejected' },
    })))],
    ['invalid JSON', (socket: FakeSocket) => socket.emit('message', Buffer.from('{'))],
    ['socket error', (socket: FakeSocket) => socket.emit('error', new Error('socket failed'))],
  ])('settles connect when %s occurs before session.updated', async (_name, fail) => {
    const { session, socket } = harness();
    const connecting = session.connect();
    fail(socket);
    await expect(connecting).rejects.toBeInstanceOf(Error);
  });

  it('settles connect on abort and timeout, without changing a prior successful connect', async () => {
    const aborted = harness();
    const aborting = aborted.session.connect();
    aborted.session.abort();
    await expect(aborting).rejects.toThrow('aborted');

    const timed = harness({ connectTimeoutMs: 5 });
    await expect(timed.session.connect()).rejects.toThrow('connect_timeout');
    expect(timed.socket.terminated).toBe(true);

    const opened = harness();
    const connected = opened.session.connect();
    opened.socket.emit('message', Buffer.from(JSON.stringify({
      type: 'session.updated',
      session: { id: 'already-open' },
    })));
    await expect(connected).resolves.toBeUndefined();
    opened.socket.emit('close');
    await expect(connected).resolves.toBeUndefined();
  });
});
