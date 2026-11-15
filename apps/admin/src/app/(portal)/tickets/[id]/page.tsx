import { redirect } from 'next/navigation';

// Admin ticket notification emails have linked to `/tickets/:id` since
// 2026-04, but the ticket UI lives at `/support`. Keep this redirect so
// links in historical emails keep resolving instead of 404-ing.
export default async function TicketEmailRedirectPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  redirect(`/support?ticket=${encodeURIComponent(id)}`);
}
