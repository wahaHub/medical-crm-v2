import { createHash } from 'node:crypto';
import { EventEmitter } from 'node:events';
import WebSocket from 'ws';

export type TranslationLanguage = 'zh' | 'en';

export interface TranslationDeltaEvent {
  type:
    | 'session.input_transcript.delta'
    | 'session.output_transcript.delta'
    | 'session.output_audio.delta';
  delta: string;
  event_id?: string;
  item_id?: string;
  response_id?: string;
  segment_id?: string;
  sequence_number?: number;
  [key: string]: unknown;
}

export interface TranslationDoneEvent {
  type: string;
  event_id?: string;
  item_id?: string;
  response_id?: string;
  segment_id?: string;
  transcript?: string;
  [key: string]: unknown;
}

export interface TranslationErrorEvent {
  type: 'error';
  error?: {
    type?: string;
    code?: string;
    message?: string;
  };
}

export type TranslationServerEvent =
  | TranslationDeltaEvent
  | TranslationDoneEvent
  | TranslationErrorEvent;

interface RealtimeTranslationEvents {
  event: [event: TranslationServerEvent];
  inputTranscriptDelta: [event: TranslationDeltaEvent];
  outputTranscriptDelta: [event: TranslationDeltaEvent];
  outputAudioDelta: [event: TranslationDeltaEvent, pcm16: Uint8Array];
  closed: [event: TranslationDoneEvent];
  sessionError: [error: Error];
}

export interface RealtimeTranslationOptions {
  apiKey: string;
  targetLanguage: TranslationLanguage;
  safetyIdentifier: string;
  model?: string;
  endpoint?: string;
  connectTimeoutMs?: number;
  closeTimeoutMs?: number;
  webSocketFactory?: RealtimeWebSocketFactory;
}

export interface RealtimeWebSocket {
  readonly readyState: number;
  send(data: string): void;
  close(code?: number, reason?: string): void;
  terminate(): void;
  on(event: 'open', listener: () => void): this;
  on(event: 'message', listener: (data: { toString(): string }) => void): this;
  on(event: 'close', listener: () => void): this;
  on(event: 'error', listener: (error: Error) => void): this;
}

export type RealtimeWebSocketFactory = (
  address: string,
  options: { headers: Record<string, string>; handshakeTimeout: number },
) => RealtimeWebSocket;

function errorFromProvider(event: TranslationErrorEvent): Error {
  const detail = event.error;
  const suffix = [detail?.type, detail?.code, detail?.message].filter(Boolean).join(':');
  return new Error(suffix ? `openai_realtime_translation_error:${suffix}` : 'openai_realtime_translation_error');
}

function decodeAudioDelta(delta: string): Uint8Array {
  const bytes = Buffer.from(delta, 'base64');
  if (bytes.byteLength === 0 || bytes.byteLength % 2 !== 0) {
    throw new Error('openai_realtime_translation_invalid_pcm16_delta');
  }
  return bytes;
}

function deferred<T>(): {
  promise: Promise<T>;
  resolve: (value: T) => void;
  reject: (reason: unknown) => void;
} {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

export function safetyIdentifierForJob(jobId: string): string {
  return createHash('sha256').update(`medora-video-interpretation:${jobId}`, 'utf8').digest('hex');
}

export class RealtimeTranslationSession extends EventEmitter<RealtimeTranslationEvents> {
  readonly #options: Required<Pick<RealtimeTranslationOptions,
    'model' | 'endpoint' | 'connectTimeoutMs' | 'closeTimeoutMs' | 'webSocketFactory'>>
    & RealtimeTranslationOptions;
  #socket: RealtimeWebSocket | null = null;
  #opened = false;
  #closing = false;
  #closed = false;
  #closeEvent: TranslationDoneEvent | null = null;
  #connectReady: ReturnType<typeof deferred<void>> | null = null;
  #connectSettled = false;
  #connectTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(options: RealtimeTranslationOptions) {
    super();
    if (!options.apiKey) throw new Error('OPENAI_API_KEY is required');
    if (!/^[a-zA-Z0-9._:-]{8,128}$/.test(options.safetyIdentifier)) {
      throw new Error('OpenAI safety identifier must be an opaque stable identifier');
    }
    this.#options = {
      ...options,
      model: options.model ?? 'gpt-realtime-translate',
      endpoint: options.endpoint ?? 'wss://api.openai.com/v1/realtime/translations',
      connectTimeoutMs: options.connectTimeoutMs ?? 10_000,
      closeTimeoutMs: options.closeTimeoutMs ?? 15_000,
      webSocketFactory: options.webSocketFactory
        ?? ((address, socketOptions) => new WebSocket(address, socketOptions)),
    };
  }

  async connect(): Promise<void> {
    if (this.#socket || this.#opened) throw new Error('translation session already used');
    const ready = deferred<void>();
    this.#connectReady = ready;
    const endpoint = new URL(this.#options.endpoint);
    endpoint.searchParams.set('model', this.#options.model);
    const socket = this.#options.webSocketFactory(endpoint.toString(), {
      headers: {
        Authorization: `Bearer ${this.#options.apiKey}`,
        'OpenAI-Safety-Identifier': this.#options.safetyIdentifier,
      },
      handshakeTimeout: this.#options.connectTimeoutMs,
    });
    this.#socket = socket;
    this.#connectTimer = setTimeout(() => {
      this.#fail(new Error('openai_realtime_translation_connect_timeout'));
      socket.terminate();
    }, this.#options.connectTimeoutMs);

    socket.on('open', () => {
      socket.send(JSON.stringify({
        type: 'session.update',
        session: { audio: { output: { language: this.#options.targetLanguage } } },
      }));
    });
    socket.on('message', (data) => {
      let event: TranslationServerEvent;
      try {
        const parsed = JSON.parse(data.toString()) as unknown;
        if (!parsed || typeof parsed !== 'object'
          || typeof (parsed as { type?: unknown }).type !== 'string') throw new Error('invalid event');
        event = parsed as TranslationServerEvent;
      } catch {
        this.#fail(new Error('openai_realtime_translation_invalid_json'));
        return;
      }
      this.emit('event', event);
      if (event.type === 'session.updated') {
        this.#opened = true;
        this.#resolveConnect();
        return;
      }
      if (event.type === 'session.input_transcript.delta') {
        if (typeof (event as { delta?: unknown }).delta !== 'string') {
          this.#fail(new Error('openai_realtime_translation_invalid_input_transcript_delta'));
          return;
        }
        this.emit('inputTranscriptDelta', event as TranslationDeltaEvent);
        return;
      }
      if (event.type === 'session.output_transcript.delta') {
        if (typeof (event as { delta?: unknown }).delta !== 'string') {
          this.#fail(new Error('openai_realtime_translation_invalid_output_transcript_delta'));
          return;
        }
        this.emit('outputTranscriptDelta', event as TranslationDeltaEvent);
        return;
      }
      if (event.type === 'session.output_audio.delta') {
        try {
          const deltaEvent = event as TranslationDeltaEvent;
          if (typeof deltaEvent.delta !== 'string') throw new Error('invalid audio delta');
          this.emit('outputAudioDelta', deltaEvent, decodeAudioDelta(deltaEvent.delta));
        } catch (error) {
          this.#fail(error instanceof Error ? error : new Error('invalid audio delta'));
        }
        return;
      }
      if (event.type === 'error') {
        this.#fail(errorFromProvider(event as TranslationErrorEvent));
        return;
      }
      if (event.type === 'session.closed') {
        this.#closeEvent = event;
        this.#closed = true;
        this.emit('closed', event);
        socket.close();
      }
    });
    socket.on('error', (error) => {
      this.#fail(error);
    });
    socket.on('close', () => {
      if (!this.#closed) this.#fail(new Error('openai_realtime_translation_socket_closed_without_session_closed'));
    });

    await ready.promise;
  }

  appendPcm16(pcm16: Uint8Array): void {
    if (!this.#opened || this.#closing || this.#closed || this.#socket?.readyState !== WebSocket.OPEN) {
      throw new Error('translation session is not accepting audio');
    }
    if (pcm16.byteLength === 0 || pcm16.byteLength % 2 !== 0) {
      throw new Error('translation audio must be non-empty PCM16');
    }
    this.#socket.send(JSON.stringify({
      type: 'session.input_audio_buffer.append',
      audio: Buffer.from(pcm16).toString('base64'),
    }));
  }

  async closeAndDrain(): Promise<TranslationDoneEvent> {
    if (this.#closeEvent) return this.#closeEvent;
    if (!this.#opened || !this.#socket || this.#socket.readyState !== WebSocket.OPEN) {
      throw new Error('translation session is not open');
    }
    return await new Promise<TranslationDoneEvent>((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.#socket?.terminate();
        reject(new Error('openai_realtime_translation_close_timeout'));
      }, this.#options.closeTimeoutMs);
      const onClosed = (event: TranslationDoneEvent) => {
        clearTimeout(timeout);
        this.off('sessionError', onError);
        resolve(event);
      };
      const onError = (error: Error) => {
        clearTimeout(timeout);
        this.off('closed', onClosed);
        reject(error);
      };
      this.once('closed', onClosed);
      this.once('sessionError', onError);
      if (!this.#closing) {
        this.#closing = true;
        this.#socket!.send(JSON.stringify({ type: 'session.close' }));
      }
    });
  }

  abort(): void {
    this.#closing = true;
    this.#fail(new Error('openai_realtime_translation_aborted'));
    this.#socket?.terminate();
  }

  #fail(error: Error): void {
    this.#rejectConnect(error);
    if (this.#closed) return;
    this.#closed = true;
    this.emit('sessionError', error);
  }

  #resolveConnect(): void {
    if (this.#connectSettled) return;
    this.#connectSettled = true;
    if (this.#connectTimer) clearTimeout(this.#connectTimer);
    this.#connectTimer = null;
    this.#connectReady?.resolve();
  }

  #rejectConnect(error: Error): void {
    if (this.#connectSettled) return;
    this.#connectSettled = true;
    if (this.#connectTimer) clearTimeout(this.#connectTimer);
    this.#connectTimer = null;
    this.#connectReady?.reject(error);
  }
}
