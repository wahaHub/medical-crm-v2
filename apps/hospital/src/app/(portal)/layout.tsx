import { redirect } from 'next/navigation';
import { getSession } from '@/lib/session';
import { AuthProvider, type AuthUser } from '@/lib/auth-context';
import { PortalShell } from '@/components/portal-shell';
import { extractUserFromToken } from '@/lib/keycloak-client';

export default async function PortalLayout({ children }: { children: React.ReactNode }) {
  const session = await getSession();

  if (!session?.access_token) {
    redirect('/auth/login');
  }

  const keycloakUser = extractUserFromToken(session.access_token);
  if (!keycloakUser) {
    redirect('/auth/login');
  }

  const user: AuthUser = {
    id: keycloakUser.sub,
    email: keycloakUser.email ?? '',
    roles: keycloakUser.roles,
    hospitalId: keycloakUser.hospital_id ?? null,
  };

  return (
    <AuthProvider user={user}>
      <PortalShell>{children}</PortalShell>
    </AuthProvider>
  );
}
