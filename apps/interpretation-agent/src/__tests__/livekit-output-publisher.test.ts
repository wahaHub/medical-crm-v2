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
});
