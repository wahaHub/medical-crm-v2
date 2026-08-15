import { asc, eq } from 'drizzle-orm';
import type {
  INotificationRecipientRepository,
  NotificationPreferences,
  NotificationRecipient,
} from '@medical-crm/domain';
import type { CrmDb } from '../crm-client.js';
import { users } from '../schema/index.js';

function mapRecipient(
  row: {
    id: string;
    // users.email became nullable in Case Lifecycle Phase 1 (offline patients);
    // notification recipients are admins/hospitals, which always have an email.
    email: string | null;
    name: string;
    role: 'ADMIN' | 'HOSPITAL' | 'PATIENT';
    preferredLanguage: string;
    patientSite: 'beauty' | 'china' | null;
    notificationSettings: unknown;
    lastLoginAt: string | null;
  },
): NotificationRecipient {
  return {
    id: row.id,
    email: row.email ?? '',
    name: row.name,
    role: row.role,
    preferredLanguage: row.preferredLanguage,
    patientSite: row.patientSite,
    notificationSettings: (row.notificationSettings as NotificationPreferences | null) ?? null,
    lastLoginAt: row.lastLoginAt ?? null,
  };
}

export class DrizzleNotificationRecipientRepository implements INotificationRecipientRepository {
  constructor(private readonly db: CrmDb) {}

  async listAdminRecipients(): Promise<NotificationRecipient[]> {
    const rows = await this.db
      .select({
        id: users.id,
        email: users.email,
        name: users.name,
        role: users.role,
        preferredLanguage: users.preferredLanguage,
        patientSite: users.patientSite,
        notificationSettings: users.notificationSettings,
        lastLoginAt: users.lastLoginAt,
      })
      .from(users)
      .where(eq(users.role, 'ADMIN'))
      .orderBy(asc(users.email));

    return rows.map((row) => mapRecipient(row));
  }

  async findRecipientById(id: string): Promise<NotificationRecipient | null> {
    const rows = await this.db
      .select({
        id: users.id,
        email: users.email,
        name: users.name,
        role: users.role,
        preferredLanguage: users.preferredLanguage,
        patientSite: users.patientSite,
        notificationSettings: users.notificationSettings,
        lastLoginAt: users.lastLoginAt,
      })
      .from(users)
      .where(eq(users.id, id))
      .limit(1);

    const row = rows[0];
    return row ? mapRecipient(row) : null;
  }
}
