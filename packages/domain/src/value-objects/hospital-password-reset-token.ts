import { ValidationError } from '@medical-crm/utils';
import { createHash } from 'node:crypto';

export interface HospitalPasswordResetTokenProps {
  id: string;
  userId: string;
  hospitalId: string | null;
  keycloakUserId: string;
  tokenHash: string;
  email: string;
  expiresAt: Date;
  usedAt: Date | null;
  createdAt: Date;
}

export class HospitalPasswordResetToken {
  readonly id: string;
  readonly userId: string;
  readonly hospitalId: string | null;
  readonly keycloakUserId: string;
  readonly tokenHash: string;
  readonly email: string;
  readonly expiresAt: Date;
  usedAt: Date | null;
  readonly createdAt: Date;

  constructor(props: HospitalPasswordResetTokenProps) {
    this.id = props.id;
    this.userId = props.userId;
    this.hospitalId = props.hospitalId;
    this.keycloakUserId = props.keycloakUserId;
    this.tokenHash = props.tokenHash;
    this.email = props.email;
    this.expiresAt = props.expiresAt;
    this.usedAt = props.usedAt;
    this.createdAt = props.createdAt;
  }

  static hashToken(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }

  isExpired(): boolean {
    return this.expiresAt < new Date();
  }

  isUsed(): boolean {
    return this.usedAt !== null;
  }

  markUsed(): void {
    if (this.isUsed()) {
      throw new ValidationError('This password reset link has already been used');
    }
    this.usedAt = new Date();
  }
}
