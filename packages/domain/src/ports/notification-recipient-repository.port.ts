import type { NotificationPreferences } from './user-repository.port.js';
import type { PatientSite } from './patient-repository.port.js';

export interface NotificationRecipient {
  id: string;
  email: string;
  name: string;
  role: 'ADMIN' | 'HOSPITAL' | 'PATIENT';
  preferredLanguage?: string | null;
  patientSite?: PatientSite | null;
  notificationSettings: NotificationPreferences | null;
  lastLoginAt: string | null;
}

export interface INotificationRecipientRepository {
  listAdminRecipients(): Promise<NotificationRecipient[]>;
  findRecipientById(id: string): Promise<NotificationRecipient | null>;
}
