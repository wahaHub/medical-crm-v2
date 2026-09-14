import type { AudioFrame, Room } from '@livekit/rtc-node';
import { describe, expect, it, vi } from 'vitest';
import {
  LiveKitOutputPublisher,
  type PublishedAudioOutput,
} from '../livekit-output-publisher.js';

const execution = {
  jobId: '00000000-0000-4000-8000-000000000001',
  roomName: 'deidentified-room',
  roomGeneration: 1,
  interpretationGeneration: 1,
  executionVersion: 1,
};

function deferred(): { promise: Promise<void>; resolve: () => void } {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => { resolve = done; });
  return { promise, resolve };
}

function fakeRoom(): Room {
  return { localParticipant: null } as unknown as Room;
}

function fakeOutput(overrides: Partial<PublishedAudioOutput['source']> = {}) {
  const source = {
    captureFrame: vi.fn(async (_frame: AudioFrame) => undefined),
    waitForPlayout: vi.fn(async () => undefined),
    clearQueue: vi.fn(),
    close: vi.fn(async () => undefined),
    ...overrides,
  };
  const output: PublishedAudioOutput = {
    source,
    track: { close: vi.fn(async () => undefined) },
    publication: { sid: '' },
  };
  return { output, source };
}

describe('LiveKitOutputPublisher authorization invalidation', () => {
  it('publishes a content-free capacity event for an immediately dropped turn', async () => {
    const publishData = vi.fn(async () => undefined);
    const room = { localParticipant: { publishData } } as unknown as Room;
    const publisher = new LiveKitOutputPublisher(room, execution);

    await publisher.publishCapacityUnavailable('source-track-3');

    expect(publishData).toHaveBeenCalledTimes(1);
    const [encoded, options] = publishData.mock.calls[0]!;
    expect(JSON.parse(new TextDecoder().decode(encoded))).toEqual({
      schema: 'medora.interpretation.status.v1',
      jobId: execution.jobId,
      roomGeneration: execution.roomGeneration,
      interpretationGeneration: execution.interpretationGeneration,
      executionVersion: execution.executionVersion,
      sourceTrackId: 'source-track-3',
      code: 'AI_CAPACITY_UNAVAILABLE_FOR_SPEAKER',
    });
    expect(options).toEqual({ reliable: true, topic: 'interpretation-status' });
  });

  it('publishes captions reliably so late/large payloads are not dropped', async () => {
    const publishData = vi.fn(async () => undefined);
    const room = { localParticipant: { publishData } } as unknown as Room;
    const publisher = new LiveKitOutputPublisher(room, execution);
    const track = {
      id: 'track-1',
      participantIdentity: 'patient-1',
      trackSid: 'TR_1',
      sourceLanguage: 'en',
      targetLanguage: 'zh',
      languageVersion: 1,
      consentVersion: 1,
      authorizationRevision: 2,
      authorized: true,
    } as const;

    await publisher.publishCaption(track, {
      sourceText: 'hello',
      translatedText: '你好',
      sourceLanguage: 'en',
      targetLanguage: 'zh',
      isFinal: true,
    });

    expect(publishData).toHaveBeenCalledTimes(1);
    const [encoded, options] = publishData.mock.calls[0]!;
    expect(JSON.parse(new TextDecoder().decode(encoded))).toMatchObject({
      schema: 'medora.subtitle.v1',
      sourceText: 'hello',
      translatedText: '你好',
      isFinal: true,
    });
    expect(options).toEqual({ reliable: true, topic: 'subtitle' });
  });

  it('drops an item waiting behind current playout when authority is revoked', async () => {
    const playout = deferred();
    const { output, source } = fakeOutput({ waitForPlayout: vi.fn(() => playout.promise) });
    const publisher = new LiveKitOutputPublisher(fakeRoom(), execution, async () => output);
    const first = publisher.play('zh', [new Uint8Array(480)], performance.now());
    await vi.waitFor(() => expect(source.captureFrame).toHaveBeenCalledTimes(1));
    const queued = publisher.play('zh', [new Uint8Array(480)], performance.now());

    publisher.invalidateAuthorization();
    playout.resolve();
    await Promise.all([first, queued]);

    expect(source.captureFrame).toHaveBeenCalledTimes(1);
    expect(source.clearQueue).toHaveBeenCalled();
  });

  it('clears a playing source and never captures later chunks after revocation', async () => {
    const capture = deferred();
    const captureFrame = vi.fn((_frame: AudioFrame) => capture.promise);
    const { output, source } = fakeOutput({ captureFrame });
    const publisher = new LiveKitOutputPublisher(fakeRoom(), execution, async () => output);
    const playing = publisher.play(
      'en',
      [new Uint8Array(480), new Uint8Array(480)],
      performance.now(),
    );
    await vi.waitFor(() => expect(captureFrame).toHaveBeenCalledTimes(1));

    publisher.invalidateAuthorization();
    capture.resolve();
    await playing;

    expect(captureFrame).toHaveBeenCalledTimes(1);
    // One clear happens at invalidation and another closes the enqueue race.
    expect(source.clearQueue).toHaveBeenCalledTimes(2);
  });

  it('publishes reliable content-free playout boundaries for client ducking', async () => {
    const publishData = vi.fn(async () => undefined);
    const room = { localParticipant: { publishData } } as unknown as Room;
    const { output } = fakeOutput();
    const publisher = new LiveKitOutputPublisher(room, execution, async () => output);

    await publisher.play('zh', [new Uint8Array(480)], performance.now());

    const statuses = publishData.mock.calls.map(([encoded, options]) => ({
      payload: JSON.parse(new TextDecoder().decode(encoded)),
      options,
    }));
    expect(statuses.map(({ payload }) => payload.code)).toEqual([
      'TRANSLATED_PLAYOUT_STARTED',
      'TRANSLATED_PLAYOUT_ENDED',
    ]);
    expect(statuses.every(({ options }) => options.reliable === true
      && options.topic === 'interpretation-status')).toBe(true);
    expect(JSON.stringify(statuses)).not.toContain('transcript');
  });

  it('logs one content-free latency record when the first audio frame is captured', async () => {
    const { output } = fakeOutput();
    const publisher = new LiveKitOutputPublisher(fakeRoom(), execution, async () => output);
    const now = performance.now();
    const log = vi.spyOn(console, 'error').mockImplementation(() => undefined);

    await publisher.play('zh', [new Uint8Array(480), new Uint8Array(480)], now, {
      turnId: 'TR_1:4',
      speechStartedAtMonotonicMs: now - 3_000,
      vadSpeechEndedAtMonotonicMs: now - 1_500,
      firstTranslatedCaptionAtMonotonicMs: now - 1_200,
      firstProviderAudioAtMonotonicMs: now - 1_000,
      providerCompletedAtMonotonicMs: now,
    });

    const latencyLogs = log.mock.calls
      .map(([message]) => String(message))
      .filter((message) => message.startsWith('[latency] '));
    expect(latencyLogs).toHaveLength(1);
    const payload = JSON.parse(latencyLogs[0]!.slice('[latency] '.length));
    expect(payload).toMatchObject({
      event: 'translated_audio_first_frame_captured',
      turnId: 'TR_1:4',
      targetLanguage: 'zh',
    });
    expect(payload.firstCaptionToFirstFrameMs).toBeGreaterThanOrEqual(1_200);
    expect(JSON.stringify(payload)).not.toContain('transcript');
    log.mockRestore();
  });

  it('captures streamed chunks as they are pushed, before finish', async () => {
    const { output, source } = fakeOutput();
    const publisher = new LiveKitOutputPublisher(fakeRoom(), execution, async () => output);
    const handle = publisher.beginPlayout('zh');

    handle.push(new Uint8Array(480));
    await vi.waitFor(() => expect(source.captureFrame).toHaveBeenCalledTimes(1));
    handle.push(new Uint8Array(480));
    await vi.waitFor(() => expect(source.captureFrame).toHaveBeenCalledTimes(2));

    handle.finish();
    await handle.done;
    expect(source.waitForPlayout).toHaveBeenCalledTimes(1);
  });

  it('serializes a streamed session behind the previous playout', async () => {
    const playout = deferred();
    const { output, source } = fakeOutput({ waitForPlayout: vi.fn(() => playout.promise) });
    const publisher = new LiveKitOutputPublisher(fakeRoom(), execution, async () => output);

    const first = publisher.play('zh', [new Uint8Array(480)], performance.now());
    await vi.waitFor(() => expect(source.captureFrame).toHaveBeenCalledTimes(1));

    const handle = publisher.beginPlayout('zh');
    handle.push(new Uint8Array(480));
    handle.push(new Uint8Array(480));
    handle.finish();
    // Still queued behind the first playout; nothing new captured yet.
    await Promise.resolve();
    expect(source.captureFrame).toHaveBeenCalledTimes(1);

    playout.resolve();
    await Promise.all([first, handle.done]);
    expect(source.captureFrame).toHaveBeenCalledTimes(3);
  });

  it('drops a streamed session that has waited beyond the conversational deadline', async () => {
    const { output, source } = fakeOutput();
    const publisher = new LiveKitOutputPublisher(fakeRoom(), execution, async () => output);
    const handle = publisher.beginPlayout('zh', performance.now() - 5_001);

    handle.push(new Uint8Array(480));
    handle.finish();
    await handle.done;

    expect(source.captureFrame).not.toHaveBeenCalled();
    expect(source.waitForPlayout).not.toHaveBeenCalled();
  });

  it('stops a stream mid-play when authority is invalidated and rejects late chunks', async () => {
    const capture = deferred();
    const captureFrame = vi.fn((_frame: AudioFrame) => capture.promise);
    const { output, source } = fakeOutput({ captureFrame });
    const publisher = new LiveKitOutputPublisher(fakeRoom(), execution, async () => output);
    const handle = publisher.beginPlayout('zh');
    handle.push(new Uint8Array(480));
    await vi.waitFor(() => expect(captureFrame).toHaveBeenCalledTimes(1));

    publisher.invalidateAuthorization();
    capture.resolve();
    handle.push(new Uint8Array(480)); // pushed after revocation: dropped
    handle.finish();
    await handle.done;

    expect(captureFrame).toHaveBeenCalledTimes(1);
    expect(source.clearQueue).toHaveBeenCalled();
  });

  it('aborts a stream that never received audio without publishing boundaries', async () => {
    const publishData = vi.fn(async () => undefined);
    const room = { localParticipant: { publishData } } as unknown as Room;
    const { output, source } = fakeOutput();
    const publisher = new LiveKitOutputPublisher(room, execution, async () => output);
    const handle = publisher.beginPlayout('zh');

    handle.abort();
    await handle.done;

    expect(source.captureFrame).not.toHaveBeenCalled();
    expect(publishData).not.toHaveBeenCalled();
  });
});
