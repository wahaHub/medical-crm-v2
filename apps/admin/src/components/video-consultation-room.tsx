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

interface Props {
  token: string;
  livekitUrl: string;
  identity: string;
  roomName: string;
  displayName?: string;
  onClose: () => void;
}

export function VideoConsultationRoom({
  token,
  livekitUrl,
  identity,
  roomName,
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

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-slate-950">
      <header className="flex items-center justify-between border-b border-slate-800 bg-slate-900 px-6 py-4">
        <div>
          <h2 className="text-lg font-semibold text-white">{roomName}</h2>
          <p className="text-xs text-slate-400">{status}</p>
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
      </footer>
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
