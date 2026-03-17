import { redirect } from 'next/navigation';
import { getSession } from '@/lib/session';
import { AuthProvider } from '@/lib/auth-context';
import { QueryProvider } from '@/lib/query-provider';
import { AdminShell } from '@/components/admin-shell';
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

  const user = {
    id: keycloakUser.sub,
    email: keycloakUser.email ?? '',
    roles: keycloakUser.roles,
  };

  return (
    <AuthProvider user={user}>
      <QueryProvider>
        <AdminShell>{children}</AdminShell>
      </QueryProvider>
    </AuthProvider>
  );
}
