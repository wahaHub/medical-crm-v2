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
    const supabaseUrl = process.env.MAIN_SUPABASE_URL;
    const supabaseAnonKey = process.env.MAIN_SUPABASE_ANON_KEY;
    if (!supabaseUrl || !supabaseAnonKey) {
      return Response.json({ specialties: [] });
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
      return Response.json({ specialties: [] });
    }

    const procedures = (await res.json()) as Array<{ name?: string }>;
    const specialties = Array.from(
      new Set(
        procedures
          .map((procedure) => procedure.name?.trim())
          .filter((name): name is string => Boolean(name)),
      ),
    );
    return Response.json({ specialties });
  }
  return Response.json({ error: 'type parameter required' }, { status: 400 });
}
