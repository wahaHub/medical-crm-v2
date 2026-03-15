export interface CreateUserInput {
  id: string;
  email: string;
  name: string;
  role: 'HOSPITAL';
  hospitalId: string;
  preferredLanguage: string;
}

export interface IUserRepository {
  create(input: CreateUserInput): Promise<{ id: string }>;
  findPreferredLanguage(hospitalId: string): Promise<string | null>;
}
