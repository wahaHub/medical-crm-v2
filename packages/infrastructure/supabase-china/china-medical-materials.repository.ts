import type { SupabaseClient } from '@supabase/supabase-js';
import type {
  IMaterialsRepository,
  MaterialsHospitalInfo,
  MaterialsProcedure,
  MaterialsSurgeon,
  MaterialsBeforeAfterCase,
} from '@medical-crm/domain';
import { NotFoundError } from '@medical-crm/utils';

/**
 * China Medical Supabase implementation of IMaterialsRepository.
 *
 * Maps between domain types and China Medical Supabase tables:
 * - hospitals + hospital_i18n -> MaterialsHospitalInfo
 * - surgeons -> MaterialsSurgeon
 * - procedure_cases + case_images -> MaterialsBeforeAfterCase
 *
 * NOTE: Regular hospitals do NOT have hospital_procedures/procedures tables.
 * Procedures are stored directly in procedure_cases.procedure_name.
 */
export class ChinaMedicalMaterialsRepository implements IMaterialsRepository {
  constructor(private readonly supabase: SupabaseClient) {}

  // ---------------------------------------------------------------------------
  // Hospital Info
  // ---------------------------------------------------------------------------

  async getHospitalInfo(hospitalId: string): Promise<MaterialsHospitalInfo | null> {
    const { data: hospital, error } = await this.supabase
      .from('hospitals')
      .select('*')
      .eq('id', hospitalId)
      .single();

    if (error) {
      if (error.code === 'PGRST116') return null;
      throw error;
    }

    // Get i18n data (all columns)
    const { data: i18nRows } = await this.supabase
      .from('hospital_i18n')
      .select('*')
      .eq('hospital_id', hospitalId);

    const zhRow = (i18nRows ?? []).find((r: Record<string, unknown>) => r.locale === 'zh') as Record<string, unknown> | undefined;
    const enRow = (i18nRows ?? []).find((r: Record<string, unknown>) => r.locale === 'en') as Record<string, unknown> | undefined;
    const nameRow = zhRow ?? enRow;

    const photos = (hospital.gallery as Array<{ url: string }> | null)?.map(
      (g: { url: string }) => g.url,
    ) ?? [];

    // Extract certifications
    const rawCerts = hospital.certifications as Array<{ name: string; nameEn?: string; year?: number; isActive: boolean }> | null;
    const certifications = (rawCerts ?? []).map((c, idx) => ({
      id: `cert-${idx + 1}`,
      name: c.name,
      nameEn: c.nameEn || c.name,
      year: c.year,
      isActive: c.isActive,
    }));

    // Extract departments_info from i18n
    const departmentsInfo = (zhRow?.departments_info ?? enRow?.departments_info ?? []) as Array<Record<string, unknown>>;
    const departments = departmentsInfo
      .map((d) => (d.department_code || d.department_slug) as string)
      .filter((d): d is string => typeof d === 'string' && d.length > 0);
    const departmentDescriptions: Record<string, string> = {};
    const departmentImages: Record<string, string> = {};
    const departmentKeyServices: Record<string, string[]> = {};
    const departmentStats: Record<string, { specialists?: number; annualPatients?: number }> = {};
    for (const d of departmentsInfo) {
      const code = (d.department_code || d.department_slug) as string;
      if (!code) continue;
      if (typeof d.description === 'string') departmentDescriptions[code] = d.description;
      if (typeof d.image_url === 'string') departmentImages[code] = d.image_url;
      if (Array.isArray(d.key_services)) departmentKeyServices[code] = d.key_services as string[];
      if (d.specialists !== undefined || d.annual_patients !== undefined) {
        departmentStats[code] = {
          specialists: d.specialists as number | undefined,
          annualPatients: d.annual_patients as number | undefined,
        };
      }
    }

    return {
      id: hospital.id,
      name: (nameRow?.display_name ?? nameRow?.name ?? '') as string,
      nameEn: (enRow?.display_name ?? enRow?.name ?? zhRow?.name ?? '') as string,
      slug: hospital.slug,
      heroImage: hospital.hero_image_url ?? null,
      photos,
      highlights: [],
      yearEstablished: hospital.established_year ?? undefined,
      totalPatients: hospital.patients_served_annually ?? undefined,
      tagline: (zhRow?.value_proposition as string) ?? undefined,
      taglineEn: (enRow?.value_proposition as string) ?? undefined,
      description: (zhRow?.short_description as string) ?? (zhRow?.overview as string) ?? undefined,
      descriptionEn: (enRow?.short_description as string) ?? (enRow?.overview as string) ?? undefined,
      status: hospital.is_active ? 'published' : 'draft',
      isActive: hospital.is_active,
      paymentMethods: hospital.payment_methods ?? [],
      address: hospital.address ?? undefined,
      phone: undefined,
      email: hospital.admin_email ?? undefined,
      website: hospital.official_website ?? undefined,
      latitude: hospital.latitude ?? undefined,
      longitude: hospital.longitude ?? undefined,
      certifications,
      bedCount: hospital.bed_count ?? undefined,
      patientCapacity: hospital.staff_count ?? undefined,
      multilingualStaff: hospital.supported_languages ?? [],
      airportServices: hospital.airport_services ?? [],
      followUpCare: hospital.followup_care ?? [],
      amenities: hospital.amenities ?? [],
      nearbyAttractions: [],
      videoTestimonials: hospital.video_testimonials ?? [],
      // Regular hospital specific fields
      city: hospital.city,
      district: hospital.district,
      province: hospital.province,
      hospitalType: (zhRow?.hospital_type as string) ?? (enRow?.hospital_type as string) ?? undefined,
      tier: (zhRow?.tier as string) ?? (enRow?.tier as string) ?? undefined,
      ownershipType: (zhRow?.ownership_type as string) ?? (enRow?.ownership_type as string) ?? undefined,
      clinicalCapabilities: hospital.clinical_capabilities ?? undefined,
      equipment: hospital.equipment ?? undefined,
      gallery: hospital.gallery ?? undefined,
      coreSpecialties: (zhRow?.core_specialties ?? enRow?.core_specialties) as MaterialsHospitalInfo['coreSpecialties'],
      overview: (zhRow?.overview as string) ?? undefined,
      overviewEn: (enRow?.overview as string) ?? undefined,
      fullDescription: (zhRow?.full_description as string) ?? undefined,
      fullDescriptionEn: (enRow?.full_description as string) ?? undefined,
      departments,
      departmentDescriptions,
      departmentImages,
      departmentKeyServices,
      departmentStats,
    };
  }

  async updateHospitalInfo(hospitalId: string, updates: Partial<MaterialsHospitalInfo>): Promise<MaterialsHospitalInfo> {
    // 1. Hospital main table updates
    const hospitalUpdates: Record<string, unknown> = {};
    if (updates.heroImage !== undefined) hospitalUpdates['hero_image_url'] = updates.heroImage;
    if (updates.photos !== undefined) {
      hospitalUpdates['gallery'] = updates.photos.map((url) => ({ url, alt: '', type: 'facade' }));
    }
    if (updates.city !== undefined) hospitalUpdates['city'] = updates.city;
    if (updates.district !== undefined) hospitalUpdates['district'] = updates.district;
    if (updates.province !== undefined) hospitalUpdates['province'] = updates.province;
    if (updates.address !== undefined) hospitalUpdates['address'] = updates.address;
    if (updates.latitude !== undefined) hospitalUpdates['latitude'] = updates.latitude;
    if (updates.longitude !== undefined) hospitalUpdates['longitude'] = updates.longitude;
    if (updates.yearEstablished !== undefined) hospitalUpdates['established_year'] = updates.yearEstablished;
    if (updates.bedCount !== undefined) hospitalUpdates['bed_count'] = updates.bedCount;
    if (updates.totalPatients !== undefined) hospitalUpdates['patients_served_annually'] = updates.totalPatients;
    if (updates.patientCapacity !== undefined) hospitalUpdates['staff_count'] = updates.patientCapacity;
    if (updates.gallery !== undefined) hospitalUpdates['gallery'] = updates.gallery;
    if (updates.multilingualStaff !== undefined) hospitalUpdates['supported_languages'] = updates.multilingualStaff;
    if (updates.airportServices !== undefined) hospitalUpdates['airport_services'] = updates.airportServices;
    if (updates.followUpCare !== undefined) hospitalUpdates['followup_care'] = updates.followUpCare;
    if (updates.amenities !== undefined) hospitalUpdates['amenities'] = updates.amenities;
    if (updates.paymentMethods !== undefined) hospitalUpdates['payment_methods'] = updates.paymentMethods;
    if (updates.clinicalCapabilities !== undefined) hospitalUpdates['clinical_capabilities'] = updates.clinicalCapabilities;
    if (updates.equipment !== undefined) hospitalUpdates['equipment'] = updates.equipment;
    if (updates.certifications !== undefined) hospitalUpdates['certifications'] = updates.certifications;
    if (updates.videoTestimonials !== undefined) hospitalUpdates['video_testimonials'] = updates.videoTestimonials;
    if (updates.website !== undefined) hospitalUpdates['official_website'] = updates.website;
    if (updates.isActive !== undefined) hospitalUpdates['is_active'] = updates.isActive;

    if (Object.keys(hospitalUpdates).length > 0) {
      hospitalUpdates['updated_at'] = new Date().toISOString();
      const { error } = await this.supabase.from('hospitals').update(hospitalUpdates).eq('id', hospitalId);
      if (error) throw error;
    }

    // 2. Update i18n tables (zh + en)
    const zhUpdates: Record<string, unknown> = {};
    const enUpdates: Record<string, unknown> = {};

    if (updates.name !== undefined) { zhUpdates['name'] = updates.name; zhUpdates['display_name'] = updates.name; }
    if (updates.nameEn !== undefined) { enUpdates['name'] = updates.nameEn; enUpdates['display_name'] = updates.nameEn; }
    if (updates.hospitalType !== undefined) { zhUpdates['hospital_type'] = updates.hospitalType; enUpdates['hospital_type'] = updates.hospitalType; }
    if (updates.tier !== undefined) { zhUpdates['tier'] = updates.tier; enUpdates['tier'] = updates.tier; }
    if (updates.ownershipType !== undefined) { zhUpdates['ownership_type'] = updates.ownershipType; enUpdates['ownership_type'] = updates.ownershipType; }
    if (updates.description !== undefined) { zhUpdates['short_description'] = updates.description; if (updates.overview === undefined) zhUpdates['overview'] = updates.description; }
    if (updates.descriptionEn !== undefined) { enUpdates['short_description'] = updates.descriptionEn; if (updates.overviewEn === undefined) enUpdates['overview'] = updates.descriptionEn; }
    if (updates.overview !== undefined) zhUpdates['overview'] = updates.overview;
    if (updates.overviewEn !== undefined) enUpdates['overview'] = updates.overviewEn;
    if (updates.fullDescription !== undefined) zhUpdates['full_description'] = updates.fullDescription;
    if (updates.fullDescriptionEn !== undefined) enUpdates['full_description'] = updates.fullDescriptionEn;
    if (updates.tagline !== undefined) zhUpdates['value_proposition'] = updates.tagline;
    if (updates.taglineEn !== undefined) enUpdates['value_proposition'] = updates.taglineEn;
    if (updates.coreSpecialties !== undefined) { zhUpdates['core_specialties'] = updates.coreSpecialties; enUpdates['core_specialties'] = updates.coreSpecialties; }

    // Handle departments_info
    if (updates.departments !== undefined || updates.departmentDescriptions !== undefined ||
        updates.departmentKeyServices !== undefined || updates.departmentStats !== undefined ||
        updates.departmentImages !== undefined) {
      const depts = updates.departments ?? [];
      const descs = updates.departmentDescriptions ?? {};
      const keyServices = updates.departmentKeyServices ?? {};
      const stats = updates.departmentStats ?? {};
      const images = updates.departmentImages ?? {};
      const deptInfoArray = depts.map((dept) => ({
        department_code: dept,
        department_name: dept,
        description: descs[dept] ?? '',
        image_url: images[dept] ?? '',
        key_services: Array.isArray(keyServices[dept]) ? keyServices[dept] : [],
        specialists: stats[dept]?.specialists ?? null,
        annual_patients: stats[dept]?.annualPatients ?? null,
      }));
      zhUpdates['departments_info'] = deptInfoArray;
      enUpdates['departments_info'] = deptInfoArray;
    }

    if (Object.keys(zhUpdates).length > 0) {
      await this.supabase.from('hospital_i18n').upsert(
        { hospital_id: hospitalId, locale: 'zh', ...zhUpdates },
        { onConflict: 'hospital_id,locale' },
      );
    }
    if (Object.keys(enUpdates).length > 0) {
      await this.supabase.from('hospital_i18n').upsert(
        { hospital_id: hospitalId, locale: 'en', ...enUpdates },
        { onConflict: 'hospital_id,locale' },
      );
    }

    // 3. Return refreshed data
    const result = await this.getHospitalInfo(hospitalId);
    if (!result) throw new NotFoundError(`Hospital ${hospitalId} not found`);
    return result;
  }

  // ---------------------------------------------------------------------------
  // Procedures — regular hospitals don't have a separate procedures system
  // ---------------------------------------------------------------------------

  async listProcedures(_hospitalId: string): Promise<MaterialsProcedure[]> {
    // Regular hospitals don't have hospital_procedures. Return empty.
    return [];
  }

  async createProcedure(_data: Omit<MaterialsProcedure, 'id'>): Promise<MaterialsProcedure> {
    throw new Error('Procedures management is not available for regular hospitals');
  }

  async updateProcedure(_id: string, _hospitalId: string, _data: Partial<MaterialsProcedure>): Promise<MaterialsProcedure> {
    throw new Error('Procedures management is not available for regular hospitals');
  }

  async deleteProcedure(_id: string, _hospitalId: string): Promise<void> {
    throw new Error('Procedures management is not available for regular hospitals');
  }

  // ---------------------------------------------------------------------------
  // Surgeons — both databases have a surgeons table
  // ---------------------------------------------------------------------------

  async listSurgeons(hospitalId: string): Promise<MaterialsSurgeon[]> {
    const { data, error } = await this.supabase
      .from('surgeons')
      .select('id, hospital_id, name, title, image_url, experience_years, specialties, languages')
      .eq('hospital_id', hospitalId);

    if (error) throw error;

    return (data ?? []).map((row) => ({
      id: row.id,
      hospitalId: row.hospital_id ?? hospitalId,
      name: row.name,
      title: row.title,
      imageUrl: row.image_url,
      experienceYears: row.experience_years,
      specialties: row.specialties ?? [],
      languages: row.languages ?? [],
    }));
  }

  async createSurgeon(data: Omit<MaterialsSurgeon, 'id'>): Promise<MaterialsSurgeon> {
    const { data: row, error } = await this.supabase
      .from('surgeons')
      .insert({
        hospital_id: data.hospitalId,
        surgeon_id: data.hospitalId + '-' + Date.now(),
        name: data.name,
        title: data.title,
        image_url: data.imageUrl,
        experience_years: data.experienceYears,
        specialties: data.specialties,
        languages: data.languages,
        education: [],
        certifications: [],
        procedures_count: {},
        bio: {},
        images: {},
        translations: {},
      })
      .select('id, hospital_id, name, title, image_url, experience_years, specialties, languages')
      .single();

    if (error) throw error;

    return {
      id: row!.id,
      hospitalId: row!.hospital_id ?? data.hospitalId,
      name: row!.name,
      title: row!.title,
      imageUrl: row!.image_url,
      experienceYears: row!.experience_years,
      specialties: row!.specialties ?? [],
      languages: row!.languages ?? [],
    };
  }

  async updateSurgeon(id: string, hospitalId: string, updates: Partial<MaterialsSurgeon>): Promise<MaterialsSurgeon> {
    const updateData: Record<string, unknown> = {};
    if (updates.name !== undefined) updateData['name'] = updates.name;
    if (updates.title !== undefined) updateData['title'] = updates.title;
    if (updates.imageUrl !== undefined) updateData['image_url'] = updates.imageUrl;
    if (updates.experienceYears !== undefined) updateData['experience_years'] = updates.experienceYears;
    if (updates.specialties !== undefined) updateData['specialties'] = updates.specialties;
    if (updates.languages !== undefined) updateData['languages'] = updates.languages;
    updateData['updated_at'] = new Date().toISOString();

    const { data: row, error } = await this.supabase
      .from('surgeons')
      .update(updateData)
      .eq('id', id)
      .eq('hospital_id', hospitalId)
      .select('id, hospital_id, name, title, image_url, experience_years, specialties, languages')
      .single();

    if (error) {
      if (error.code === 'PGRST116') throw new NotFoundError(`Surgeon ${id} not found for hospital ${hospitalId}`);
      throw error;
    }
    if (!row) throw new NotFoundError(`Surgeon ${id} not found for hospital ${hospitalId}`);

    return {
      id: row.id,
      hospitalId: row.hospital_id ?? hospitalId,
      name: row.name,
      title: row.title,
      imageUrl: row.image_url,
      experienceYears: row.experience_years,
      specialties: row.specialties ?? [],
      languages: row.languages ?? [],
    };
  }

  async deleteSurgeon(id: string, hospitalId: string): Promise<void> {
    const { error } = await this.supabase
      .from('surgeons')
      .delete()
      .eq('id', id)
      .eq('hospital_id', hospitalId);

    if (error) throw error;
  }

  // ---------------------------------------------------------------------------
  // Before/After Cases
  // ---------------------------------------------------------------------------

  async listBeforeAfterCases(hospitalId: string): Promise<MaterialsBeforeAfterCase[]> {
    const { data, error } = await this.supabase
      .from('procedure_cases')
      .select('id, hospital_id, procedure_name, provider_name, description, case_images(id, image_url, image_type, sort_order)')
      .eq('hospital_id', hospitalId)
      .order('sort_order', { ascending: true });

    if (error) throw error;

    return (data ?? []).map((row: Record<string, unknown>) => {
      const images = (row.case_images as Array<{ image_url: string; image_type: 'before' | 'after' | 'combined'; sort_order: number }>) ?? [];
      images.sort((a, b) => a.sort_order - b.sort_order);

      return {
        id: row.id as string,
        hospitalId: (row.hospital_id as string) ?? hospitalId,
        procedureName: (row.procedure_name as string) ?? '',
        surgeonName: row.provider_name as string | null,
        description: row.description as string | null,
        images: images.map((img) => ({
          url: img.image_url,
          type: img.image_type,
        })),
      };
    });
  }

  async createBeforeAfterCase(data: Omit<MaterialsBeforeAfterCase, 'id'>): Promise<MaterialsBeforeAfterCase> {
    const caseNumber = `CASE-${Date.now()}`;
    const { data: row, error } = await this.supabase
      .from('procedure_cases')
      .insert({
        hospital_id: data.hospitalId,
        procedure_name: data.procedureName,
        provider_name: data.surgeonName,
        description: data.description,
        case_number: caseNumber,
        image_count: data.images.length,
        sort_order: 0,
      })
      .select('id, hospital_id, procedure_name, provider_name, description')
      .single();

    if (error) throw error;

    // Insert case images
    if (data.images.length > 0) {
      const imageRows = data.images.map((img, idx) => ({
        case_id: row!.id,
        image_url: img.url,
        image_type: img.type,
        sort_order: idx,
      }));

      const { error: imgError } = await this.supabase
        .from('case_images')
        .insert(imageRows);

      if (imgError) throw imgError;
    }

    return {
      id: row!.id,
      hospitalId: row!.hospital_id ?? data.hospitalId,
      procedureName: row!.procedure_name ?? data.procedureName,
      surgeonName: row!.provider_name,
      description: row!.description,
      images: data.images,
    };
  }

  async updateBeforeAfterCase(id: string, hospitalId: string, updates: Partial<MaterialsBeforeAfterCase>): Promise<MaterialsBeforeAfterCase> {
    const updateData: Record<string, unknown> = {};
    if (updates.procedureName !== undefined) updateData['procedure_name'] = updates.procedureName;
    if (updates.surgeonName !== undefined) updateData['provider_name'] = updates.surgeonName;
    if (updates.description !== undefined) updateData['description'] = updates.description;
    updateData['updated_at'] = new Date().toISOString();

    const { data: row, error } = await this.supabase
      .from('procedure_cases')
      .update(updateData)
      .eq('id', id)
      .eq('hospital_id', hospitalId)
      .select('id, hospital_id, procedure_name, provider_name, description')
      .single();

    if (error) {
      if (error.code === 'PGRST116') throw new NotFoundError(`Before/After case ${id} not found for hospital ${hospitalId}`);
      throw error;
    }
    if (!row) throw new NotFoundError(`Before/After case ${id} not found for hospital ${hospitalId}`);

    // If images are provided, replace all existing images
    if (updates.images !== undefined) {
      await this.supabase.from('case_images').delete().eq('case_id', id);

      if (updates.images.length > 0) {
        const imageRows = updates.images.map((img, idx) => ({
          case_id: id,
          image_url: img.url,
          image_type: img.type,
          sort_order: idx,
        }));
        const { error: imgError } = await this.supabase.from('case_images').insert(imageRows);
        if (imgError) throw imgError;
      }

      await this.supabase
        .from('procedure_cases')
        .update({ image_count: updates.images.length })
        .eq('id', id)
        .eq('hospital_id', hospitalId);
    }

    // Fetch current images
    let images: Array<{ url: string; type: 'before' | 'after' | 'combined' }>;
    if (updates.images !== undefined) {
      images = updates.images;
    } else {
      const { data: imgData } = await this.supabase
        .from('case_images')
        .select('image_url, image_type, sort_order')
        .eq('case_id', id)
        .order('sort_order', { ascending: true });

      images = (imgData ?? []).map((img) => ({
        url: img.image_url,
        type: img.image_type as 'before' | 'after' | 'combined',
      }));
    }

    return {
      id: row.id,
      hospitalId: row.hospital_id ?? hospitalId,
      procedureName: row.procedure_name ?? '',
      surgeonName: row.provider_name,
      description: row.description,
      images,
    };
  }

  async deleteBeforeAfterCase(id: string, hospitalId: string): Promise<void> {
    const { data: existing } = await this.supabase
      .from('procedure_cases')
      .select('id')
      .eq('id', id)
      .eq('hospital_id', hospitalId)
      .single();

    if (!existing) throw new NotFoundError(`Before/After case ${id} not found for hospital ${hospitalId}`);

    await this.supabase.from('case_images').delete().eq('case_id', id);

    const { error } = await this.supabase
      .from('procedure_cases')
      .delete()
      .eq('id', id)
      .eq('hospital_id', hospitalId);

    if (error) throw error;
  }
}
