import { NextRequest } from 'next/server';

const REGULAR_DEPARTMENTS = [
  'Cardiology', 'Oncology', 'Orthopedics', 'Neurology', 'Dermatology',
  'Ophthalmology', 'ENT', 'Urology', 'Gynecology', 'Pediatrics',
  'Gastroenterology', 'Pulmonology', 'Endocrinology', 'Nephrology',
  'Rheumatology', 'Hematology', 'Radiology', 'Psychiatry',
];

const COSMETIC_FALLBACK_SPECIALTIES = [
  'Rhinoplasty',
  'Double Eyelid Surgery',
  'Facelift',
  'Liposuction',
  'Breast Augmentation',
  'Body Contouring',
  'Orthognathic Surgery',
  'Hair Transplant',
  'Dermal Fillers',
  'Botox',
  'Skin Rejuvenation',
  'Scar Revision',
];

function normalizeSpecialties(list: Array<string | null | undefined>): string[] {
  return Array.from(
    new Set(
      list
        .map((item) => item?.trim())
        .filter((item): item is string => Boolean(item)),
    ),
  );
}

export async function GET(request: NextRequest) {
  const type = request.nextUrl.searchParams.get('type');
  if (type === 'REGULAR') return Response.json({ specialties: REGULAR_DEPARTMENTS });
  if (type === 'COSMETIC') {
    const supabaseUrl = process.env.MAIN_SUPABASE_URL;
    const supabaseAnonKey = process.env.MAIN_SUPABASE_ANON_KEY;
    if (!supabaseUrl || !supabaseAnonKey) {
      return Response.json({ specialties: COSMETIC_FALLBACK_SPECIALTIES });
    }

    const res = await fetch(
      `${supabaseUrl}/rest/v1/procedures?select=name&order=category.asc,name.asc`,
      {
        headers: {
          apikey: supabaseAnonKey,
          Authorization: `Bearer ${supabaseAnonKey}`,
        },
        cache: 'no-store',
      },
    );
    if (!res.ok) {
      return Response.json({ specialties: COSMETIC_FALLBACK_SPECIALTIES });
    }

    const procedures = (await res.json()) as Array<{ name?: string }>;
    const specialties = normalizeSpecialties(procedures.map((procedure) => procedure.name));
    if (specialties.length === 0) {
      return Response.json({ specialties: COSMETIC_FALLBACK_SPECIALTIES });
    }
    return Response.json({ specialties });
  }
  return Response.json({ error: 'type parameter required' }, { status: 400 });
}
