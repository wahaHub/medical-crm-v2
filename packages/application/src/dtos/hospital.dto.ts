import type { HospitalStatus, HospitalType } from '@medical-crm/domain';

export interface HospitalDTO {
  id: string;
  name: string;
  nameEn: string | null;
  address: string | null;
  phone: string | null;
  email: string | null;
  description: string | null;
  logoUrl: string | null;
  specialties: string[] | null;
  status: HospitalStatus;
  type: HospitalType;
  createdAt: string;
  updatedAt: string;
}
