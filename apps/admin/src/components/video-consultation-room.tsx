'use client';

import { useEffect, useRef, useState } from 'react';
import {
  Room,
  RoomEvent,
  Track,
  VideoPresets,
  type RemoteParticipant,
  type RemoteTrack,
  type RemoteTrackPublication,
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
  const localRef = useRef<HTMLDivElement>(null);
  const remoteRef = useRef<HTMLDivElement>(null);
  const roomRef = useRef<Room | null>(null);

  const [connecting, setConnecting] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState('Joining…');
  const [localVideoEnabled, setLocalVideoEnabled] = useState(true);
  const [localAudioEnabled, setLocalAudioEnabled] = useState(true);
  const [remoteParticipants, setRemoteParticipants] = useState<RemoteParticipant[]>([]);

  useEffect(() => {
    let disposed = false;

    const room = new Room({
      adaptiveStream: true,
      dynacast: true,
      publishDefaults: { simulcast: true },
      videoCaptureDefaults: {
        resolution: VideoPresets.h720.resolution,
      },
    });
    roomRef.current = room;

    const attachRemoteTrack = (
      track: RemoteTrack,
      publication: RemoteTrackPublication,
      participant: RemoteParticipant,
    ) => {
      if (track.kind !== Track.Kind.Audio && track.kind !== Track.Kind.Video) return;
      const element = track.attach();
      element.dataset.participant = participant.identity;
      element.dataset.trackSid = publication.trackSid;
      element.className = track.kind === Track.Kind.Video ? 'w-full h-full object-cover bg-slate-900' : 'hidden';
      remoteRef.current?.appendChild(element);
    };

    const detachRemoteTrack = (track: RemoteTrack) => {
      for (const element of track.detach()) {
        element.remove();
      }
    };

    room
      .on(RoomEvent.TrackSubscribed, attachRemoteTrack)
      .on(RoomEvent.TrackUnsubscribed, detachRemoteTrack)
      .on(RoomEvent.ParticipantConnected, (participant) => {
        setStatus(`Remote joined: ${participant.identity}`);
        setRemoteParticipants((prev) => [...prev, participant]);
      })
      .on(RoomEvent.ParticipantDisconnected, (participant) => {
        setStatus(`Remote left: ${participant.identity}`);
        setRemoteParticipants((prev) => prev.filter((p) => p.identity !== participant.identity));
      })
      .on(RoomEvent.Disconnected, () => onClose())
      .on(RoomEvent.LocalTrackPublished, attachLocalVideo);

    async function connect() {
      setStatus('Connecting…');
      await room.connect(livekitUrl, token);
      if (disposed) return;

      await room.localParticipant.setCameraEnabled(true);
      await room.localParticipant.setMicrophoneEnabled(true);
      setLocalVideoEnabled(true);
      setLocalAudioEnabled(true);
      attachLocalVideo();
      setStatus(`Joined: ${roomName}`);
      setConnecting(false);
    }

    function attachLocalVideo() {
      const container = localRef.current;
      if (!container) return;
      const elements: HTMLElement[] = [];
      room.localParticipant.videoTrackPublications.forEach((publication) => {
        const element = publication.videoTrack?.attach();
        if (element) {
          element.className = 'w-full h-full object-cover bg-slate-900';
          elements.push(element);
        }
      });
      container.replaceChildren(...elements);
    }

    connect().catch((err) => {
      if (disposed) return;
      setError(err instanceof Error ? err.message : String(err));
      setConnecting(false);
    });

    return () => {
      disposed = true;
      room.disconnect().catch(() => {});
    };
  }, [livekitUrl, token, roomName, onClose]);

  async function toggleCam() {
    const room = roomRef.current;
    if (!room) return;

    const nextEnabled = !localVideoEnabled;
    await room.localParticipant.setCameraEnabled(nextEnabled);
    setLocalVideoEnabled(nextEnabled);

    const container = localRef.current;
    if (!container) return;
    if (!nextEnabled) {
      container.replaceChildren();
      return;
    }

    const elements: HTMLElement[] = [];
    room.localParticipant.videoTrackPublications.forEach((publication) => {
      const element = publication.videoTrack?.attach();
      if (element) {
        element.className = 'w-full h-full object-cover bg-slate-900';
        elements.push(element);
      }
    });
    container.replaceChildren(...elements);
  }

  async function toggleMic() {
    const room = roomRef.current;
    if (!room) return;

    const nextEnabled = !localAudioEnabled;
    await room.localParticipant.setMicrophoneEnabled(nextEnabled);
    setLocalAudioEnabled(nextEnabled);
  }

  function hangUp() {
    roomRef.current?.disconnect();
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
        {connecting && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 text-white">
            <LoadingSpinner size="lg" />
            <span className="text-sm">Joining room…</span>
          </div>
        )}

        {error && (
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="max-w-md rounded-xl bg-rose-500/10 p-6 text-center text-rose-200">
              <p className="font-medium">Could not join room</p>
              <p className="mt-2 text-sm">{error}</p>
              <Button variant="outline" className="mt-4" onClick={onClose}>
                Close
              </Button>
            </div>
          </div>
        )}

        {!connecting && !error && (
          <div className="grid h-full w-full grid-cols-1 gap-4 lg:grid-cols-2">
            {/* Local (self) video */}
            <div className="relative flex min-h-[240px] flex-col overflow-hidden rounded-2xl border border-slate-800 bg-slate-900">
              <div className="absolute left-0 top-0 z-10 rounded-br-lg bg-slate-800/80 px-3 py-1 text-xs text-white">
                You: {displayName || identity}
              </div>
              <div ref={localRef} className="flex-1 bg-slate-950">
                {!localVideoEnabled && (
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
              <div ref={remoteRef} className="flex-1 bg-slate-950">
                {remoteParticipants.length === 0 && (
                  <div className="flex h-full items-center justify-center text-sm text-slate-500">
                    Waiting for others to join…
                  </div>
                )}
              </div>
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
