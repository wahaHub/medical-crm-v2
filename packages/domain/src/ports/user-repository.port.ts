export interface CreateUserInput {
  id: string;
  email: string;
  name: string;
  role: 'HOSPITAL';
  hospitalId: string;
  preferredLanguage: string;
}

export interface UserProfile {
  id: string;
  email: string;
  name: string;
  role: string;
  preferredLanguage: string;
  hospitalId: string | null;
}

export interface UpdateUserProfileInput {
  email?: string;
  preferredLanguage?: string;
}

export interface IUserRepository {
  create(input: CreateUserInput): Promise<{ id: string }>;
  findPreferredLanguage(hospitalId: string): Promise<string | null>;
  findById(id: string): Promise<UserProfile | null>;
  update(id: string, input: UpdateUserProfileInput): Promise<void>;
}
