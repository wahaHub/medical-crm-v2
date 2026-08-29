'use client';

import { useEffect, useRef, useState } from 'react';
import {
  Room,
  RoomEvent,
  Track,
  VideoPresets,
  type LocalVideoTrack,
  type RemoteAudioTrack,
  type RemoteParticipant,
  type RemoteVideoTrack,
} from 'livekit-client';
import { Button, LoadingSpinner } from '@medical-crm/ui';
import { Mic, MicOff, Video as VideoIcon, VideoOff, PhoneOff } from 'lucide-react';

// Mirrors the API's non-overridable scaffold gate. This may only become true in
// the same reviewed change that implements the production media/provider path.
const AI_INTERPRETATION_MEDIA_ADAPTER_IMPLEMENTED = false;

interface Props {
  token: string;
  livekitUrl: string;
  identity: string;
  roomName: string;
  consultationId: string;
  patientLanguage: string;
  displayName?: string;
  onClose: () => void;
}

export function VideoConsultationRoom({
  token,
  livekitUrl,
  identity,
  roomName,
  consultationId,
  patientLanguage,
  displayName,
  onClose,
}: Props) {
  const [room, setRoom] = useState<Room | null>(null);
  const [connecting, setConnecting] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState('Joining…');
  const [localVideoEnabled, setLocalVideoEnabled] = useState(true);
  const [localAudioEnabled, setLocalAudioEnabled] = useState(true);
  const [localVideoTrack, setLocalVideoTrack] = useState<LocalVideoTrack | null>(null);
  const [remoteVideoTracks, setRemoteVideoTracks] = useState<RemoteVideoTrack[]>([]);
  const [remoteAudioTracks, setRemoteAudioTracks] = useState<RemoteAudioTrack[]>([]);
  const [remoteParticipants, setRemoteParticipants] = useState<RemoteParticipant[]>([]);
  const interpretationFence = useRef<{
    jobId: string;
    agentIdentity: string;
    executionVersion: number;
    interpretationGeneration: number;
  } | null>(null);

  const [interpretationStarted, setInterpretationStarted] = useState(false);
  const [interpretationLoading, setInterpretationLoading] = useState(false);
  const [interpretationError, setInterpretationError] = useState<string | null>(null);
  const [endingMeeting, setEndingMeeting] = useState(false);
  const [meetingError, setMeetingError] = useState<string | null>(null);
  const [subtitles, setSubtitles] = useState<
    Array<{
      from: string;
      fromLanguage: string;
      toLanguage: string;
      sourceText: string;
      translatedText: string;
      isFinal: boolean;
    }>
  >([]);

  useEffect(() => {
    let disposed = false;

    const lkRoom = new Room({
      adaptiveStream: true,
      dynacast: true,
      publishDefaults: { simulcast: true },
      videoCaptureDefaults: {
        resolution: VideoPresets.h720.resolution,
      },
    });

    function syncLocalVideo() {
      const cameraPub = lkRoom.localParticipant.getTrackPublication(Track.Source.Camera);
      setLocalVideoTrack((cameraPub?.track as LocalVideoTrack | undefined) ?? null);
    }

    function syncRemoteParticipants() {
      setRemoteParticipants(Array.from(lkRoom.remoteParticipants.values()));
    }

    lkRoom
      .on(RoomEvent.LocalTrackPublished, () => syncLocalVideo())
      .on(RoomEvent.LocalTrackUnpublished, () => syncLocalVideo())
      .on(RoomEvent.TrackSubscribed, (track, _publication, participant) => {
        if (track.kind === Track.Kind.Video) {
          setRemoteVideoTracks((prev) => {
            if (prev.some((t) => t.sid === track.sid)) return prev;
            return [...prev, track as RemoteVideoTrack];
          });
        } else if (track.kind === Track.Kind.Audio) {
          setRemoteAudioTracks((prev) => {
            if (prev.some((t) => t.sid === track.sid)) return prev;
            return [...prev, track as RemoteAudioTrack];
          });
        }
        setRemoteParticipants((prev) => {
          if (prev.some((p) => p.identity === participant.identity)) return prev;
          return [...prev, participant];
        });
      })
      .on(RoomEvent.TrackUnsubscribed, (track) => {
        if (track.kind === Track.Kind.Video) {
          setRemoteVideoTracks((prev) => prev.filter((t) => t.sid !== track.sid));
        } else if (track.kind === Track.Kind.Audio) {
          setRemoteAudioTracks((prev) => prev.filter((t) => t.sid !== track.sid));
        }
      })
      .on(RoomEvent.ParticipantConnected, (participant) => {
        setStatus(`Remote joined: ${participant.identity}`);
        setRemoteParticipants((prev) => {
          if (prev.some((p) => p.identity === participant.identity)) return prev;
          return [...prev, participant];
        });
      })
      .on(RoomEvent.ParticipantDisconnected, (participant) => {
        setStatus(`Remote left: ${participant.identity}`);
        setRemoteParticipants((prev) => prev.filter((p) => p.identity !== participant.identity));
        setRemoteVideoTracks((prev) => prev.filter((t) => t.mediaStream?.id !== participant.sid));
        setRemoteAudioTracks((prev) => prev.filter((t) => t.mediaStream?.id !== participant.sid));
      })
      .on(RoomEvent.DataReceived, (payload, participant, _kind, topic) => {
        const fence = interpretationFence.current;
        if (topic !== 'subtitle' || payload.byteLength > 64 * 1024
          || !fence || participant?.identity !== fence.agentIdentity) return;
        try {
          const msg = JSON.parse(new TextDecoder().decode(payload)) as Record<string, unknown>;
          if (msg.schema !== 'medora.subtitle.v1'
            || msg.jobId !== fence.jobId
            || msg.executionVersion !== fence.executionVersion
            || msg.interpretationGeneration !== fence.interpretationGeneration
            || typeof msg.from !== 'string'
            || !['zh', 'en'].includes(String(msg.fromLanguage))
            || !['zh', 'en'].includes(String(msg.toLanguage))
            || typeof msg.sourceText !== 'string'
            || typeof msg.translatedText !== 'string'
            || msg.sourceText.length > 4_000
            || msg.translatedText.length > 4_000
            || typeof msg.isFinal !== 'boolean') return;
          setSubtitles((prev) => [...prev.slice(-50), msg as unknown as (typeof prev)[number]]);
        } catch {
          // Ignore malformed subtitle messages.
        }
      })
      .on(RoomEvent.Disconnected, () => onClose());

    async function connect() {
      setStatus('Connecting…');
      await lkRoom.connect(livekitUrl, token);
      if (disposed) return;

      await lkRoom.localParticipant.setCameraEnabled(true);
      await lkRoom.localParticipant.setMicrophoneEnabled(true);
      setLocalVideoEnabled(true);
      setLocalAudioEnabled(true);
      syncLocalVideo();
      syncRemoteParticipants();
      setRoom(lkRoom);
      setStatus(`Joined: ${roomName}`);
      setConnecting(false);

    }

    connect().catch((err) => {
      if (disposed) return;
      setError(err instanceof Error ? err.message : String(err));
      setConnecting(false);
    });

    return () => {
      disposed = true;
      lkRoom.disconnect().catch(() => {});
    };
  }, [livekitUrl, token, roomName, onClose]);

  async function toggleCam() {
    if (!room) return;
    const nextEnabled = !localVideoEnabled;
    await room.localParticipant.setCameraEnabled(nextEnabled);
    setLocalVideoEnabled(nextEnabled);
    if (!nextEnabled) {
      setLocalVideoTrack(null);
    } else {
      const cameraPub = room.localParticipant.getTrackPublication(Track.Source.Camera);
      setLocalVideoTrack((cameraPub?.track as LocalVideoTrack | undefined) ?? null);
    }
  }

  async function toggleMic() {
    if (!room) return;
    const nextEnabled = !localAudioEnabled;
    await room.localParticipant.setMicrophoneEnabled(nextEnabled);
    setLocalAudioEnabled(nextEnabled);
  }

  function hangUp() {
    room?.disconnect();
    onClose();
  }

  async function startInterpretation(remoteParticipant?: RemoteParticipant) {
    if (!room) return;
    const targetParticipant = remoteParticipant ?? remoteParticipants[0];
    if (!targetParticipant) return;
    if (!window.confirm(
      'Confirm that every listed participant has explicitly consented to AI captions and translated speech. AI output is assistive; keep original audio available.',
    )) return;
    setInterpretationLoading(true);
    setInterpretationError(null);

    try {
      const normalizedPatientLanguage = patientLanguage.trim().toLowerCase();
      const sourceLanguage = normalizedPatientLanguage === 'zh' || normalizedPatientLanguage.startsWith('zh-')
        ? 'zh'
        : normalizedPatientLanguage === 'en' || normalizedPatientLanguage.startsWith('en-')
          ? 'en'
          : null;
      if (!sourceLanguage) throw new Error('Confirm either Chinese or English before starting AI translation');
      const res = await fetch('/api/video-consultations/interpretation/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          consultationId,
          participantIdentities: [identity, ...remoteParticipants.map((participant) => participant.identity)],
          sourceLanguage,
          consentWitnessConfirmed: true,
        }),
      });

      const data = (await res.json().catch(() => ({ error: 'invalid_response' }))) as {
        success?: boolean;
        error?: string;
        job?: {
          id: string;
          agentIdentity: string;
          executionVersion: number;
          interpretationGeneration: number;
        };
      };

      if (!res.ok || !data.success || !data.job) {
        throw new Error(data.error || 'Failed to start interpretation');
      }

      interpretationFence.current = { ...data.job, jobId: data.job.id };
      setInterpretationStarted(true);
    } catch (err) {
      setInterpretationError(err instanceof Error ? err.message : String(err));
    } finally {
      setInterpretationLoading(false);
    }
  }

  async function stopInterpretation(): Promise<boolean> {
    if (!interpretationStarted) return true;
    setInterpretationLoading(true);
    setInterpretationError(null);
    try {
      const res = await fetch('/api/video-consultations/interpretation/stop', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ consultationId }),
      });
      const data = (await res.json().catch(() => ({ error: 'invalid_response' }))) as {
        success?: boolean;
        error?: string;
      };
      if (!res.ok || !data.success) {
        throw new Error(data.error || 'AI stop was not confirmed by the server');
      }
      interpretationFence.current = null;
      setInterpretationStarted(false);
      setSubtitles([]);
      return true;
    } catch (err) {
      setInterpretationError(
        `AI stop not confirmed; retry before ending the meeting. ${err instanceof Error ? err.message : String(err)}`,
      );
      return false;
    } finally {
      setInterpretationLoading(false);
    }
  }

  async function endMeeting() {
    if (!window.confirm('结束会议？该操作会标记面诊为已完成并释放医生的时间安排。')) {
      return;
    }
    setEndingMeeting(true);
    setMeetingError(null);
    try {
      const stopConfirmed = await stopInterpretation();
      if (!stopConfirmed) {
        throw new Error('Meeting was not ended because AI stop could not be confirmed');
      }
      const res = await fetch(`/api/video-consultations/${consultationId}/complete`, {
        method: 'POST',
      });
      const data = (await res.json().catch(() => ({ error: 'invalid response' }))) as {
        success?: boolean;
        error?: string;
      };
      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Failed to end meeting');
      }
      hangUp();
    } catch (err) {
      setMeetingError(err instanceof Error ? err.message : String(err));
    } finally {
      setEndingMeeting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-slate-950">
      <header className="flex items-center justify-between border-b border-slate-800 bg-slate-900 px-6 py-4">
        <div>
          <h2 className="text-lg font-semibold text-white">{roomName}</h2>
          <p className="text-xs text-slate-400">
            {status} · Remote audio tracks: {remoteAudioTracks.length}
          </p>
        </div>
        <button onClick={hangUp} className="text-slate-400 hover:text-white">
          <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </header>

      <main className="relative flex flex-1 overflow-hidden p-4">
        <div className="grid h-full w-full grid-cols-1 gap-4 lg:grid-cols-2">
          {/* Local (self) video */}
          <div className="relative flex min-h-[240px] flex-col overflow-hidden rounded-2xl border border-slate-800 bg-slate-900">
            <div className="absolute left-0 top-0 z-10 rounded-br-lg bg-slate-800/80 px-3 py-1 text-xs text-white">
              You: {displayName || identity}
            </div>
            <div className="relative flex-1 bg-slate-950">
              {localVideoTrack ? (
                <VideoRenderer track={localVideoTrack} muted className="absolute inset-0 h-full w-full" />
              ) : (
                <div className="flex h-full items-center justify-center text-sm text-slate-500">
                  Camera is off
                </div>
              )}
            </div>
          </div>

          {/* Remote video */}
          <div className="relative flex min-h-[240px] flex-col overflow-hidden rounded-2xl border border-slate-800 bg-slate-900">
            <div className="absolute left-0 top-0 z-10 rounded-br-lg bg-slate-800/80 px-3 py-1 text-xs text-white">
              Remote ({remoteParticipants.length})
            </div>
            <div className="relative flex-1 bg-slate-950">
              {remoteVideoTracks.length === 0 ? (
                <div className="flex h-full items-center justify-center text-sm text-slate-500">
                  Waiting for others to join…
                </div>
              ) : (
                <div className="absolute inset-0 grid grid-cols-1">
                  {remoteVideoTracks.map((track) => (
                    <VideoRenderer
                      key={track.sid}
                      track={track}
                      className="h-full w-full"
                    />
                  ))}
                </div>
              )}
              {remoteAudioTracks.map((track) => (
                  <AudioRenderer key={track.sid} track={track} />
                ))}
            </div>
          </div>
        </div>

        {connecting && (
          <div className="absolute inset-0 z-20 flex flex-col items-center justify-center gap-3 bg-slate-950/80 text-white">
            <LoadingSpinner size="lg" />
            <span className="text-sm">Joining room…</span>
          </div>
        )}

        {error && (
          <div className="absolute inset-0 z-20 flex items-center justify-center bg-slate-950/80">
            <div className="max-w-md rounded-xl bg-rose-500/10 p-6 text-center text-rose-200">
              <p className="font-medium">Could not join room</p>
              <p className="mt-2 text-sm">{error}</p>
              <Button variant="outline" className="mt-4" onClick={onClose}>
                Close
              </Button>
            </div>
          </div>
        )}
      </main>

      <section className="border-t border-slate-800 bg-slate-900 px-6 py-3">
        <div className="mx-auto max-w-4xl">
          <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">
            Live Subtitles
          </h3>
          <div className="max-h-32 overflow-y-auto rounded-lg bg-slate-950 p-3 text-sm">
            {subtitles.length === 0 ? (
              <p className="text-slate-500 italic">No subtitles yet. Make sure a remote participant is speaking and their microphone is on.</p>
            ) : (
              subtitles.map((s, idx) => (
                <div key={idx} className="mb-2 last:mb-0">
                  <span className="text-xs text-slate-500">
                    {s.fromLanguage} → {s.toLanguage}
                    {!s.isFinal && <span className="ml-1 italic">(typing…)</span>}
                  </span>
                  <p className="text-slate-200">{s.translatedText || s.sourceText}</p>
                </div>
              ))
            )}
          </div>
        </div>
      </section>

      <footer className="flex items-center justify-center gap-4 border-t border-slate-800 bg-slate-900 px-6 py-4">
        <button
          onClick={() => void toggleMic()}
          className={`flex h-12 w-12 items-center justify-center rounded-full ${localAudioEnabled ? 'bg-slate-700 text-white' : 'bg-rose-600 text-white'}`}
        >
          {localAudioEnabled ? <Mic className="h-5 w-5" /> : <MicOff className="h-5 w-5" />}
        </button>
        <button
          onClick={() => void toggleCam()}
          className={`flex h-12 w-12 items-center justify-center rounded-full ${localVideoEnabled ? 'bg-slate-700 text-white' : 'bg-rose-600 text-white'}`}
        >
          {localVideoEnabled ? <VideoIcon className="h-5 w-5" /> : <VideoOff className="h-5 w-5" />}
        </button>
        <button
          onClick={() => void hangUp()}
          className="flex h-12 w-12 items-center justify-center rounded-full bg-rose-600 text-white hover:bg-rose-700"
        >
          <PhoneOff className="h-5 w-5" />
        </button>
        <button
          onClick={() => void endMeeting()}
          disabled={endingMeeting}
          className="ml-2 inline-flex items-center gap-2 rounded-full bg-rose-700 px-4 py-2 text-sm font-medium text-white hover:bg-rose-800 disabled:opacity-50"
        >
          {endingMeeting ? (
            <>
              <LoadingSpinner size="sm" className="text-white" />
              Ending…
            </>
          ) : (
            'End Meeting'
          )}
        </button>
        {!interpretationStarted && AI_INTERPRETATION_MEDIA_ADAPTER_IMPLEMENTED && (
          <button
            onClick={() => void startInterpretation()}
            disabled={interpretationLoading || remoteParticipants.length === 0}
            title={
              remoteParticipants.length === 0
                ? 'Waiting for a remote participant to join'
                : 'Start real-time translation'
            }
            className="ml-2 rounded-full bg-teal-600 px-4 py-2 text-sm font-medium text-white hover:bg-teal-700 disabled:opacity-50"
          >
            {interpretationLoading
              ? 'Starting…'
              : remoteParticipants.length === 0
                ? 'Waiting for remote participant…'
                : 'Start Translation'}
          </button>
        )}
        {!interpretationStarted && !AI_INTERPRETATION_MEDIA_ADAPTER_IMPLEMENTED && (
          <span className="ml-2 rounded-full border border-slate-700 px-4 py-2 text-xs text-slate-400">
            AI translation is not available in this build
          </span>
        )}
        {interpretationStarted && (
          <button
            onClick={() => void stopInterpretation()}
            disabled={interpretationLoading}
            className="ml-2 rounded-full bg-amber-700 px-4 py-2 text-sm font-medium text-white hover:bg-amber-800"
          >
            {interpretationLoading ? 'Stopping AI…' : 'Stop AI translation'}
          </button>
        )}
      </footer>
      {interpretationError && (
        <div className="border-t border-red-900/50 bg-red-950/50 px-6 py-2 text-center text-sm text-red-200">
          Translation error: {interpretationError}
        </div>
      )}
      {meetingError && (
        <div className="border-t border-red-900/50 bg-red-950/50 px-6 py-2 text-center text-sm text-red-200">
          End meeting error: {meetingError}
        </div>
      )}
    </div>
  );
}

function VideoRenderer({
  track,
  muted,
  className,
}: {
  track: LocalVideoTrack | RemoteVideoTrack;
  muted?: boolean;
  className?: string;
}) {
  const ref = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    track.attach(el);
    return () => {
      track.detach(el);
    };
  }, [track]);

  return (
    <video
      ref={ref}
      autoPlay
      playsInline
      muted={muted}
      className={`object-cover bg-slate-900 ${className ?? ''}`}
    />
  );
}

function AudioRenderer({ track }: { track: RemoteAudioTrack }) {
  const ref = useRef<HTMLAudioElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    track.attach(el);
    return () => {
      track.detach(el);
    };
  }, [track]);

  return <audio ref={ref} autoPlay className="hidden" />;
}
