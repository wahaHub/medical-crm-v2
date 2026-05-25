export interface Actor {
  userId: string;
  keycloakUserId?: string | null;
  email: string;
  role: 'ADMIN' | 'HOSPITAL' | 'PATIENT';
  hospitalId: string | null;
}

/** Session type from @medical-crm/infrastructure/auth */
export interface Session {
  userId: string;
  keycloakUserId?: string | null;
  email: string;
  roles: string[];
  hospitalId: string | null;
}

/** Map Keycloak realm roles to application Actor roles. */
const ROLE_MAP: Record<string, Actor['role']> = {
  admin: 'ADMIN',
  hospital: 'HOSPITAL',
  regular_hospital: 'HOSPITAL',
  beauty_hospital: 'HOSPITAL',
  patient: 'PATIENT',
  // Also support uppercase (case-insensitive matching below)
  ADMIN: 'ADMIN',
  HOSPITAL: 'HOSPITAL',
  PATIENT: 'PATIENT',
};

const ROLE_PRIORITY: Actor['role'][] = ['ADMIN', 'HOSPITAL', 'PATIENT'];

export function toActor(session: Session): Actor {
  // Map each Keycloak role to an app role, then pick highest priority
  const mappedRoles = session.roles
    .map((r) => ROLE_MAP[r])
    .filter((r): r is Actor['role'] => r !== undefined);
  const role = ROLE_PRIORITY.find((r) => mappedRoles.includes(r)) ?? 'PATIENT';
  return {
    userId: session.userId,
    keycloakUserId: session.keycloakUserId ?? null,
    email: session.email,
    role,
    hospitalId: session.hospitalId,
  };
}
