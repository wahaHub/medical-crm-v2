import { redirect } from 'next/navigation';
import { getSession } from '@/lib/session';
import { AuthProvider } from '@/lib/auth-context';
import { QueryProvider } from '@/lib/query-provider';
import { AdminShell } from '@/components/admin-shell';
import { extractUserFromToken } from '@/lib/keycloak-client';
import { apiFetch } from '@/lib/api-fetch';

interface UserProfileResponse {
  preferredLanguage?: string;
}

export default async function PortalLayout({ children }: { children: React.ReactNode }) {
  const session = await getSession();

  if (!session?.access_token) {
    redirect('/auth/login');
  }

  const keycloakUser = extractUserFromToken(session.access_token);
  if (!keycloakUser) {
    redirect('/auth/login');
  }

  const profileRes = await apiFetch('/api/v2/users/me');
  const profile = profileRes.ok
    ? await profileRes.json() as UserProfileResponse
    : null;

  const user = {
    id: keycloakUser.sub,
    email: keycloakUser.email ?? '',
    roles: keycloakUser.roles,
    preferredLanguage: profile?.preferredLanguage,
  };

  const isAdmin = user.roles.some((role) => role.toLowerCase() === 'admin');
  if (!isAdmin) {
    redirect('/auth/logout');
  }

  return (
    <AuthProvider user={user}>
      <QueryProvider>
        <AdminShell>{children}</AdminShell>
      </QueryProvider>
    </AuthProvider>
  );
}
