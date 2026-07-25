import { GuideEditor } from '@/components/guide-editor';

export default async function EditGuidePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <GuideEditor guideId={id} />;
}
