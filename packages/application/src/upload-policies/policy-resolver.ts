import type { UploadPolicyId } from './types.js';
import { ValidationError } from '@medical-crm/utils';

const MATERIALS_POLICY_MAP: Record<string, Record<string, UploadPolicyId>> = {
  COSMETIC: {
    hero: 'materials_beauty_hospital_image',
    gallery: 'materials_beauty_hospital_image',
    equipment: 'materials_beauty_hospital_image',
    hospital_video: 'materials_beauty_hospital_video',
    testimonial_video: 'materials_beauty_testimonial_video',
    surgeon: 'materials_beauty_surgeon_image',
    case: 'materials_beauty_case_media',
  },
  REGULAR: {
    hero: 'materials_regular_hospital_image',
    gallery: 'materials_regular_hospital_image',
    equipment: 'materials_regular_hospital_image',
    hospital_video: 'materials_regular_hospital_video',
    testimonial_video: 'materials_regular_testimonial_video',
    surgeon: 'materials_regular_surgeon_image',
    case: 'materials_regular_case_media',
  },
};

export function resolveMaterialsPolicyId(
  hospitalType: 'COSMETIC' | 'REGULAR',
  materialKind: string,
): UploadPolicyId {
  const policyId = MATERIALS_POLICY_MAP[hospitalType]?.[materialKind];
  if (!policyId) {
    throw new ValidationError(
      `Unknown materialKind '${materialKind}' for hospitalType '${hospitalType}'`,
    );
  }
  return policyId;
}
