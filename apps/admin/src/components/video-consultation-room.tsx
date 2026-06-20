'use client';

import { useEffect, useRef, useState } from 'react';
import {
  Room,
  RoomEvent,
  Track,
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
  onClose: () => void;
}

interface VideoItem {
  sid: string;
  track: LocalVideoTrack | RemoteVideoTrack;
  identity: string;
  name: string;
  isLocal: boolean;
}

interface AudioItem {
  sid: string;
  track: RemoteAudioTrack;
  identity: string;
}

export function VideoConsultationRoom({ token, livekitUrl, identity, roomName, onClose }: Props) {
  const [room, setRoom] = useState<Room | null>(null);
  const [connecting, setConnecting] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [videoTracks, setVideoTracks] = useState<VideoItem[]>([]);
  const [audioTracks, setAudioTracks] = useState<AudioItem[]>([]);
  const [micEnabled, setMicEnabled] = useState(true);
  const [camEnabled, setCamEnabled] = useState(true);

  useEffect(() => {
    let mounted = true;
    const lkRoom = new Room({
      adaptiveStream: true,
      dynacast: true,
      publishDefaults: { simulcast: true },
    });

    async function connect() {
      try {
        await lkRoom.connect(livekitUrl, token);
        await lkRoom.localParticipant.setCameraEnabled(true);
        await lkRoom.localParticipant.setMicrophoneEnabled(true);

        if (!mounted) return;

        const cameraPub = lkRoom.localParticipant.getTrackPublication(Track.Source.Camera);
        if (cameraPub?.track) {
          setVideoTracks((prev) => [
            ...prev.filter((v) => !v.isLocal),
            {
              sid: cameraPub.trackSid,
              track: cameraPub.track as LocalVideoTrack,
              identity,
              name: 'You',
              isLocal: true,
            },
          ]);
        }

        lkRoom.remoteParticipants.forEach((participant) => {
          addParticipantTracks(participant);
        });

        setRoom(lkRoom);
      } catch (err) {
        if (mounted) {
          setError(err instanceof Error ? err.message : String(err));
        }
      } finally {
        if (mounted) setConnecting(false);
      }
    }

    function addParticipantTracks(participant: RemoteParticipant) {
      participant.trackPublications.forEach((pub) => {
        if (!pub.track) return;
        if (pub.kind === Track.Kind.Video) {
          setVideoTracks((prev) =>
            addVideo(
              prev,
              pub.trackSid,
              pub.track as RemoteVideoTrack,
              participant.identity,
              participant.name || participant.identity,
              false,
            ),
          );
        } else if (pub.kind === Track.Kind.Audio) {
          setAudioTracks((prev) => addAudio(prev, pub.trackSid, pub.track as RemoteAudioTrack, participant.identity));
        }
      });
    }

    function removeParticipantTracks(participant: RemoteParticipant) {
      setVideoTracks((prev) => prev.filter((v) => v.identity !== participant.identity || v.isLocal));
      setAudioTracks((prev) => prev.filter((a) => a.identity !== participant.identity));
    }

    lkRoom
      .on(RoomEvent.LocalTrackPublished, (pub) => {
        if (pub.kind === Track.Kind.Video && pub.track) {
          setVideoTracks((prev) =>
            addVideo(prev, pub.trackSid, pub.track as LocalVideoTrack, identity, 'You', true),
          );
        }
      })
      .on(RoomEvent.LocalTrackUnpublished, (pub) => {
        if (pub.kind === Track.Kind.Video) {
          setVideoTracks((prev) => prev.filter((v) => v.sid !== pub.trackSid));
        }
      })
      .on(RoomEvent.TrackSubscribed, (track, pub, participant) => {
        if (track.kind === Track.Kind.Video) {
          setVideoTracks((prev) =>
            addVideo(
              prev,
              pub.trackSid,
              track as RemoteVideoTrack,
              participant.identity,
              participant.name || participant.identity,
              false,
            ),
          );
        } else if (track.kind === Track.Kind.Audio) {
          setAudioTracks((prev) =>
            addAudio(prev, pub.trackSid, track as RemoteAudioTrack, participant.identity),
          );
        }
      })
      .on(RoomEvent.TrackUnsubscribed, (_track, pub) => {
        if (pub.kind === Track.Kind.Video) {
          setVideoTracks((prev) => prev.filter((v) => v.sid !== pub.trackSid));
        } else if (pub.kind === Track.Kind.Audio) {
          setAudioTracks((prev) => prev.filter((a) => a.sid !== pub.trackSid));
        }
      })
      .on(RoomEvent.ParticipantDisconnected, (participant) => {
        removeParticipantTracks(participant);
      })
      .on(RoomEvent.Disconnected, () => {
        onClose();
      });

    void connect();

    return () => {
      mounted = false;
      lkRoom.disconnect().catch(() => {});
    };
  }, [livekitUrl, token, identity, onClose]);

  async function toggleMic() {
    if (!room) return;
    const pub = await room.localParticipant.setMicrophoneEnabled(!micEnabled);
    setMicEnabled(!!pub);
  }

  async function toggleCam() {
    if (!room) return;
    const pub = await room.localParticipant.setCameraEnabled(!camEnabled);
    setCamEnabled(!!pub);
  }

  async function hangUp() {
    if (room) {
      await room.disconnect();
    }
    onClose();
  }

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-slate-950">
      <div className="flex items-center justify-between px-6 py-4">
        <div>
          <h2 className="text-lg font-semibold text-white">{roomName}</h2>
          <p className="text-xs text-slate-400">Connected as {identity}</p>
        </div>
        <button onClick={hangUp} className="text-slate-400 hover:text-white">
          <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      <div className="relative flex flex-1 items-center justify-center overflow-hidden p-4">
        {connecting && (
          <div className="flex flex-col items-center gap-3 text-white">
            <LoadingSpinner size="lg" />
            <span className="text-sm">Joining room…</span>
          </div>
        )}

        {error && (
          <div className="max-w-md rounded-xl bg-rose-500/10 p-6 text-center text-rose-200">
            <p className="font-medium">Could not join room</p>
            <p className="mt-2 text-sm">{error}</p>
            <Button variant="outline" className="mt-4" onClick={onClose}>
              Close
            </Button>
          </div>
        )}

        {!connecting && !error && videoTracks.length === 0 && (
          <div className="text-center text-slate-400">
            <p>No video available.</p>
          </div>
        )}

        <div className="grid h-full w-full max-w-6xl grid-cols-1 gap-4 md:grid-cols-2">
          {videoTracks.map((item) => (
            <VideoTile key={item.sid} item={item} />
          ))}
        </div>
      </div>

      {/* Hidden audio elements for remote tracks */}
      {audioTracks.map((item) => (
        <AudioTile key={item.sid} track={item.track} />
      ))}

      <div className="flex items-center justify-center gap-4 border-t border-slate-800 bg-slate-900 px-6 py-4">
        <button
          onClick={() => void toggleMic()}
          className={`flex h-12 w-12 items-center justify-center rounded-full ${micEnabled ? 'bg-slate-700 text-white' : 'bg-rose-600 text-white'}`}
        >
          {micEnabled ? <Mic className="h-5 w-5" /> : <MicOff className="h-5 w-5" />}
        </button>
        <button
          onClick={() => void toggleCam()}
          className={`flex h-12 w-12 items-center justify-center rounded-full ${camEnabled ? 'bg-slate-700 text-white' : 'bg-rose-600 text-white'}`}
        >
          {camEnabled ? <VideoIcon className="h-5 w-5" /> : <VideoOff className="h-5 w-5" />}
        </button>
        <button
          onClick={() => void hangUp()}
          className="flex h-12 w-12 items-center justify-center rounded-full bg-rose-600 text-white hover:bg-rose-700"
        >
          <PhoneOff className="h-5 w-5" />
        </button>
      </div>
    </div>
  );
}

function addVideo(
  prev: VideoItem[],
  sid: string,
  track: LocalVideoTrack | RemoteVideoTrack,
  participantIdentity: string,
  participantName: string,
  isLocal: boolean,
): VideoItem[] {
  const next = prev.filter((v) => v.sid !== sid);
  next.push({ sid, track, identity: participantIdentity, name: participantName, isLocal });
  return next;
}

function addAudio(prev: AudioItem[], sid: string, track: RemoteAudioTrack, participantIdentity: string): AudioItem[] {
  const next = prev.filter((a) => a.sid !== sid);
  next.push({ sid, track, identity: participantIdentity });
  return next;
}

function VideoTile({ item }: { item: VideoItem }) {
  const ref = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    item.track.attach(el);
    return () => {
      item.track.detach(el);
    };
  }, [item.track]);

  return (
    <div
      className={`relative overflow-hidden rounded-2xl bg-slate-900 ${item.isLocal ? 'absolute bottom-24 right-6 h-40 w-28 md:h-52 md:w-40' : 'h-full min-h-[240px] w-full'}`}
    >
      <video ref={ref} autoPlay playsInline muted={item.isLocal} className="h-full w-full object-cover" />
      <div className="absolute bottom-3 left-3 rounded-md bg-black/50 px-2 py-1 text-xs text-white">
        {item.name}
      </div>
    </div>
  );
}

function AudioTile({ track }: { track: RemoteAudioTrack }) {
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
