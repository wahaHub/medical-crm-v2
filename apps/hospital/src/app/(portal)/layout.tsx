import { redirect } from 'next/navigation';
import { getSession } from '@/lib/session';
import { AuthProvider, type AuthUser } from '@/lib/auth-context';
import { PortalShell } from '@/components/portal-shell';

function decodeJwtPayload(token: string): Record<string, unknown> {
  try {
    const payload = token.split('.')[1] ?? '';
    return JSON.parse(Buffer.from(payload, 'base64url').toString());
  } catch {
    return {};
  }
}

export default async function PortalLayout({ children }: { children: React.ReactNode }) {
  const session = await getSession();

  if (!session.access_token) {
    redirect('/auth/login');
  }

  const payload = decodeJwtPayload(session.access_token);
  const user: AuthUser = {
    id: (payload.sub as string) ?? '',
    email: (payload.email as string) ?? '',
    roles: (payload.realm_access as { roles?: string[] })?.roles ?? [],
    hospitalId: (payload.hospital_id as string) ?? null,
  };

  return (
    <AuthProvider user={user}>
      <PortalShell>{children}</PortalShell>
    </AuthProvider>
  );
}
