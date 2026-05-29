import type { HospitalPasswordResetToken } from '../value-objects/hospital-password-reset-token.js';

export interface IHospitalPasswordResetTokenRepository {
  findByToken(token: string): Promise<HospitalPasswordResetToken | null>;
  findByUserId(userId: string): Promise<HospitalPasswordResetToken[]>;
  save(token: HospitalPasswordResetToken): Promise<HospitalPasswordResetToken>;
}
