export interface Actor {
  userId: string;
  email: string;
  role: 'ADMIN' | 'HOSPITAL' | 'PATIENT';
  hospitalId: string | null;
}

/** Session type from @medical-crm/infrastructure/auth */
export interface Session {
  userId: string;
  email: string;
  roles: string[];
  hospitalId: string | null;
}

const ROLE_PRIORITY: string[] = ['ADMIN', 'HOSPITAL', 'PATIENT'];

export function toActor(session: Session): Actor {
  const role = ROLE_PRIORITY.find((r) => session.roles.includes(r)) ?? 'PATIENT';
  return {
    userId: session.userId,
    email: session.email,
    role: role as Actor['role'],
    hospitalId: session.hospitalId,
  };
}
