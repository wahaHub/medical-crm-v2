import { redirect } from 'next/navigation';
import { loadMessages, normalizeLocale } from '@medical-crm/i18n';
import { getSession } from '@/lib/session';
import { AuthProvider, type AuthUser } from '@/lib/auth-context';
import { PortalShell } from '@/components/portal-shell';
import { HospitalI18nProvider } from '@/lib/hospital-i18n';
import { extractUserFromToken } from '@/lib/keycloak-client';
import { apiFetch } from '@/lib/api-fetch';

interface UserProfileResponse {
  preferredLanguage?: string;
}

function isRedirectFailure(error: unknown): boolean {
  return (
    error instanceof Error
    && (
      error.message.startsWith('REDIRECT:')
      || ('digest' in error
        && typeof (error as { digest?: unknown }).digest === 'string'
        && (error as { digest: string }).digest.startsWith('NEXT_REDIRECT'))
    )
  );
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

  const profile = await apiFetch('/api/v2/users/me')
    .then(async (profileRes) => {
      if (profileRes.status === 401) {
        redirect('/auth/login');
      }

      return profileRes.ok
        ? await profileRes.json() as UserProfileResponse
        : null;
    })
    .catch((error) => {
      if (isRedirectFailure(error)) {
        throw error;
      }
      console.error('[HospitalPortalLayout] Failed to load user profile:', error);
      return null;
    });
  const locale = normalizeLocale(profile?.preferredLanguage);
  const messages = await loadMessages(locale);

  const user: AuthUser = {
    id: keycloakUser.sub,
    email: keycloakUser.email ?? '',
    roles: keycloakUser.roles,
    hospitalId: keycloakUser.hospital_id ?? null,
    preferredLanguage: profile?.preferredLanguage,
  };

  return (
    <AuthProvider user={user}>
      <HospitalI18nProvider initialLocale={locale} initialMessages={messages}>
        <PortalShell>{children}</PortalShell>
      </HospitalI18nProvider>
    </AuthProvider>
  );
}
