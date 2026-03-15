import { ValidationError } from '@medical-crm/utils';

export interface RegistrationTokenProps {
  id: string;
  hospitalId: string;
  token: string;
  email: string;
  expiresAt: Date;
  usedAt: Date | null;
  keycloakUserId: string | null;
  createdAt: Date;
}

export class RegistrationToken {
  readonly id: string;
  readonly hospitalId: string;
  readonly token: string;
  readonly email: string;
  readonly expiresAt: Date;
  usedAt: Date | null;
  keycloakUserId: string | null;
  readonly createdAt: Date;

  constructor(props: RegistrationTokenProps) {
    this.id = props.id;
    this.hospitalId = props.hospitalId;
    this.token = props.token;
    this.email = props.email;
    this.expiresAt = props.expiresAt;
    this.usedAt = props.usedAt;
    this.keycloakUserId = props.keycloakUserId;
    this.createdAt = props.createdAt;
  }

  isExpired(): boolean {
    return this.expiresAt < new Date();
  }

  isUsed(): boolean {
    return this.usedAt !== null;
  }

  markUsed(keycloakUserId: string): void {
    if (this.isUsed()) {
      throw new ValidationError('Registration token has already been used');
    }
    this.usedAt = new Date();
    this.keycloakUserId = keycloakUserId;
  }
}
