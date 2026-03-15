import type { HospitalStatus } from '../enums/index.js';

export const HOSPITAL_STATUS_TRANSITIONS: Record<HospitalStatus, HospitalStatus[]> = {
  PENDING: ['ACTIVE'],
  ACTIVE: ['INACTIVE'],
  INACTIVE: ['ACTIVE'],
};
