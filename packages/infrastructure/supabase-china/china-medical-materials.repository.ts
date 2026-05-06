import { randomUUID } from 'node:crypto';
import type { SupabaseClient } from '@supabase/supabase-js';
import type {
  IMaterialsRepository,
  IStorageService,
  MaterialsHospitalInfo,
  MaterialsProcedure,
  MaterialsSurgeon,
  MaterialsBeforeAfterCase,
} from '@medical-crm/domain';
import { ConflictError, NotFoundError } from '@medical-crm/utils';
import {
  buildSurgeonMutation,
  mapCaseAssetsToImages,
  mapCaseAssetsToMedia,
  mapSurgeonRowToMaterialsSurgeon,
  slugifyProcedureName,
  shouldIgnoreCaseMediaError,
} from '../services/materials-compat.js';
import { resolveMediaRef, resolveMediaRefs } from '../services/materials-media.js';

/**
 * China Medical Supabase implementation of IMaterialsRepository.
 *
 * Maps between domain types and China Medical Supabase tables:
 * - hospitals + hospital_i18n -> MaterialsHospitalInfo
 * - surgeons -> MaterialsSurgeon
 * - procedure_cases + case_media -> MaterialsBeforeAfterCase
 *
 * NOTE: Regular hospitals do NOT have hospital_procedures/procedures tables.
 * Procedures are stored directly in procedure_cases.procedure_name.
 */
export class ChinaMedicalMaterialsRepository implements IMaterialsRepository {
  constructor(
    private readonly supabase: SupabaseClient,
    private readonly storage?: IStorageService,
  ) {}

  // ---------------------------------------------------------------------------
  // Hospital Info
  // ---------------------------------------------------------------------------

  private async resolveSurgeon(row: {
    id: string;
    hospital_id?: string | null;
    name: string;
    title?: string | null;
    image_url?: string | null;
    experience_years?: number | null;
    specialties?: string[] | null;
    languages?: string[] | null;
    education?: string[] | null;
    certifications?: string[] | null;
    bio?: Record<string, unknown> | null;
    images?: Record<string, unknown> | null;
  }, hospitalId: string): Promise<MaterialsSurgeon> {
    const surgeon = mapSurgeonRowToMaterialsSurgeon(row, hospitalId);
    const resolvedImage = await resolveMediaRef(surgeon.imageUrl, this.storage);
    return {
      ...surgeon,
      imageUrl: resolvedImage.url || null,
    };
  }

  private buildHospitalTranslations(
    rows: Array<Record<string, unknown>> | null | undefined,
  ): Record<string, Record<string, unknown>> {
    const translations: Record<string, Record<string, unknown>> = {};

    for (const row of rows ?? []) {
      const locale = row.locale;
      if (typeof locale !== 'string' || locale.length === 0) continue;

      const fields: Record<string, unknown> = {};
      if (row.name !== undefined && row.name !== null) fields.name = row.name;
      if (row.display_name !== undefined && row.display_name !== null) fields.display_name = row.display_name;
      if (row.value_proposition !== undefined && row.value_proposition !== null) fields.tagline = row.value_proposition;
      if (row.short_description !== undefined && row.short_description !== null) fields.description = row.short_description;
      if (row.overview !== undefined && row.overview !== null) fields.overview = row.overview;
      if (row.full_description !== undefined && row.full_description !== null) fields.full_description = row.full_description;
      if (row.hospital_type !== undefined && row.hospital_type !== null) fields.hospital_type = row.hospital_type;
      if (row.tier !== undefined && row.tier !== null) fields.tier = row.tier;
      if (row.ownership_type !== undefined && row.ownership_type !== null) fields.ownership_type = row.ownership_type;
      if (row.core_specialties !== undefined && row.core_specialties !== null) fields.core_specialties = row.core_specialties;
      if (row.departments_info !== undefined && row.departments_info !== null) fields.departments_info = row.departments_info;

      if (Object.keys(fields).length > 0) {
        translations[locale] = fields;
      }
    }

    return translations;
  }

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

    // Get i18n data and nearby attractions
    const [i18nResult, nearbyResult] = await Promise.all([
      this.supabase.from('hospital_i18n').select('*').eq('hospital_id', hospitalId),
      this.supabase.from('hospital_nearby_attractions').select('*').eq('hospital_id', hospitalId).order('sort_order', { ascending: true }),
    ]);
    const i18nRows = i18nResult.data;
    const nearbyAttractions = nearbyResult.data ?? [];

    const zhRow = (i18nRows ?? []).find((r: Record<string, unknown>) => r.locale === 'zh') as Record<string, unknown> | undefined;
    const enRow = (i18nRows ?? []).find((r: Record<string, unknown>) => r.locale === 'en') as Record<string, unknown> | undefined;
    const nameRow = zhRow ?? enRow;
    const facilitiesInfo = ((zhRow?.facilities_info ?? enRow?.facilities_info) as Record<string, unknown> | undefined) ?? {};

    const rawPhotos = (hospital.gallery as Array<{ url: string }> | null)?.map(
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
    const rawDepartmentImages: Record<string, string> = {};
    const departmentKeyServices: Record<string, string[]> = {};
    const departmentStats: Record<string, { specialists?: number; annualPatients?: number }> = {};
    for (const d of departmentsInfo) {
      const code = (d.department_code || d.department_slug) as string;
      if (!code) continue;
      if (typeof d.description === 'string') departmentDescriptions[code] = d.description;
      if (typeof d.image_url === 'string') rawDepartmentImages[code] = d.image_url;
      if (Array.isArray(d.key_services)) departmentKeyServices[code] = d.key_services as string[];
      if (d.specialists !== undefined || d.annual_patients !== undefined) {
        departmentStats[code] = {
          specialists: d.specialists as number | undefined,
          annualPatients: d.annual_patients as number | undefined,
        };
      }
    }
    const heroImage = await resolveMediaRef(hospital.hero_image_url ?? null, this.storage);
    const photos = await resolveMediaRefs(rawPhotos, this.storage);
    const departmentImageEntries = await resolveMediaRefs(Object.values(rawDepartmentImages), this.storage);
    const departmentImages: Record<string, string> = {};
    const departmentImageStorageKeys: Record<string, string> = {};
    Object.keys(rawDepartmentImages).forEach((code, index) => {
      const resolved = departmentImageEntries[index];
      if (!resolved || !resolved.url) return;
      departmentImages[code] = resolved.url;
      if (resolved.storageKey) departmentImageStorageKeys[code] = resolved.storageKey;
    });
    const rawEquipment = (hospital.equipment as MaterialsHospitalInfo['equipment']) ?? [];
    const equipmentImageEntries = await resolveMediaRefs(
      rawEquipment.map((item) => item.image_url),
      this.storage,
    );
    const rawPromotionalVideos = (
      (facilitiesInfo['promotionalVideos'] as string[] | undefined)
      ?? ((hospital as Record<string, unknown>)['promotional_videos'] as string[] | undefined)
      ?? []
    );
    const promotionalVideos = await resolveMediaRefs(rawPromotionalVideos, this.storage);
    const rawVideoTestimonials = (
      (facilitiesInfo['videoTestimonials'] as MaterialsHospitalInfo['videoTestimonials'] | undefined)
      ?? ((hospital as Record<string, unknown>)['video_testimonials'] as MaterialsHospitalInfo['videoTestimonials'] | undefined)
      ?? []
    );
    const testimonialVideoUrls = await resolveMediaRefs(
      rawVideoTestimonials.map((item) => item.videoUrl),
      this.storage,
    );
    const testimonialThumbnailUrls = await resolveMediaRefs(
      rawVideoTestimonials.map((item) => item.thumbnailUrl),
      this.storage,
    );

    return {
      id: hospital.id,
      name: (nameRow?.display_name ?? nameRow?.name ?? '') as string,
      nameEn: (enRow?.display_name ?? enRow?.name ?? zhRow?.name ?? '') as string,
      slug: hospital.slug,
      heroImage: heroImage.url || null,
      heroImageStorageKey: heroImage.storageKey,
      photos: photos.map((item) => item.url),
      photoStorageKeys: photos.map((item) => item.storageKey),
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
      phone: hospital.phone ?? undefined,
      email: hospital.admin_email ?? undefined,
      website: hospital.official_website ?? undefined,
      hours: (facilitiesInfo['operatingHours'] as string | undefined) ?? (facilitiesInfo['hours'] as string | undefined) ?? undefined,
      operatingHours: (facilitiesInfo['operatingHours'] as string | undefined) ?? (facilitiesInfo['hours'] as string | undefined) ?? undefined,
      latitude: hospital.latitude ?? undefined,
      longitude: hospital.longitude ?? undefined,
      certifications,
      bedCount: hospital.bed_count ?? undefined,
      patientCapacity: hospital.staff_count ?? undefined,
      multilingualStaff: hospital.supported_languages ?? [],
      airportServices: hospital.airport_services ?? [],
      followUpCare: hospital.followup_care ?? [],
      amenities: hospital.amenities ?? [],
      nearbyAttractions: (nearbyAttractions ?? []).map((a: Record<string, unknown>) => ({
        id: String(a.id ?? ''),
        name: String(a.name_zh ?? a.name ?? ''),
        nameEn: String(a.name ?? ''),
        distance: String(a.distance ?? ''),
      })),
      // Regular hospital specific fields
      city: hospital.city,
      district: hospital.district,
      province: hospital.province,
      hospitalType: (zhRow?.hospital_type as string) ?? (enRow?.hospital_type as string) ?? undefined,
      tier: (zhRow?.tier as string) ?? (enRow?.tier as string) ?? undefined,
      ownershipType: (zhRow?.ownership_type as string) ?? (enRow?.ownership_type as string) ?? undefined,
      clinicalCapabilities: hospital.clinical_capabilities ?? undefined,
      equipment: rawEquipment.map((item, index) => ({
        ...item,
        image_url: equipmentImageEntries[index]?.url || item.image_url,
        imageStorageKey: equipmentImageEntries[index]?.storageKey ?? null,
      })),
      gallery: hospital.gallery ?? undefined,
      coreSpecialties: (zhRow?.core_specialties ?? enRow?.core_specialties) as MaterialsHospitalInfo['coreSpecialties'],
      overview: (zhRow?.overview as string) ?? undefined,
      overviewEn: (enRow?.overview as string) ?? undefined,
      fullDescription: (zhRow?.full_description as string) ?? undefined,
      fullDescriptionEn: (enRow?.full_description as string) ?? undefined,
      departments,
      departmentDescriptions,
      departmentImages,
      departmentImageStorageKeys,
      departmentKeyServices,
      departmentStats,
      promotionalVideos: promotionalVideos.map((item) => item.url),
      promotionalVideoStorageKeys: promotionalVideos.map((item) => item.storageKey),
      videoTestimonials: rawVideoTestimonials.map((item, index) => ({
        ...item,
        videoUrl: testimonialVideoUrls[index]?.url ?? item.videoUrl,
        videoStorageKey: testimonialVideoUrls[index]?.storageKey ?? null,
        thumbnailUrl: testimonialThumbnailUrls[index]?.url || item.thumbnailUrl,
        thumbnailStorageKey: testimonialThumbnailUrls[index]?.storageKey ?? null,
      })),
      translations: this.buildHospitalTranslations(i18nRows as Array<Record<string, unknown>> | null | undefined),
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
    if (updates.website !== undefined) hospitalUpdates['official_website'] = updates.website;
    if (updates.phone !== undefined) hospitalUpdates['phone'] = updates.phone;
    if (updates.email !== undefined) hospitalUpdates['admin_email'] = updates.email;
    if (updates.isActive !== undefined) hospitalUpdates['is_active'] = updates.isActive;

    if (Object.keys(hospitalUpdates).length > 0) {
      hospitalUpdates['updated_at'] = new Date().toISOString();
      const { error } = await this.supabase.from('hospitals').update(hospitalUpdates).eq('id', hospitalId);
      if (error) throw error;
    }

    // 2. Update i18n tables (zh + en)
    const zhUpdates: Record<string, unknown> = {};
    const enUpdates: Record<string, unknown> = {};
    let existingZhFacilitiesInfo: Record<string, unknown> = {};
    let existingEnFacilitiesInfo: Record<string, unknown> = {};

    if (
      updates.promotionalVideos !== undefined
      || updates.videoTestimonials !== undefined
      || updates.operatingHours !== undefined
      || updates.hours !== undefined
    ) {
      const { data: existingI18nRows, error: existingI18nError } = await this.supabase
        .from('hospital_i18n')
        .select('locale, facilities_info')
        .eq('hospital_id', hospitalId)
        .in('locale', ['zh', 'en']);

      if (existingI18nError) throw existingI18nError;

      const existingZhRow = (existingI18nRows ?? []).find((row: Record<string, unknown>) => row.locale === 'zh') as Record<string, unknown> | undefined;
      const existingEnRow = (existingI18nRows ?? []).find((row: Record<string, unknown>) => row.locale === 'en') as Record<string, unknown> | undefined;
      existingZhFacilitiesInfo = (existingZhRow?.facilities_info as Record<string, unknown> | undefined) ?? {};
      existingEnFacilitiesInfo = (existingEnRow?.facilities_info as Record<string, unknown> | undefined) ?? {};
    }

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
    if (
      updates.promotionalVideos !== undefined
      || updates.videoTestimonials !== undefined
      || updates.operatingHours !== undefined
      || updates.hours !== undefined
    ) {
      const nextOperatingHours = updates.operatingHours ?? updates.hours;
      zhUpdates['facilities_info'] = {
        ...existingZhFacilitiesInfo,
        ...(updates.promotionalVideos !== undefined ? { promotionalVideos: updates.promotionalVideos } : {}),
        ...(updates.videoTestimonials !== undefined ? { videoTestimonials: updates.videoTestimonials } : {}),
        ...(nextOperatingHours !== undefined ? { operatingHours: nextOperatingHours } : {}),
      };
      enUpdates['facilities_info'] = {
        ...existingEnFacilitiesInfo,
        ...(updates.promotionalVideos !== undefined ? { promotionalVideos: updates.promotionalVideos } : {}),
        ...(updates.videoTestimonials !== undefined ? { videoTestimonials: updates.videoTestimonials } : {}),
        ...(nextOperatingHours !== undefined ? { operatingHours: nextOperatingHours } : {}),
      };
    }

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
    }

    if (Object.keys(zhUpdates).length > 0) {
      const { error } = await this.supabase.from('hospital_i18n').upsert(
        { hospital_id: hospitalId, locale: 'zh', ...zhUpdates },
        { onConflict: 'hospital_id,locale' },
      );
      if (error) throw error;
    }
    if (Object.keys(enUpdates).length > 0) {
      const { error } = await this.supabase.from('hospital_i18n').upsert(
        { hospital_id: hospitalId, locale: 'en', ...enUpdates },
        { onConflict: 'hospital_id,locale' },
      );
      if (error) throw error;
    }

    // 3. Update nearby attractions
    if (updates.nearbyAttractions !== undefined) {
      const { error: deleteError } = await this.supabase
        .from('hospital_nearby_attractions')
        .delete()
        .eq('hospital_id', hospitalId);
      if (deleteError) throw deleteError;

      const nextAttractions = updates.nearbyAttractions
        .map((a) => ({
          ...a,
          name: a.name?.trim() ?? '',
          nameEn: a.nameEn?.trim() ?? undefined,
          distance: a.distance?.trim() ?? '',
        }))
        .filter((a) => a.name.length > 0 && a.distance.length > 0);

      if (nextAttractions.length > 0) {
        const rows = nextAttractions.map((a, idx) => ({
          hospital_id: hospitalId,
          name: a.nameEn || a.name || '',
          name_zh: a.name || null,
          distance: a.distance || '',
          sort_order: idx + 1,
        }));
        const { error: insertError } = await this.supabase.from('hospital_nearby_attractions').insert(rows);
        if (insertError) throw insertError;
      }
    }

    // 4. Return refreshed data
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
      .select('id, hospital_id, name, title, image_url, experience_years, specialties, languages, education, certifications, bio, images, translations')
      .eq('hospital_id', hospitalId);

    if (error) throw error;

    return Promise.all((data ?? []).map((row) => this.resolveSurgeon(row, hospitalId)));
  }

  async createSurgeon(data: Omit<MaterialsSurgeon, 'id'>): Promise<MaterialsSurgeon> {
    const { data: row, error } = await this.supabase
      .from('surgeons')
      .insert({
        hospital_id: data.hospitalId,
        surgeon_id: data.hospitalId + '-' + Date.now(),
        ...buildSurgeonMutation(data),
        procedures_count: {},
        translations: {},
      })
      .select('id, hospital_id, name, title, image_url, experience_years, specialties, languages, education, certifications, bio, images, translations')
      .single();

    if (error) throw error;

    return this.resolveSurgeon(row!, data.hospitalId);
  }

  async updateSurgeon(id: string, hospitalId: string, updates: Partial<MaterialsSurgeon>): Promise<MaterialsSurgeon> {
    const requiresProfileMerge = updates.imageUrl !== undefined
      || updates.intro !== undefined
      || updates.expertise !== undefined
      || updates.philosophy !== undefined
      || updates.achievements !== undefined;
    let existingProfile: { bio?: Record<string, unknown>; images?: Record<string, unknown> } | undefined;
    if (requiresProfileMerge) {
      const { data: existing } = await this.supabase
        .from('surgeons')
        .select('bio, images')
        .eq('id', id)
        .eq('hospital_id', hospitalId)
        .single();
      existingProfile = existing ?? undefined;
    }

    const updateData = buildSurgeonMutation(updates, existingProfile);
    updateData['updated_at'] = new Date().toISOString();

    const { data: row, error } = await this.supabase
      .from('surgeons')
      .update(updateData)
      .eq('id', id)
      .eq('hospital_id', hospitalId)
      .select('id, hospital_id, name, title, image_url, experience_years, specialties, languages, education, certifications, bio, images, translations')
      .single();

    if (error) {
      if (error.code === 'PGRST116') throw new NotFoundError(`Surgeon ${id} not found for hospital ${hospitalId}`);
      throw error;
    }
    if (!row) throw new NotFoundError(`Surgeon ${id} not found for hospital ${hospitalId}`);

    return this.resolveSurgeon(row, hospitalId);
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
      .select('id, hospital_id, procedure_name, case_number, provider_name, description, translations')
      .eq('hospital_id', hospitalId)
      .order('sort_order', { ascending: true });

    if (error) throw error;

    const rows = (data ?? []) as Array<Record<string, unknown>>;
    const caseIds = rows.map((row) => row.id).filter((id): id is string => typeof id === 'string');

    const [caseImagesResult, caseMediaResult] = await Promise.all([
      caseIds.length > 0
        ? this.supabase.from('case_images').select('case_id, image_url, image_type, sort_order').in('case_id', caseIds).order('sort_order', { ascending: true })
        : Promise.resolve({ data: [], error: null }),
      caseIds.length > 0
        ? this.supabase.from('case_media').select('case_id, media_url, media_type, thumbnail_url, sort_order').in('case_id', caseIds).order('sort_order', { ascending: true })
        : Promise.resolve({ data: [], error: null }),
    ]);

    if (caseImagesResult.error && !shouldIgnoreCaseMediaError(caseImagesResult.error)) {
      throw caseImagesResult.error;
    }
    if (caseMediaResult.error && !shouldIgnoreCaseMediaError(caseMediaResult.error)) {
      throw caseMediaResult.error;
    }

    const caseImagesById = new Map<string, Array<{ image_url: string; image_type?: 'before' | 'after' | 'combined' | null; sort_order?: number | null }>>();
    for (const imageRow of (caseImagesResult.data ?? [])) {
      const images = caseImagesById.get(imageRow.case_id) ?? [];
      images.push(imageRow);
      caseImagesById.set(imageRow.case_id, images);
    }
    const caseMediaById = new Map<string, Array<{ media_url?: string | null; media_type?: string | null; thumbnail_url?: string | null; sort_order?: number | null }>>();
    for (const mediaRow of (caseMediaResult.data ?? [])) {
      const media = caseMediaById.get(mediaRow.case_id) ?? [];
      media.push(mediaRow);
      caseMediaById.set(mediaRow.case_id, media);
    }

    return rows.map((row) => {
      const procedureName = (row.procedure_name as string) ?? '';
      return {
        id: row.id as string,
        hospitalId: (row.hospital_id as string) ?? hospitalId,
        procedureName,
        surgeonName: row.provider_name as string | null,
        description: row.description as string | null,
        translations: (row.translations as Record<string, Record<string, unknown>> | null) ?? {},
        images: mapCaseAssetsToImages({
          caseRow: row,
          caseImages: caseImagesById.get(row.id as string) ?? [],
          caseMedia: caseMediaById.get(row.id as string) ?? [],
          procedureSlug: procedureName ? slugifyProcedureName(procedureName) : null,
          caseNumber: row.case_number as string | null,
          hospitalId,
          isRegularHospital: true,
        }),
        media: mapCaseAssetsToMedia({
          caseRow: row,
          caseImages: caseImagesById.get(row.id as string) ?? [],
          caseMedia: caseMediaById.get(row.id as string) ?? [],
          procedureSlug: procedureName ? slugifyProcedureName(procedureName) : null,
          caseNumber: row.case_number as string | null,
          hospitalId,
          isRegularHospital: true,
        }),
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
        translations: {},
      })
      .select('id, hospital_id, procedure_name, provider_name, description, translations')
      .single();

    if (error) throw error;

    // Regular hospitals store case photos in case_media, not case_images.
    const media = data.media ?? data.images.map((image) => ({ type: 'image' as const, url: image.url, thumbnailUrl: null }));
    if (media.length > 0) {
      const mediaRows = media.map((item, idx) => ({
        case_id: row!.id,
        media_url: item.url,
        media_type: item.type,
        thumbnail_url: item.thumbnailUrl ?? null,
        sort_order: idx,
      }));

      const { error: imgError } = await this.supabase
        .from('case_media')
        .insert(mediaRows);

      if (imgError) throw imgError;
    }

    return {
      id: row!.id,
      hospitalId: row!.hospital_id ?? data.hospitalId,
      procedureName: row!.procedure_name ?? data.procedureName,
      surgeonName: row!.provider_name,
      description: row!.description,
      images: data.images,
      media,
      translations: (row!.translations as Record<string, Record<string, unknown>> | null) ?? {},
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
      .select('id, hospital_id, procedure_name, provider_name, description, translations')
      .single();

    if (error) {
      if (error.code === 'PGRST116') throw new NotFoundError(`Before/After case ${id} not found for hospital ${hospitalId}`);
      throw error;
    }
    if (!row) throw new NotFoundError(`Before/After case ${id} not found for hospital ${hospitalId}`);

    const nextMedia = updates.media ?? updates.images?.map((image) => ({ type: 'image' as const, url: image.url, thumbnailUrl: null }));
    if (nextMedia !== undefined) {
      const { error: deleteMediaError } = await this.supabase
        .from('case_media')
        .delete()
        .eq('case_id', id);
      if (deleteMediaError && (updates.media !== undefined || !shouldIgnoreCaseMediaError(deleteMediaError))) {
        throw deleteMediaError;
      }

      if (nextMedia.length > 0) {
        const mediaRows = nextMedia.map((item, idx) => ({
          case_id: id,
          media_url: item.url,
          media_type: item.type,
          thumbnail_url: item.thumbnailUrl ?? null,
          sort_order: idx,
        }));
        const { error: imgError } = await this.supabase.from('case_media').insert(mediaRows);
        if (imgError) throw imgError;
      }

      await this.supabase
        .from('procedure_cases')
        .update({ image_count: nextMedia.filter((item) => item.type === 'image').length })
        .eq('id', id)
        .eq('hospital_id', hospitalId);
    }

    // Fetch current images
    let images: Array<{ url: string }>;
    let media;
    if (nextMedia !== undefined) {
      media = nextMedia;
      images = nextMedia.filter((item) => item.type === 'image').map((item) => ({ url: item.url }));
    } else {
      const { data: mediaData, error: mediaError } = await this.supabase
        .from('case_media')
        .select('media_url, media_type, thumbnail_url, sort_order')
        .eq('case_id', id)
        .order('sort_order', { ascending: true });
      if (mediaError && !shouldIgnoreCaseMediaError(mediaError)) throw mediaError;

      media = mapCaseAssetsToMedia({ caseMedia: mediaData ?? [], isRegularHospital: true });
      images = media
        .filter((item) => item.type === 'image')
        .map((item) => ({
          url: item.url,
        }))
        .filter((item) => item.url.length > 0);
    }

    return {
      id: row.id,
      hospitalId: row.hospital_id ?? hospitalId,
      procedureName: row.procedure_name ?? '',
      surgeonName: row.provider_name,
      description: row.description,
      images,
      media,
      translations: (row.translations as Record<string, Record<string, unknown>> | null) ?? {},
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

    const { error: deleteMediaError } = await this.supabase
      .from('case_media')
      .delete()
      .eq('case_id', id);
    if (deleteMediaError && !shouldIgnoreCaseMediaError(deleteMediaError)) {
      throw deleteMediaError;
    }

    const { error } = await this.supabase
      .from('procedure_cases')
      .delete()
      .eq('id', id)
      .eq('hospital_id', hospitalId);

    if (error) throw error;
  }

  // ---------------------------------------------------------------------------
  // Reviews
  // ---------------------------------------------------------------------------

  async listReviews(hospitalId: string): ReturnType<IMaterialsRepository['listReviews']> {
    const { data, error } = await this.supabase
      .from('hospital_material_reviews')
      .select('id, hospital_id, sort_order, is_active, featured, patient_name, patient_country, patient_avatar_url, treatment_name, review_title, review_comment, rating, review_date, media, translations')
      .eq('hospital_id', hospitalId)
      .order('sort_order', { ascending: true })
      .order('created_at', { ascending: true });

    if (error) throw error;

    return Promise.all((data ?? []).map((row) => this.mapMaterialsReviewRow(row)));
  }

  async createReview(
    data: Parameters<IMaterialsRepository['createReview']>[0],
  ): ReturnType<IMaterialsRepository['createReview']> {
    const { data: row, error } = await this.supabase
      .from('hospital_material_reviews')
      .insert({
        hospital_id: data.hospitalId,
        sort_order: data.sortOrder,
        is_active: data.isActive,
        featured: data.featured,
        patient_name: data.patientName,
        patient_country: data.patientCountry,
        patient_avatar_url: data.patientAvatarStorageKey ?? data.patientAvatarUrl,
        treatment_name: data.treatmentName,
        review_title: data.reviewTitle,
        review_comment: data.reviewComment,
        rating: data.rating,
        review_date: data.reviewDate,
        media: this.normalizeReviewMedia(data.media),
        translations: data.translations ?? {},
      })
      .select('id, hospital_id, sort_order, is_active, featured, patient_name, patient_country, patient_avatar_url, treatment_name, review_title, review_comment, rating, review_date, media, translations')
      .single();

    if (error) throw error;

    return this.mapMaterialsReviewRow(row);
  }

  async updateReview(
    id: string,
    hospitalId: string,
    updates: Parameters<IMaterialsRepository['updateReview']>[2],
  ): ReturnType<IMaterialsRepository['updateReview']> {
    const updateData: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (updates.sortOrder !== undefined) updateData['sort_order'] = updates.sortOrder;
    if (updates.isActive !== undefined) updateData['is_active'] = updates.isActive;
    if (updates.featured !== undefined) updateData['featured'] = updates.featured;
    if (updates.patientName !== undefined) updateData['patient_name'] = updates.patientName;
    if (updates.patientCountry !== undefined) updateData['patient_country'] = updates.patientCountry;
    if (updates.patientAvatarUrl !== undefined || updates.patientAvatarStorageKey !== undefined) {
      updateData['patient_avatar_url'] = updates.patientAvatarStorageKey ?? updates.patientAvatarUrl;
    }
    if (updates.treatmentName !== undefined) updateData['treatment_name'] = updates.treatmentName;
    if (updates.reviewTitle !== undefined) updateData['review_title'] = updates.reviewTitle;
    if (updates.reviewComment !== undefined) updateData['review_comment'] = updates.reviewComment;
    if (updates.rating !== undefined) updateData['rating'] = updates.rating;
    if (updates.reviewDate !== undefined) updateData['review_date'] = updates.reviewDate;
    if (updates.media !== undefined) updateData['media'] = this.normalizeReviewMedia(updates.media);
    if (updates.translations !== undefined) updateData['translations'] = updates.translations;

    const { data: row, error } = await this.supabase
      .from('hospital_material_reviews')
      .update(updateData)
      .eq('id', id)
      .eq('hospital_id', hospitalId)
      .select('id, hospital_id, sort_order, is_active, featured, patient_name, patient_country, patient_avatar_url, treatment_name, review_title, review_comment, rating, review_date, media, translations')
      .single();

    if (error) {
      if (error.code === 'PGRST116') throw new NotFoundError(`Review ${id} not found for hospital ${hospitalId}`);
      throw error;
    }
    if (!row) throw new NotFoundError(`Review ${id} not found for hospital ${hospitalId}`);

    return this.mapMaterialsReviewRow(row);
  }

  async deleteReview(id: string, hospitalId: string): Promise<void> {
    const { error } = await this.supabase
      .from('hospital_material_reviews')
      .delete()
      .eq('id', id)
      .eq('hospital_id', hospitalId);

    if (error) throw error;
  }

  // ---------------------------------------------------------------------------
  // Packages
  // ---------------------------------------------------------------------------

  async listPackages(hospitalId: string): ReturnType<IMaterialsRepository['listPackages']> {
    const { data, error } = await this.supabase
      .from('hospital_material_packages')
      .select('id, hospital_id, slug, sort_order, is_active, title, subtitle, cover_image_url, gallery, price, currency, duration, summary, tags, includes, process, cases, reviews, translations')
      .eq('hospital_id', hospitalId)
      .order('sort_order', { ascending: true })
      .order('created_at', { ascending: true });

    if (error) throw error;

    return Promise.all((data ?? []).map((row) => this.mapMaterialsPackageRow(row)));
  }

  async getPackage(id: string, hospitalId: string): ReturnType<IMaterialsRepository['getPackage']> {
    const { data, error } = await this.supabase
      .from('hospital_material_packages')
      .select('id, hospital_id, slug, sort_order, is_active, title, subtitle, cover_image_url, gallery, price, currency, duration, summary, tags, includes, process, cases, reviews, translations')
      .eq('id', id)
      .eq('hospital_id', hospitalId)
      .single();

    if (error) {
      if (error.code === 'PGRST116') return null;
      throw error;
    }

    return data ? this.mapMaterialsPackageRow(data) : null;
  }

  async createPackage(
    data: Parameters<IMaterialsRepository['createPackage']>[0],
  ): ReturnType<IMaterialsRepository['createPackage']> {
    const { data: row, error } = await this.supabase
      .from('hospital_material_packages')
      .insert({
        hospital_id: data.hospitalId,
        slug: data.slug,
        sort_order: data.sortOrder,
        is_active: data.isActive,
        title: data.title,
        subtitle: data.subtitle,
        cover_image_url: data.coverImageStorageKey ?? data.coverImageUrl,
        gallery: this.normalizePackageGallery(data.gallery),
        price: data.price,
        currency: data.currency,
        duration: data.duration,
        summary: data.summary,
        tags: this.normalizePackageTags(data.tags),
        includes: this.normalizePackageIncludes(data.includes),
        process: this.normalizePackageProcess(data.process),
        cases: this.normalizePackageCases(data.cases),
        reviews: this.normalizePackageReviews(data.reviews),
        translations: data.translations ?? {},
      })
      .select('id, hospital_id, slug, sort_order, is_active, title, subtitle, cover_image_url, gallery, price, currency, duration, summary, tags, includes, process, cases, reviews, translations')
      .single();

    this.throwPackageSlugConflict(error);
    if (error) throw error;

    return this.mapMaterialsPackageRow(row);
  }

  async updatePackage(
    id: string,
    hospitalId: string,
    updates: Parameters<IMaterialsRepository['updatePackage']>[2],
  ): ReturnType<IMaterialsRepository['updatePackage']> {
    const updateData: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (updates.slug !== undefined) updateData['slug'] = updates.slug;
    if (updates.sortOrder !== undefined) updateData['sort_order'] = updates.sortOrder;
    if (updates.isActive !== undefined) updateData['is_active'] = updates.isActive;
    if (updates.title !== undefined) updateData['title'] = updates.title;
    if (updates.subtitle !== undefined) updateData['subtitle'] = updates.subtitle;
    if (updates.coverImageUrl !== undefined || updates.coverImageStorageKey !== undefined) {
      updateData['cover_image_url'] = updates.coverImageStorageKey ?? updates.coverImageUrl;
    }
    if (updates.gallery !== undefined) updateData['gallery'] = this.normalizePackageGallery(updates.gallery);
    if (updates.price !== undefined) updateData['price'] = updates.price;
    if (updates.currency !== undefined) updateData['currency'] = updates.currency;
    if (updates.duration !== undefined) updateData['duration'] = updates.duration;
    if (updates.summary !== undefined) updateData['summary'] = updates.summary;
    if (updates.tags !== undefined) updateData['tags'] = this.normalizePackageTags(updates.tags);
    if (updates.includes !== undefined) updateData['includes'] = this.normalizePackageIncludes(updates.includes);
    if (updates.process !== undefined) updateData['process'] = this.normalizePackageProcess(updates.process);
    if (updates.cases !== undefined) updateData['cases'] = this.normalizePackageCases(updates.cases);
    if (updates.reviews !== undefined) updateData['reviews'] = this.normalizePackageReviews(updates.reviews);
    if (updates.translations !== undefined) updateData['translations'] = updates.translations;

    const { data: row, error } = await this.supabase
      .from('hospital_material_packages')
      .update(updateData)
      .eq('id', id)
      .eq('hospital_id', hospitalId)
      .select('id, hospital_id, slug, sort_order, is_active, title, subtitle, cover_image_url, gallery, price, currency, duration, summary, tags, includes, process, cases, reviews, translations')
      .single();

    this.throwPackageSlugConflict(error);
    if (error) {
      if (error.code === 'PGRST116') throw new NotFoundError(`Package ${id} not found for hospital ${hospitalId}`);
      throw error;
    }
    if (!row) throw new NotFoundError(`Package ${id} not found for hospital ${hospitalId}`);

    return this.mapMaterialsPackageRow(row);
  }

  async deletePackage(id: string, hospitalId: string): Promise<void> {
    const { error } = await this.supabase
      .from('hospital_material_packages')
      .delete()
      .eq('id', id)
      .eq('hospital_id', hospitalId);

    if (error) throw error;
  }

  private async mapMaterialsReviewRow(row: Record<string, unknown>) {
    const patientAvatar = await resolveMediaRef((row.patient_avatar_url as string | null) ?? null, this.storage);
    const rawMedia = this.normalizeReviewMedia(row.media);
    const [mediaUrls, mediaThumbnailUrls] = await Promise.all([
      resolveMediaRefs(rawMedia.map((item) => item.url), this.storage),
      resolveMediaRefs(rawMedia.map((item) => item.thumbnailUrl), this.storage),
    ]);

    return {
      id: row.id as string,
      hospitalId: row.hospital_id as string,
      sortOrder: (row.sort_order as number | null) ?? 0,
      isActive: (row.is_active as boolean | null) ?? true,
      featured: (row.featured as boolean | null) ?? false,
      patientName: (row.patient_name as string | null) ?? '',
      patientCountry: (row.patient_country as string | null) ?? null,
      patientAvatarUrl: patientAvatar.url || null,
      patientAvatarStorageKey: patientAvatar.storageKey,
      treatmentName: (row.treatment_name as string | null) ?? null,
      reviewTitle: (row.review_title as string | null) ?? null,
      reviewComment: (row.review_comment as string | null) ?? '',
      rating: (row.rating as number | null) ?? 0,
      reviewDate: (row.review_date as string | null) ?? null,
      media: rawMedia.map((item, index) => ({
        ...item,
        url: mediaUrls[index]?.url ?? item.url,
        storageKey: mediaUrls[index]?.storageKey ?? null,
        thumbnailUrl: mediaThumbnailUrls[index]?.url || item.thumbnailUrl,
        thumbnailStorageKey: mediaThumbnailUrls[index]?.storageKey ?? null,
      })),
      translations: (row.translations as Record<string, Record<string, unknown>> | null) ?? {},
    };
  }

  private normalizeReviewMedia(
    media: unknown,
  ): Parameters<IMaterialsRepository['createReview']>[0]['media'] {
    if (!Array.isArray(media)) return [];

    return media
      .map((item, index) => {
        const record = item as Record<string, unknown>;
        const type = record.type === 'video' ? 'video' : 'image';
        const storageKey = typeof record.storageKey === 'string' ? record.storageKey : null;
        const thumbnailStorageKey = typeof record.thumbnailStorageKey === 'string'
          ? record.thumbnailStorageKey
          : null;
        const url = storageKey ?? (typeof record.url === 'string' ? record.url : '');
        if (!url) return null;

        return {
          id: typeof record.id === 'string' && record.id.length > 0 ? record.id : randomUUID(),
          type,
          url,
          thumbnailUrl: thumbnailStorageKey ?? (typeof record.thumbnailUrl === 'string' ? record.thumbnailUrl : null),
          caption: typeof record.caption === 'string' ? record.caption : null,
          sortOrder: typeof record.sortOrder === 'number' ? record.sortOrder : index,
        };
      })
      .filter((item): item is Parameters<IMaterialsRepository['createReview']>[0]['media'][number] => item !== null)
      .sort((a, b) => a.sortOrder - b.sortOrder);
  }

  private async mapMaterialsPackageRow(row: Record<string, unknown>) {
    const coverImage = await resolveMediaRef((row.cover_image_url as string | null) ?? null, this.storage);
    const rawGallery = this.normalizePackageGallery(row.gallery);
    const galleryImages = await resolveMediaRefs(rawGallery.map((item) => item.imageUrl), this.storage);

    return {
      id: row.id as string,
      hospitalId: row.hospital_id as string,
      slug: (row.slug as string | null) ?? '',
      sortOrder: (row.sort_order as number | null) ?? 0,
      isActive: (row.is_active as boolean | null) ?? true,
      title: (row.title as string | null) ?? '',
      subtitle: (row.subtitle as string | null) ?? null,
      coverImageUrl: coverImage.url || '',
      coverImageStorageKey: coverImage.storageKey,
      gallery: rawGallery.map((item, index) => ({
        ...item,
        imageUrl: galleryImages[index]?.url ?? item.imageUrl,
        storageKey: galleryImages[index]?.storageKey ?? null,
      })),
      price: String(row.price ?? ''),
      currency: (row.currency as string | null) ?? '',
      duration: (row.duration as string | null) ?? null,
      summary: (row.summary as string | null) ?? '',
      tags: this.normalizePackageTags(row.tags),
      includes: this.normalizePackageIncludes(row.includes),
      process: this.normalizePackageProcess(row.process),
      cases: this.normalizePackageCases(row.cases),
      reviews: this.normalizePackageReviews(row.reviews),
      translations: (row.translations as Record<string, Record<string, unknown>> | null) ?? {},
    };
  }

  private normalizePackageGallery(
    value: unknown,
  ): Parameters<IMaterialsRepository['createPackage']>[0]['gallery'] {
    if (!Array.isArray(value)) return [];

    return value
      .map((item, index) => {
        const record = item as Record<string, unknown>;
        const storageKey = typeof record.storageKey === 'string' ? record.storageKey : null;
        const imageUrl = storageKey ?? (typeof record.imageUrl === 'string'
          ? record.imageUrl
          : typeof record.image_url === 'string'
            ? record.image_url
            : '');
        if (!imageUrl) return null;

        return {
          id: typeof record.id === 'string' && record.id.length > 0 ? record.id : randomUUID(),
          imageUrl,
          sortOrder: typeof record.sortOrder === 'number'
            ? record.sortOrder
            : typeof record.sort_order === 'number'
              ? record.sort_order
              : index,
        };
      })
      .filter((item): item is Parameters<IMaterialsRepository['createPackage']>[0]['gallery'][number] => item !== null)
      .sort((a, b) => a.sortOrder - b.sortOrder);
  }

  private normalizePackageTags(
    value: unknown,
  ): Parameters<IMaterialsRepository['createPackage']>[0]['tags'] {
    if (!Array.isArray(value)) return [];

    return value
      .map((item) => {
        const record = item as Record<string, unknown>;
        const label = typeof record.label === 'string' ? record.label : '';
        if (!label) return null;

        return {
          id: typeof record.id === 'string' && record.id.length > 0 ? record.id : randomUUID(),
          label,
          category: typeof record.category === 'string' ? record.category : null,
        };
      })
      .filter((item): item is Parameters<IMaterialsRepository['createPackage']>[0]['tags'][number] => item !== null);
  }

  private normalizePackageIncludes(
    value: unknown,
  ): Parameters<IMaterialsRepository['createPackage']>[0]['includes'] {
    if (!Array.isArray(value)) return [];

    return value
      .map((item, index) => {
        const record = item as Record<string, unknown>;
        const text = typeof record.text === 'string' ? record.text : '';
        if (!text) return null;

        return {
          id: typeof record.id === 'string' && record.id.length > 0 ? record.id : randomUUID(),
          text,
          sortOrder: typeof record.sortOrder === 'number'
            ? record.sortOrder
            : typeof record.sort_order === 'number'
              ? record.sort_order
              : index,
        };
      })
      .filter((item): item is Parameters<IMaterialsRepository['createPackage']>[0]['includes'][number] => item !== null)
      .sort((a, b) => a.sortOrder - b.sortOrder);
  }

  private normalizePackageProcess(
    value: unknown,
  ): Parameters<IMaterialsRepository['createPackage']>[0]['process'] {
    if (!Array.isArray(value)) return [];

    return value
      .map((item, index) => {
        const record = item as Record<string, unknown>;
        const stepTitle = typeof record.stepTitle === 'string'
          ? record.stepTitle
          : typeof record.step_title === 'string'
            ? record.step_title
            : '';
        const description = typeof record.description === 'string' ? record.description : '';
        if (!stepTitle || !description) return null;

        return {
          id: typeof record.id === 'string' && record.id.length > 0 ? record.id : randomUUID(),
          stepTitle,
          description,
          sortOrder: typeof record.sortOrder === 'number'
            ? record.sortOrder
            : typeof record.sort_order === 'number'
              ? record.sort_order
              : index,
        };
      })
      .filter((item): item is Parameters<IMaterialsRepository['createPackage']>[0]['process'][number] => item !== null)
      .sort((a, b) => a.sortOrder - b.sortOrder);
  }

  private normalizePackageCases(
    value: unknown,
  ): Parameters<IMaterialsRepository['createPackage']>[0]['cases'] {
    if (!Array.isArray(value)) return [];

    type PackageCase = Parameters<IMaterialsRepository['createPackage']>[0]['cases'][number];

    const cases: Array<PackageCase | null> = value
      .map((item, index) => {
        const record = item as Record<string, unknown>;
        const patientName = typeof record.patientName === 'string'
          ? record.patientName
          : typeof record.patient_name === 'string'
            ? record.patient_name
            : '';
        const story = typeof record.story === 'string' ? record.story : '';
        const result = typeof record.result === 'string' ? record.result : '';
        if (!patientName || !story || !result) return null;

        return {
          id: typeof record.id === 'string' && record.id.length > 0 ? record.id : randomUUID(),
          patientName,
          patientAge: this.normalizePackageCaseAge(record.patientAge ?? record.patient_age),
          patientCountry: typeof record.patientCountry === 'string'
            ? record.patientCountry
            : typeof record.patient_country === 'string'
              ? record.patient_country
              : null,
          story,
          result,
          sortOrder: typeof record.sortOrder === 'number'
            ? record.sortOrder
            : typeof record.sort_order === 'number'
              ? record.sort_order
              : index,
        };
      });

    return cases
      .filter((item): item is PackageCase => item !== null)
      .sort((a, b) => a.sortOrder - b.sortOrder);
  }

  private normalizePackageCaseAge(value: unknown): number | null {
    if (typeof value === 'number' && Number.isFinite(value)) {
      return value;
    }

    if (typeof value === 'string') {
      const trimmed = value.trim();
      if (!trimmed) return null;

      const parsed = Number(trimmed);
      return Number.isFinite(parsed) ? parsed : null;
    }

    return null;
  }

  private normalizePackageReviews(
    value: unknown,
  ): Parameters<IMaterialsRepository['createPackage']>[0]['reviews'] {
    if (!Array.isArray(value)) return [];

    return value
      .map((item, index) => {
        const record = item as Record<string, unknown>;
        const reviewerName = typeof record.reviewerName === 'string'
          ? record.reviewerName
          : typeof record.reviewer_name === 'string'
            ? record.reviewer_name
            : '';
        const comment = typeof record.comment === 'string' ? record.comment : '';
        const rating = typeof record.rating === 'number' ? record.rating : null;
        if (!reviewerName || !comment || rating === null) return null;

        return {
          id: typeof record.id === 'string' && record.id.length > 0 ? record.id : randomUUID(),
          reviewerName,
          reviewerCountry: typeof record.reviewerCountry === 'string'
            ? record.reviewerCountry
            : typeof record.reviewer_country === 'string'
              ? record.reviewer_country
              : null,
          rating,
          reviewDate: typeof record.reviewDate === 'string'
            ? record.reviewDate
            : typeof record.review_date === 'string'
              ? record.review_date
              : null,
          comment,
          sortOrder: typeof record.sortOrder === 'number'
            ? record.sortOrder
            : typeof record.sort_order === 'number'
              ? record.sort_order
              : index,
          isActive: typeof record.isActive === 'boolean'
            ? record.isActive
            : typeof record.is_active === 'boolean'
              ? record.is_active
              : true,
        };
      })
      .filter((item): item is Parameters<IMaterialsRepository['createPackage']>[0]['reviews'][number] => item !== null)
      .sort((a, b) => a.sortOrder - b.sortOrder);
  }

  private throwPackageSlugConflict(error: { code?: string; message?: string } | null): void {
    if (!error) return;

    if (
      error.code === '23505'
      || error.message?.includes('hospital_material_packages_hospital_id_slug_unique')
      || error.message?.includes('duplicate key value')
    ) {
      throw new ConflictError('Package slug already exists for this hospital');
    }
  }
}
