export interface CreateUserInput {
  id: string;
  email: string;
  name: string;
  role: 'HOSPITAL';
  hospitalId: string;
  preferredLanguage: string;
  keycloakUserId?: string | null;
}

export interface NotificationPreferences {
  newCase?: boolean;
  newMessage?: boolean;
  newTicket?: boolean;
  quoteStatusChange?: boolean;
  consultationReminder?: boolean;
}

export interface UserProfile {
  id: string;
  email: string;
  name: string;
  role: string;
  phone: string | null;
  patientSite?: 'beauty' | 'china' | null;
  preferredLanguage: string;
  hospitalId: string | null;
  notificationSettings: NotificationPreferences | null;
}

export interface UpdateUserProfileInput {
  email?: string;
  preferredLanguage?: string;
  notificationSettings?: NotificationPreferences;
}

export interface IUserRepository {
  create(input: CreateUserInput): Promise<{ id: string }>;
  findPreferredLanguage(hospitalId: string): Promise<string | null>;
  findById(id: string): Promise<UserProfile | null>;
  findByEmail(email: string): Promise<UserProfile | null>;
  update(id: string, input: UpdateUserProfileInput): Promise<void>;
  listAdminEmails(): Promise<string[]>;
  listHospitalEmails(hospitalId: string): Promise<string[]>;
}
