import type { RegistrationToken } from '../value-objects/registration-token.js';

export interface IRegistrationTokenRepository {
  findByToken(token: string): Promise<RegistrationToken | null>;
  findByHospitalId(hospitalId: string): Promise<RegistrationToken[]>;
  save(token: RegistrationToken): Promise<RegistrationToken>;
}
