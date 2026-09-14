import { VADEventType } from '@livekit/agents';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import type { AuthorizedTrack, DispatchMetadata } from '../runtime-types.js';
import { SpeakerRuntime } from '../speaker-runtime.js';

// Fake realtime sessions and LiveKit audio streams: the runtime under test
// constructs both directly, so they are module-mocked with registries the
// test can drive.
const state = vi.hoisted(() => ({
  sessions: [] as Array<{
    appended: Uint8Array[];
    aborted: boolean;
    closing: boolean;
    connect(): Promise<void>;
    appendPcm16(pcm: Uint8Array): void;
    closeAndDrain(): Promise<unknown>;
    abort(): void;
    emitLocal(event: string, ...args: unknown[]): void;
  }>,
  audioStreams: [] as Array<{
    push(frame: unknown): void;
  }>,
}));

vi.mock('@livekit/rtc-node', () => ({
  AudioStream: class {
    queue: unknown[] = [];
    waiter: ((result: IteratorResult<unknown>) => void) | null = null;
    done = false;

    constructor() {
      state.audioStreams.push(this as never);
    }

    push(frame: unknown): void {
      if (this.waiter) {
        const waiter = this.waiter;
        this.waiter = null;
        waiter({ value: frame, done: false });
      } else {
        this.queue.push(frame);
      }
    }

    async cancel(): Promise<void> {
      this.done = true;
      if (this.waiter) {
        const waiter = this.waiter;
        this.waiter = null;
        waiter({ value: undefined, done: true });
      }
    }

    [Symbol.asyncIterator]() {
      return {
        next: (): Promise<IteratorResult<unknown>> => {
          if (this.queue.length > 0) return Promise.resolve({ value: this.queue.shift(), done: false });
          if (this.done) return Promise.resolve({ value: undefined, done: true });
          return new Promise((resolve) => {
            this.waiter = resolve;
          });
        },
      };
    }
  },
}));

vi.mock('../openai-realtime-translation.js', () => ({
  safetyIdentifierForJob: () => 'safety-identifier',
  RealtimeTranslationSession: class {
    listeners = new Map<string, Array<(...args: never[]) => void>>();
    appended: Uint8Array[] = [];
    aborted = false;
    closing = false;

    constructor() {
      state.sessions.push(this as never);
    }

    on(event: string, fn: (...args: never[]) => void): this {
      const listeners = this.listeners.get(event) ?? [];
      listeners.push(fn);
      this.listeners.set(event, listeners);
      return this;
    }

    emitLocal(event: string, ...args: unknown[]): void {
      for (const fn of this.listeners.get(event) ?? []) {
        (fn as (...args: unknown[]) => void)(...args);
      }
    }

    async connect(): Promise<void> {
      this.emitLocal('event', { type: 'session.updated', session: { id: `provider-${state.sessions.length}` } });
    }

    appendPcm16(pcm: Uint8Array): void {
      this.appended.push(pcm);
    }

    async closeAndDrain(): Promise<unknown> {
      this.closing = true;
      this.emitLocal('outputTranscriptDelta', { type: 'session.output_transcript.delta', delta: '译文' });
      this.emitLocal('outputAudioDelta', { type: 'session.output_audio.delta', delta: '' }, new Uint8Array(960));
      const closed = { type: 'session.closed', event_id: `close-${state.sessions.length}` };
      this.emitLocal('closed', closed);
      return closed;
    }

    abort(): void {
      this.aborted = true;
    }
  },
}));

class FakeVadStream {
  queue: unknown[] = [];
  waiter: ((result: IteratorResult<unknown>) => void) | null = null;
  closed = false;

  pushFrame(): void {}

  emit(event: unknown): void {
    if (this.waiter) {
      const waiter = this.waiter;
      this.waiter = null;
      waiter({ value: event, done: false });
    } else {
      this.queue.push(event);
    }
  }

  endInput(): void {}

  close(): void {
    this.closed = true;
    if (this.waiter) {
      const waiter = this.waiter;
      this.waiter = null;
      waiter({ value: undefined, done: true });
    }
  }

  [Symbol.asyncIterator]() {
    return {
      next: (): Promise<IteratorResult<unknown>> => {
        if (this.queue.length > 0) return Promise.resolve({ value: this.queue.shift(), done: false });
        if (this.closed) return Promise.resolve({ value: undefined, done: true });
        return new Promise((resolve) => {
          this.waiter = resolve;
        });
      },
    };
  }
}

const execution: DispatchMetadata = {
  schema: 'medora.interpretation.dispatch.v1',
  jobId: '00000000-0000-4000-8000-000000000009',
  roomName: 'deidentified-room',
  roomGeneration: 1,
  interpretationGeneration: 1,
  executionVersion: 1,
  agentIdentity: 'agent-1',
};

const authorization: AuthorizedTrack = {
  id: 'track-1',
  participantIdentity: 'operator-1',
  trackSid: 'TR_test',
  sourceLanguage: 'en',
  targetLanguage: 'zh',
  languageVersion: 1,
  consentVersion: 1,
  authorizationRevision: 1,
  authorized: true,
};

function frame(): { data: Int16Array } {
  return { data: new Int16Array(480) };
}

describe('SpeakerRuntime overlapping speech', () => {
  beforeAll(() => {
    process.env.OPENAI_API_KEY = 'test-key';
  });

  it('queues speech that overlaps the finishing turn and starts it as the next turn instead of dropping it', async () => {
    state.sessions.length = 0;
    state.audioStreams.length = 0;
    const vadStream = new FakeVadStream();
    const turnDetectorStream = {
      pushAudio(): void {},
      endInput(): void {},
      async aclose(): Promise<void> {},
      async unlikelyThreshold(): Promise<number> {
        return 0.5;
      },
      predict(): { await: Promise<{ endOfTurnProbability: number }> } {
        return { await: Promise.resolve({ endOfTurnProbability: 0.99 }) };
      },
    };
    const client = {
      openProviderSession: vi.fn(async () => ({ id: `control-${state.sessions.length + 1}` })),
      activateProviderSession: vi.fn(async () => ({})),
      closeProviderSession: vi.fn(async () => ({})),
    };
    const playouts: Array<{ chunks: Uint8Array[]; finished: boolean; aborted: boolean }> = [];
    const output = {
      publishCaption: vi.fn(async () => undefined),
      invalidateAuthorization: vi.fn(),
      play: vi.fn(async (_language: string, chunks: Uint8Array[]) => {
        const handle = { chunks: [] as Uint8Array[], finished: false, aborted: false };
        playouts.push(handle);
        handle.chunks.push(...chunks);
        handle.finished = true;
      }),
    };
    const acquireProviderSlot = vi.fn(() => true);
    const releaseProviderSlot = vi.fn();
    const runtime = new SpeakerRuntime({
      execution,
      authorization,
      remoteTrack: {} as never,
      vad: { stream: () => vadStream } as never,
      turnDetector: { stream: () => turnDetectorStream } as never,
      watchdog: { canForward: () => true } as never,
      client: client as never,
      output: output as never,
      applicationDeadlineAt: new Date(Date.now() + 60_000).toISOString(),
      providerModel: 'gpt-realtime-translate',
      providerEndpoint: 'wss://api.openai.com/v1/realtime/translations',
      acquireProviderSlot,
      releaseProviderSlot,
    });
    runtime.run();
    const audio = state.audioStreams[0]!;

    // First utterance: starts a provider turn and accepts appended audio.
    vadStream.emit({ type: VADEventType.START_OF_SPEECH });
    await vi.waitFor(() => expect(state.sessions).toHaveLength(1));
    const first = state.sessions[0]!;
    await vi.waitFor(() => expect(client.activateProviderSession).toHaveBeenCalledTimes(1));
    audio.push(frame());
    audio.push(frame());
    await vi.waitFor(() => expect(first.appended.length).toBeGreaterThanOrEqual(2));
    vadStream.emit({ type: VADEventType.END_OF_SPEECH });

    // Wait until provider generation is closing, so the overlap lands inside
    // the finishing window instead of the end-of-turn decision window.
    await vi.waitFor(() => expect(first.closing).toBe(true));

    // Overlapping utterance while the first turn is still finishing.
    vadStream.emit({ type: VADEventType.START_OF_SPEECH });
    audio.push(frame());
    audio.push(frame());
    audio.push(frame());
    vadStream.emit({ type: VADEventType.END_OF_SPEECH });

    // The first turn completes without being discarded, then its full audio is queued.
    await vi.waitFor(() => expect(playouts[0]?.finished).toBe(true), { timeout: 8_000 });
    expect(first.aborted).toBe(false);
    expect(playouts[0]?.chunks.length).toBeGreaterThan(0);

    // The overlapping utterance is kicked off as the next turn with its
    // buffered audio, and finishes as a normal completed turn.
    await vi.waitFor(() => expect(state.sessions).toHaveLength(2), { timeout: 8_000 });
    const second = state.sessions[1]!;
    await vi.waitFor(() => expect(second.appended.length).toBeGreaterThanOrEqual(3), { timeout: 8_000 });
    await vi.waitFor(() => expect(playouts[1]?.finished).toBe(true), { timeout: 8_000 });
    expect(second.aborted).toBe(false);
    expect(client.closeProviderSession).toHaveBeenCalledTimes(2);
    expect(acquireProviderSlot).toHaveBeenCalledTimes(2);
    expect(releaseProviderSlot).toHaveBeenCalledTimes(2);

    await runtime.close();
  }, 20_000);

  it('keeps fully generated playout when provider closure reporting fails', async () => {
    state.sessions.length = 0;
    state.audioStreams.length = 0;
    const vadStream = new FakeVadStream();
    const turnDetectorStream = {
      pushAudio(): void {},
      endInput(): void {},
      async aclose(): Promise<void> {},
      async unlikelyThreshold(): Promise<number> { return 0.5; },
      predict(): { await: Promise<{ endOfTurnProbability: number }> } {
        return { await: Promise.resolve({ endOfTurnProbability: 0.99 }) };
      },
    };
    const client = {
      openProviderSession: vi.fn(async () => ({ id: 'control-1' })),
      activateProviderSession: vi.fn(async () => ({})),
      closeProviderSession: vi.fn(async () => { throw new Error('control_plane_unavailable'); }),
    };
    const output = {
      publishCaption: vi.fn(async () => undefined),
      invalidateAuthorization: vi.fn(),
      play: vi.fn(async () => undefined),
    };
    const releaseProviderSlot = vi.fn();
    const runtime = new SpeakerRuntime({
      execution,
      authorization,
      remoteTrack: {} as never,
      vad: { stream: () => vadStream } as never,
      turnDetector: { stream: () => turnDetectorStream } as never,
      watchdog: { canForward: () => true } as never,
      client: client as never,
      output: output as never,
      applicationDeadlineAt: new Date(Date.now() + 60_000).toISOString(),
      providerModel: 'gpt-realtime-translate',
      providerEndpoint: 'wss://api.openai.com/v1/realtime/translations',
      acquireProviderSlot: () => true,
      releaseProviderSlot,
    });
    runtime.run();
    const audio = state.audioStreams[0]!;

    vadStream.emit({ type: VADEventType.START_OF_SPEECH });
    await vi.waitFor(() => expect(client.activateProviderSession).toHaveBeenCalledTimes(1));
    audio.push(frame());
    vadStream.emit({ type: VADEventType.END_OF_SPEECH });

    await vi.waitFor(() => expect(output.play).toHaveBeenCalledTimes(1), { timeout: 8_000 });
    expect(releaseProviderSlot).toHaveBeenCalledTimes(1);
    await runtime.close();
  }, 20_000);

  it('starts streaming translated audio after the bounded lookahead, before speech ends', async () => {
    state.sessions.length = 0;
    state.audioStreams.length = 0;
    const vadStream = new FakeVadStream();
    const turnDetectorStream = {
      pushAudio(): void {},
      endInput(): void {},
      async aclose(): Promise<void> {},
      async unlikelyThreshold(): Promise<number> { return 0.5; },
      predict(): { await: Promise<{ endOfTurnProbability: number }> } {
        return { await: Promise.resolve({ endOfTurnProbability: 0.99 }) };
      },
    };
    const client = {
      openProviderSession: vi.fn(async () => ({ id: 'control-streaming' })),
      activateProviderSession: vi.fn(async () => ({})),
      closeProviderSession: vi.fn(async () => ({})),
    };
    const handle = {
      push: vi.fn(),
      finish: vi.fn(),
      abort: vi.fn(),
      done: Promise.resolve(),
    };
    const output = {
      publishCaption: vi.fn(async () => undefined),
      invalidateAuthorization: vi.fn(),
      beginPlayout: vi.fn(() => handle),
      play: vi.fn(async () => undefined),
    };
    const runtime = new SpeakerRuntime({
      execution,
      authorization,
      remoteTrack: {} as never,
      vad: { stream: () => vadStream } as never,
      turnDetector: { stream: () => turnDetectorStream } as never,
      watchdog: { canForward: () => true } as never,
      client: client as never,
      output: output as never,
      applicationDeadlineAt: new Date(Date.now() + 60_000).toISOString(),
      providerModel: 'gpt-realtime-translate',
      providerEndpoint: 'wss://api.openai.com/v1/realtime/translations',
      acquireProviderSlot: () => true,
      releaseProviderSlot: vi.fn(),
    });
    runtime.run();

    vadStream.emit({ type: VADEventType.START_OF_SPEECH });
    await vi.waitFor(() => expect(client.activateProviderSession).toHaveBeenCalledTimes(1));
    const session = state.sessions[0]!;
    for (let i = 0; i < 75; i += 1) {
      session.emitLocal(
        'outputAudioDelta',
        { type: 'session.output_audio.delta', delta: '' },
        new Uint8Array(960),
      );
    }

    expect(output.beginPlayout).toHaveBeenCalledTimes(1);
    expect(handle.push).toHaveBeenCalledTimes(75);
    expect(handle.finish).not.toHaveBeenCalled();

    vadStream.emit({ type: VADEventType.END_OF_SPEECH });
    await vi.waitFor(() => expect(handle.finish).toHaveBeenCalledTimes(1), { timeout: 8_000 });
    expect(output.play).not.toHaveBeenCalled();
    expect(handle.abort).not.toHaveBeenCalled();
    await runtime.close();
  }, 20_000);
});
