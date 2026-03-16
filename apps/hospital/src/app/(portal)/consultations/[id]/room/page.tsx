import { VideoRoom } from '@/components/video-room';

export default async function VideoRoomPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <VideoRoom consultationId={id} />;
}
