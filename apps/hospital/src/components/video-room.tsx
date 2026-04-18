'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import {
  Mic,
  MicOff,
  Video,
  VideoOff,
  Phone,
  PhoneOff,
  Captions,
  Circle,
} from 'lucide-react';
import { Button } from '@medical-crm/ui';
import { updateConsultationStatus } from '@/actions/consultation-actions';
import { useHospitalI18n } from '@/lib/hospital-i18n';

interface VideoRoomProps {
  consultationId: string;
}

type RoomState = 'pre-join' | 'in-call';

export function VideoRoom({ consultationId }: VideoRoomProps) {
  const { t } = useHospitalI18n();
  const tx = (key: string, fallback: string) => t(key, undefined, fallback);
  const router = useRouter();
  const [roomState, setRoomState] = useState<RoomState>('pre-join');
  const [micOn, setMicOn] = useState(true);
  const [cameraOn, setCameraOn] = useState(true);
  const [recording, setRecording] = useState(false);
  const [subtitles, setSubtitles] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (roomState === 'in-call') {
      timerRef.current = setInterval(() => {
        setElapsed((prev) => prev + 1);
      }, 1000);
    }
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [roomState]);

  const formatElapsed = (seconds: number) => {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = seconds % 60;
    if (h > 0) {
      return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
    }
    return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  };

  const handleJoin = useCallback(() => {
    setRoomState('in-call');
  }, []);

  const handleEndCall = useCallback(async () => {
    if (timerRef.current) clearInterval(timerRef.current);
    await updateConsultationStatus(consultationId, 'complete');
    router.push('/consultations');
  }, [consultationId, router]);

  if (roomState === 'pre-join') {
    return (
      <div className="flex min-h-[calc(100vh-4rem)] items-center justify-center">
        <div className="w-full max-w-lg space-y-6 text-center">
          <h1 className="text-2xl font-semibold text-slate-900">
            {tx('hospital.portal.videoRoom.preJoin.title', 'Ready to join?')}
          </h1>
          <p className="text-sm text-slate-500">
            {tx(
              'hospital.portal.videoRoom.preJoin.description',
              'Check your camera and microphone before joining the call.',
            )}
          </p>

          {/* Camera preview placeholder */}
          <div className="mx-auto aspect-video w-full max-w-md overflow-hidden rounded-2xl bg-slate-900">
            <div className="flex h-full items-center justify-center text-slate-500">
              {cameraOn ? (
                <Video size={48} className="text-slate-400" />
              ) : (
                <VideoOff size={48} className="text-slate-600" />
              )}
            </div>
          </div>

          {/* Pre-join controls */}
          <div className="flex items-center justify-center gap-4">
            <button
              onClick={() => setMicOn(!micOn)}
              className={`flex h-12 w-12 items-center justify-center rounded-full transition-colors ${
                micOn
                  ? 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                  : 'bg-rose-100 text-rose-600 hover:bg-rose-200'
              }`}
              title={micOn
                ? tx('hospital.portal.videoRoom.controls.muteMicrophone', 'Mute microphone')
                : tx('hospital.portal.videoRoom.controls.unmuteMicrophone', 'Unmute microphone')}
            >
              {micOn ? <Mic size={20} /> : <MicOff size={20} />}
            </button>
            <button
              onClick={() => setCameraOn(!cameraOn)}
              className={`flex h-12 w-12 items-center justify-center rounded-full transition-colors ${
                cameraOn
                  ? 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                  : 'bg-rose-100 text-rose-600 hover:bg-rose-200'
              }`}
              title={cameraOn
                ? tx('hospital.portal.videoRoom.controls.turnOffCamera', 'Turn off camera')
                : tx('hospital.portal.videoRoom.controls.turnOnCamera', 'Turn on camera')}
            >
              {cameraOn ? <Video size={20} /> : <VideoOff size={20} />}
            </button>
          </div>

          <Button onClick={handleJoin} className="gap-2 px-8">
            <Phone size={16} />
            {tx('hospital.portal.videoRoom.preJoin.joinCall', 'Join Call')}
          </Button>
        </div>
      </div>
    );
  }

  // In-call screen
  return (
    <div className="flex min-h-[calc(100vh-4rem)] flex-col bg-slate-950">
      {/* Timer */}
      <div className="flex items-center justify-center py-3">
        <span className="rounded-full bg-slate-800 px-4 py-1 text-sm font-mono text-white">
          {formatElapsed(elapsed)}
        </span>
        {recording && (
          <span className="ml-3 flex items-center gap-1 text-xs text-rose-400">
            <Circle size={8} className="fill-rose-500 text-rose-500 animate-pulse" />
            {tx('hospital.portal.videoRoom.inCall.recordingIndicator', 'REC')}
          </span>
        )}
      </div>

      {/* Main video area */}
      <div className="flex flex-1 items-center justify-center p-4">
        <div className="aspect-video w-full max-w-4xl rounded-2xl bg-slate-800">
          <div className="flex h-full items-center justify-center text-slate-600">
            <Video size={64} />
          </div>
        </div>
      </div>

      {/* Self-view pip */}
      <div className="absolute bottom-28 right-8 h-32 w-44 overflow-hidden rounded-xl bg-slate-700 shadow-lg">
        <div className="flex h-full items-center justify-center text-slate-500">
          {cameraOn ? (
            <Video size={24} />
          ) : (
            <VideoOff size={24} />
          )}
        </div>
      </div>

      {/* Control bar */}
      <div className="flex items-center justify-center gap-3 py-6">
        <button
          onClick={() => setMicOn(!micOn)}
          className={`flex h-12 w-12 items-center justify-center rounded-full transition-colors ${
            micOn
              ? 'bg-slate-700 text-white hover:bg-slate-600'
              : 'bg-rose-500 text-white hover:bg-rose-600'
          }`}
          title={micOn
            ? tx('hospital.portal.videoRoom.controls.mute', 'Mute')
            : tx('hospital.portal.videoRoom.controls.unmute', 'Unmute')}
        >
          {micOn ? <Mic size={20} /> : <MicOff size={20} />}
        </button>

        <button
          onClick={() => setCameraOn(!cameraOn)}
          className={`flex h-12 w-12 items-center justify-center rounded-full transition-colors ${
            cameraOn
              ? 'bg-slate-700 text-white hover:bg-slate-600'
              : 'bg-rose-500 text-white hover:bg-rose-600'
          }`}
          title={cameraOn
            ? tx('hospital.portal.videoRoom.controls.stopVideo', 'Stop video')
            : tx('hospital.portal.videoRoom.controls.startVideo', 'Start video')}
        >
          {cameraOn ? <Video size={20} /> : <VideoOff size={20} />}
        </button>

        <button
          onClick={() => setRecording(!recording)}
          className={`flex h-12 w-12 items-center justify-center rounded-full transition-colors ${
            recording
              ? 'bg-rose-500 text-white hover:bg-rose-600'
              : 'bg-slate-700 text-white hover:bg-slate-600'
          }`}
          title={recording
            ? tx('hospital.portal.videoRoom.controls.stopRecording', 'Stop recording')
            : tx('hospital.portal.videoRoom.controls.startRecording', 'Start recording')}
        >
          <Circle size={20} className={recording ? 'fill-white' : ''} />
        </button>

        <button
          onClick={() => setSubtitles(!subtitles)}
          className={`flex h-12 w-12 items-center justify-center rounded-full transition-colors ${
            subtitles
              ? 'bg-indigo-500 text-white hover:bg-indigo-600'
              : 'bg-slate-700 text-white hover:bg-slate-600'
          }`}
          title={subtitles
            ? tx('hospital.portal.videoRoom.controls.hideSubtitles', 'Hide subtitles')
            : tx('hospital.portal.videoRoom.controls.showSubtitles', 'Show subtitles')}
        >
          <Captions size={20} />
        </button>

        <button
          onClick={handleEndCall}
          className="flex h-12 w-16 items-center justify-center rounded-full bg-rose-600 text-white transition-colors hover:bg-rose-700"
          title={tx('hospital.portal.videoRoom.controls.endCall', 'End call')}
        >
          <PhoneOff size={20} />
        </button>
      </div>

      {/* Subtitles overlay */}
      {subtitles && (
        <div className="absolute bottom-24 left-1/2 -translate-x-1/2 rounded-lg bg-black/70 px-6 py-2">
          <p className="text-sm text-white">
            {tx('hospital.portal.videoRoom.inCall.subtitlesPlaceholder', 'Subtitles will appear here...')}
          </p>
        </div>
      )}
    </div>
  );
}
