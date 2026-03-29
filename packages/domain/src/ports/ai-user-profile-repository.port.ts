import type { AiUserProfile } from '../entities/ai-user-profile.entity.js';

export interface IAiUserProfileRepository {
  findByAnonymousKeyOrPatient(input: {
    anonymousKey?: string | null;
    patientId?: string | null;
  }, tx?: unknown): Promise<AiUserProfile | null>;
  save(entity: AiUserProfile, tx?: unknown): Promise<AiUserProfile>;
  patch(profileId: string, patch: Partial<AiUserProfile>, tx?: unknown): Promise<AiUserProfile | null>;
}
