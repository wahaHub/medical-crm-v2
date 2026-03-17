import { NextRequest } from 'next/server';

const REGULAR_DEPARTMENTS = [
  'Cardiology', 'Oncology', 'Orthopedics', 'Neurology', 'Dermatology',
  'Ophthalmology', 'ENT', 'Urology', 'Gynecology', 'Pediatrics',
  'Gastroenterology', 'Pulmonology', 'Endocrinology', 'Nephrology',
  'Rheumatology', 'Hematology', 'Radiology', 'Psychiatry',
];

export async function GET(request: NextRequest) {
  const type = request.nextUrl.searchParams.get('type');
  if (type === 'REGULAR') return Response.json({ specialties: REGULAR_DEPARTMENTS });
  if (type === 'COSMETIC') {
    // For now, return a static list. Can be enhanced to query Supabase later.
    const cosmeticProcedures = [
      'Rhinoplasty', 'Facelift', 'Blepharoplasty', 'Liposuction', 'Breast Augmentation',
      'Abdominoplasty', 'Botox', 'Dermal Fillers', 'Laser Treatment', 'Hair Transplant',
    ];
    return Response.json({ specialties: cosmeticProcedures });
  }
  return Response.json({ error: 'type parameter required' }, { status: 400 });
}
