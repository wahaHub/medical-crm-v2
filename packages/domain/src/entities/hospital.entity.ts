import type { HospitalStatus, HospitalType } from '../enums/index.js';
import { ValidationError } from '@medical-crm/utils';
import { HOSPITAL_STATUS_TRANSITIONS } from '../state-machine/hospital-status-transitions.js';

export interface HospitalProps {
  id: string;
  name: string;
  nameEn: string;
  address: string | null;
  city: string | null;
  phone: string | null;
  email: string | null;
  description: string | null;
  logoUrl: string | null;
  specialties: string[] | null;
  status: HospitalStatus;
  type: HospitalType;
  createdAt: Date;
  updatedAt: Date;
}

export class Hospital {
  readonly id: string;
  name: string;
  nameEn: string;
  address: string | null;
  city: string | null;
  phone: string | null;
  email: string | null;
  description: string | null;
  logoUrl: string | null;
  specialties: string[] | null;
  status: HospitalStatus;
  type: HospitalType;
  createdAt: Date;
  updatedAt: Date;

  constructor(props: HospitalProps) {
    this.id = props.id;
    this.name = props.name;
    this.nameEn = props.nameEn;
    this.address = props.address;
    this.city = props.city;
    this.phone = props.phone;
    this.email = props.email;
    this.description = props.description;
    this.logoUrl = props.logoUrl;
    this.specialties = props.specialties;
    this.status = props.status;
    this.type = props.type;
    this.createdAt = props.createdAt;
    this.updatedAt = props.updatedAt;
  }

  activate(): void {
    if (!HOSPITAL_STATUS_TRANSITIONS[this.status].includes('ACTIVE')) {
      throw new ValidationError(
        `Cannot activate hospital from status ${this.status}`,
      );
    }
    this.status = 'ACTIVE';
    this.updatedAt = new Date();
  }

  deactivate(): void {
    if (!HOSPITAL_STATUS_TRANSITIONS[this.status].includes('INACTIVE')) {
      throw new ValidationError(
        `Cannot deactivate hospital from status ${this.status}`,
      );
    }
    this.status = 'INACTIVE';
    this.updatedAt = new Date();
  }
}
