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
 * Supabase implementation of IMaterialsRepository.
 *
 * Maps between domain types and Main Supabase tables:
 * - hospitals -> MaterialsHospitalInfo
 * - hospital_procedures + procedures (join) -> MaterialsProcedure
 * - surgeons -> MaterialsSurgeon
 * - procedure_cases + case_images -> MaterialsBeforeAfterCase
 *
 * All mutation queries are scoped by hospital_id for tenant isolation.
 */
export class SupabaseMaterialsRepository implements IMaterialsRepository {
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
      const languageCode = row.language_code;
      if (typeof languageCode !== 'string' || languageCode.length === 0) continue;

      const fields: Record<string, unknown> = {};
      if (row.tagline !== undefined && row.tagline !== null) fields.tagline = row.tagline;
      if (row.description !== undefined && row.description !== null) fields.description = row.description;

      if (Object.keys(fields).length > 0) {
        translations[languageCode] = fields;
      }
    }

    return translations;
  }

  async getHospitalInfo(hospitalId: string): Promise<MaterialsHospitalInfo | null> {
    const { data, error } = await this.supabase
      .from('hospitals')
      .select('*')
      .eq('id', hospitalId)
      .single();

    if (error) {
      if (error.code === 'PGRST116') return null; // row not found
      throw error;
    }

    // Fetch translation, location, and nearby attractions in parallel (graceful degradation)
    const [translationResult, locationResult, nearbyAttractionsResult] = await Promise.allSettled([
      this.supabase
        .from('hospital_translations')
        .select('*')
        .eq('hospital_id', data.id),
      this.supabase
        .from('hospital_location')
        .select('*')
        .eq('hospital_id', data.id)
        .single(),
      this.supabase
        .from('hospital_nearby_attractions')
        .select('*')
        .eq('hospital_id', data.id)
        .order('sort_order', { ascending: true }),
    ]);

    const translationRows = translationResult.status === 'fulfilled' && !translationResult.value.error
      ? (translationResult.value.data as Array<Record<string, unknown>> | null) ?? []
      : [];
    const translationZh = translationRows.find((row) => row.language_code === 'zh') ?? null;
    const translationEn = translationRows.find((row) => row.language_code === 'en') ?? null;
    const primaryTranslation = translationZh ?? translationEn ?? translationRows[0] ?? null;
    const location = locationResult.status === 'fulfilled' && !locationResult.value.error
      ? locationResult.value.data
      : null;
    const nearbyAttractions = nearbyAttractionsResult.status === 'fulfilled' && !nearbyAttractionsResult.value.error
      ? nearbyAttractionsResult.value.data ?? []
      : [];

    // Extract crm_metadata (JSONB) for CRM-specific fields
    const crmMeta: Record<string, unknown> = (data.crm_metadata as Record<string, unknown>) ?? {};

    // Extract certifications: prefer crm_metadata, fallback to highlights
    const certifications = Array.isArray(crmMeta.certifications)
      ? (crmMeta.certifications as Array<{ id: string; name: string; nameEn?: string; year?: number; isActive: boolean }>)
      : this.extractCertificationsFromHighlights(data.highlights);

    // Extract multilingual staff from crm_metadata or highlights
    const multilingualStaffFromHighlights = this.extractLanguagesFromHighlights(data.highlights);
    const heroImage = await resolveMediaRef(data.hero_image ?? null, this.storage);
    const photos = await resolveMediaRefs((data.photos ?? []) as Array<string | null | undefined>, this.storage);
    const promotionalVideos = await resolveMediaRefs(
      ((crmMeta.promotionalVideos as string[] | undefined) ?? []) as Array<string | null | undefined>,
      this.storage,
    );
    const testimonialVideoUrls = await resolveMediaRefs(
      (((crmMeta.videoTestimonials as MaterialsHospitalInfo['videoTestimonials']) ?? []).map((item) => item.videoUrl)) as Array<string | null | undefined>,
      this.storage,
    );
    const testimonialThumbnailUrls = await resolveMediaRefs(
      (((crmMeta.videoTestimonials as MaterialsHospitalInfo['videoTestimonials']) ?? []).map((item) => item.thumbnailUrl)) as Array<string | null | undefined>,
      this.storage,
    );
    const rawVideoTestimonials = (crmMeta.videoTestimonials as MaterialsHospitalInfo['videoTestimonials']) ?? [];

    return {
      id: data.id,
      name: data.name,
      nameEn: data.name,
      slug: data.slug,
      heroImage: heroImage.url || null,
      heroImageStorageKey: heroImage.storageKey,
      photos: photos.map((item) => item.url),
      photoStorageKeys: photos.map((item) => item.storageKey),
      highlights: data.highlights ?? [],
      yearEstablished: data.year_established ?? undefined,
      totalPatients: data.total_patients ?? undefined,
      tagline: (translationZh?.tagline as string | undefined) ?? (primaryTranslation?.tagline as string | undefined),
      taglineEn: (translationEn?.tagline as string | undefined) ?? (primaryTranslation?.tagline as string | undefined),
      description: (translationZh?.description as string | undefined) ?? (primaryTranslation?.description as string | undefined),
      descriptionEn: (translationEn?.description as string | undefined) ?? (primaryTranslation?.description as string | undefined),
      status: data.is_active ? 'published' : 'draft',
      isActive: data.is_active ?? false,
      paymentMethods: data.payment_methods ?? [],
      address: location?.address ?? undefined,
      phone: location?.phone ?? undefined,
      email: location?.email ?? undefined,
      website: location?.website ?? undefined,
      hours: location?.hours ?? undefined,
      operatingHours: location?.hours ?? undefined,
      latitude: location?.latitude ?? undefined,
      longitude: location?.longitude ?? undefined,
      mapEmbed: location?.map_embed ?? undefined,
      certifications,
      bedCount: crmMeta.bedCount as number | undefined,
      patientCapacity: crmMeta.patientCapacity as number | undefined,
      recommendRate: data.recommend_rate ?? undefined,
      multilingualStaff: Array.isArray(crmMeta.multilingualStaff)
        ? crmMeta.multilingualStaff as string[]
        : (multilingualStaffFromHighlights.length > 0 ? multilingualStaffFromHighlights : []),
      airportServices: Array.isArray(crmMeta.airportServices)
        ? crmMeta.airportServices as string[]
        : [],
      followUpCare: Array.isArray(crmMeta.followUpCare)
        ? crmMeta.followUpCare as string[]
        : [],
      amenities: (crmMeta.amenities as string[] | undefined) ?? [],
      nearbyAttractions: (nearbyAttractions ?? []).map((a: Record<string, unknown>) => ({
        id: a.id as string,
        name: (a.name_zh as string) || (a.name as string),
        nameEn: a.name as string,
        distance: a.distance as string,
      })),
      promotionalVideos: promotionalVideos.map((item) => item.url),
      promotionalVideoStorageKeys: promotionalVideos.map((item) => item.storageKey),
      videoTestimonials: rawVideoTestimonials.map((item, index) => ({
        ...item,
        videoUrl: testimonialVideoUrls[index]?.url ?? item.videoUrl,
        videoStorageKey: testimonialVideoUrls[index]?.storageKey ?? null,
        thumbnailUrl: testimonialThumbnailUrls[index]?.url || item.thumbnailUrl,
        thumbnailStorageKey: testimonialThumbnailUrls[index]?.storageKey ?? null,
      })),
      translations: this.buildHospitalTranslations(translationRows),
    };
  }

  // --- Helper: extract certifications from highlights ---
  private extractCertificationsFromHighlights(
    highlights: Array<{ icon: string; text: string }> | null | undefined,
  ): Array<{ id: string; name: string; nameEn?: string; year?: number; isActive: boolean }> {
    if (!highlights) return [];
    const certs: Array<{ id: string; name: string; nameEn: string; year?: number; isActive: boolean }> = [];
    for (const h of highlights) {
      if (h.icon === 'award' || h.icon === 'shield') {
        const yearMatch = h.text.match(/(\d{4})/);
        const year = yearMatch ? parseInt(yearMatch[1]!) : undefined;
        let certName = h.text;
        if (h.text.toLowerCase().includes('jci')) certName = 'JCI Accreditation';
        certs.push({ id: `cert-${certs.length + 1}`, name: certName, nameEn: certName, year, isActive: true });
      }
    }
    return certs;
  }

  // --- Helper: extract languages from highlights ---
  private extractLanguagesFromHighlights(
    highlights: Array<{ icon: string; text: string }> | null | undefined,
  ): string[] {
    if (!highlights) return [];
    for (const h of highlights) {
      if (h.icon === 'globe' || h.text.toLowerCase().includes('multilingual')) {
        const match = h.text.match(/\(([^)]+)\)/);
        if (match) return match[1]!.split(',').map((lang) => lang.trim().toLowerCase());
      }
    }
    return [];
  }

  async updateHospitalInfo(hospitalId: string, updates: Partial<MaterialsHospitalInfo>): Promise<MaterialsHospitalInfo> {
    // 1. Build hospital table updates
    const hospitalUpdates: Record<string, unknown> = {};
    if (updates.name !== undefined) hospitalUpdates['name'] = updates.name;
    if (updates.heroImage !== undefined) hospitalUpdates['hero_image'] = updates.heroImage;
    if (updates.photos !== undefined) hospitalUpdates['photos'] = updates.photos;
    if (updates.highlights !== undefined) hospitalUpdates['highlights'] = updates.highlights;
    if (updates.nameEn !== undefined) hospitalUpdates['name'] = updates.nameEn;
    if (updates.yearEstablished !== undefined) hospitalUpdates['year_established'] = updates.yearEstablished;
    if (updates.totalPatients !== undefined) hospitalUpdates['total_patients'] = updates.totalPatients;
    if (updates.paymentMethods !== undefined) hospitalUpdates['payment_methods'] = updates.paymentMethods;
    if (updates.recommendRate !== undefined) hospitalUpdates['recommend_rate'] = updates.recommendRate;
    if (updates.isActive !== undefined) hospitalUpdates['is_active'] = updates.isActive;

    // CRM metadata fields -> crm_metadata JSONB
    const crmMetadataFields = [
      'bedCount', 'patientCapacity', 'multilingualStaff', 'airportServices',
      'followUpCare', 'amenities', 'certifications', 'promotionalVideos', 'videoTestimonials',
    ] as const;
    const crmMetadataUpdates: Record<string, unknown> = {};
    for (const field of crmMetadataFields) {
      if (updates[field] !== undefined) {
        crmMetadataUpdates[field] = updates[field];
      }
    }

    if (Object.keys(crmMetadataUpdates).length > 0) {
      const { data: currentHospital } = await this.supabase
        .from('hospitals')
        .select('crm_metadata')
        .eq('id', hospitalId)
        .single();
      const existingMeta = (currentHospital?.crm_metadata as Record<string, unknown>) ?? {};
      hospitalUpdates['crm_metadata'] = { ...existingMeta, ...crmMetadataUpdates };
    }

    if (Object.keys(hospitalUpdates).length > 0) {
      hospitalUpdates['updated_at'] = new Date().toISOString();
      const { error } = await this.supabase
        .from('hospitals')
        .update(hospitalUpdates)
        .eq('id', hospitalId);
      if (error) throw error;
    }

    // 2. Update location table
    const locationUpdates: Record<string, unknown> = {};
    if (updates.address !== undefined) locationUpdates['address'] = updates.address;
    if (updates.phone !== undefined) locationUpdates['phone'] = updates.phone;
    if (updates.email !== undefined) locationUpdates['email'] = updates.email;
    if (updates.website !== undefined) locationUpdates['website'] = updates.website;
    if (updates.hours !== undefined) locationUpdates['hours'] = updates.hours;
    if (updates.operatingHours !== undefined) locationUpdates['hours'] = updates.operatingHours;
    if (updates.latitude !== undefined) locationUpdates['latitude'] = updates.latitude;
    if (updates.longitude !== undefined) locationUpdates['longitude'] = updates.longitude;
    if (updates.mapEmbed !== undefined) locationUpdates['map_embed'] = updates.mapEmbed;

    if (Object.keys(locationUpdates).length > 0) {
      locationUpdates['updated_at'] = new Date().toISOString();
      const { data: locData, error: locError } = await this.supabase
        .from('hospital_location')
        .update(locationUpdates)
        .eq('hospital_id', hospitalId)
        .select('id');

      if (locError) {
        // ignore error — location row may not exist
      } else if (!locData || locData.length === 0) {
        // Create location row if it doesn't exist
        await this.supabase
          .from('hospital_location')
          .insert({ hospital_id: hospitalId, ...locationUpdates });
      }
    }

    // 3. Update translations table
    const zhTranslationUpdates: Record<string, unknown> = {};
    const enTranslationUpdates: Record<string, unknown> = {};
    if (updates.tagline !== undefined) zhTranslationUpdates['tagline'] = updates.tagline;
    if (updates.description !== undefined) zhTranslationUpdates['description'] = updates.description;
    if (updates.taglineEn !== undefined) enTranslationUpdates['tagline'] = updates.taglineEn;
    if (updates.descriptionEn !== undefined) enTranslationUpdates['description'] = updates.descriptionEn;

    type HospitalTranslationRow = {
      hospital_id: string;
      language_code: 'zh' | 'en';
      updated_at: string;
    } & Record<string, unknown>;

    const translationRows = [
      Object.keys(zhTranslationUpdates).length > 0
        ? {
            hospital_id: hospitalId,
            language_code: 'zh',
            ...zhTranslationUpdates,
            updated_at: new Date().toISOString(),
          }
        : null,
      Object.keys(enTranslationUpdates).length > 0
        ? {
            hospital_id: hospitalId,
            language_code: 'en',
            ...enTranslationUpdates,
            updated_at: new Date().toISOString(),
          }
        : null,
    ].filter((row): row is HospitalTranslationRow => row !== null);

    for (const row of translationRows) {
      const { error } = await this.supabase
        .from('hospital_translations')
        .upsert(row, { onConflict: 'hospital_id,language_code' });
      if (error) throw error;
    }

    // 4. Update nearby attractions
    if (updates.nearbyAttractions !== undefined) {
      await this.supabase.from('hospital_nearby_attractions').delete().eq('hospital_id', hospitalId);
      if (updates.nearbyAttractions.length > 0) {
        const rows = updates.nearbyAttractions.map((a, idx) => ({
          hospital_id: hospitalId,
          name: a.nameEn || a.name || '',
          name_zh: a.name || null,
          distance: a.distance || '',
          sort_order: idx + 1,
        }));
        await this.supabase.from('hospital_nearby_attractions').insert(rows);
      }
    }

    // 5. Return refreshed data
    const result = await this.getHospitalInfo(hospitalId);
    if (!result) throw new NotFoundError(`Hospital ${hospitalId} not found`);
    return result;
  }

  // ---------------------------------------------------------------------------
  // Procedures (hospital_procedures + procedures join)
  // ---------------------------------------------------------------------------

  async listProcedures(hospitalId: string): Promise<MaterialsProcedure[]> {
    const { data, error } = await this.supabase
      .from('hospital_procedures')
      .select('id, hospital_id, procedure_id, price_range, price_min, price_max, is_popular, sort_order, procedures(procedure_name)')
      .eq('hospital_id', hospitalId)
      .order('sort_order', { ascending: true });

    if (error) throw error;

    return (data ?? []).map((row: Record<string, unknown>) => {
      const proc = row.procedures as { procedure_name: string } | null;
      return {
        id: row.id as string,
        hospitalId: row.hospital_id as string,
        procedureName: proc?.procedure_name ?? '',
        description: null,
        priceMin: row.price_min as number | null,
        priceMax: row.price_max as number | null,
        priceRange: row.price_range as string | null,
        isPopular: row.is_popular as boolean,
        sortOrder: row.sort_order as number,
      };
    });
  }

  async createProcedure(data: Omit<MaterialsProcedure, 'id'>): Promise<MaterialsProcedure> {
    // Find or create the procedure in the global catalog.
    // Use case-insensitive matching to prevent near-duplicate entries.
    let procedureId: string;
    const { data: existing } = await this.supabase
      .from('procedures')
      .select('id')
      .ilike('procedure_name', data.procedureName)
      .limit(1)
      .single();

    if (existing) {
      procedureId = existing.id;
    } else {
      const slug = data.procedureName.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
      const { data: created, error: createErr } = await this.supabase
        .from('procedures')
        .insert({
          procedure_name: data.procedureName,
          slug,
          description: data.description,
        })
        .select('id')
        .single();

      if (createErr) throw createErr;
      procedureId = created!.id;
    }

    // Create hospital_procedures link
    const { data: row, error } = await this.supabase
      .from('hospital_procedures')
      .insert({
        hospital_id: data.hospitalId,
        procedure_id: procedureId,
        price_range: data.priceRange,
        price_min: data.priceMin,
        price_max: data.priceMax,
        is_popular: data.isPopular,
        sort_order: data.sortOrder,
      })
      .select('id, hospital_id, procedure_id, price_range, price_min, price_max, is_popular, sort_order')
      .single();

    if (error) throw error;

    return {
      id: row!.id,
      hospitalId: row!.hospital_id,
      procedureName: data.procedureName,
      description: data.description,
      priceMin: row!.price_min,
      priceMax: row!.price_max,
      priceRange: row!.price_range,
      isPopular: row!.is_popular,
      sortOrder: row!.sort_order,
    };
  }

  async updateProcedure(id: string, hospitalId: string, updates: Partial<MaterialsProcedure>): Promise<MaterialsProcedure> {
    const updateData: Record<string, unknown> = {};
    if (updates.priceRange !== undefined) updateData['price_range'] = updates.priceRange;
    if (updates.priceMin !== undefined) updateData['price_min'] = updates.priceMin;
    if (updates.priceMax !== undefined) updateData['price_max'] = updates.priceMax;
    if (updates.isPopular !== undefined) updateData['is_popular'] = updates.isPopular;
    if (updates.sortOrder !== undefined) updateData['sort_order'] = updates.sortOrder;

    const { data: row, error } = await this.supabase
      .from('hospital_procedures')
      .update(updateData)
      .eq('id', id)
      .eq('hospital_id', hospitalId)
      .select('id, hospital_id, procedure_id, price_range, price_min, price_max, is_popular, sort_order, procedures(procedure_name)')
      .single();

    if (error) {
      if (error.code === 'PGRST116') throw new NotFoundError(`Procedure ${id} not found for hospital ${hospitalId}`);
      throw error;
    }
    if (!row) throw new NotFoundError(`Procedure ${id} not found for hospital ${hospitalId}`);

    const proc = (row as Record<string, unknown>).procedures as { procedure_name: string } | null;

    // NOTE: Do NOT update the shared procedures table — it is a global catalog.

    return {
      id: row.id,
      hospitalId: row.hospital_id,
      procedureName: proc?.procedure_name ?? '',
      description: null,
      priceMin: row.price_min,
      priceMax: row.price_max,
      priceRange: row.price_range,
      isPopular: row.is_popular,
      sortOrder: row.sort_order,
    };
  }

  async deleteProcedure(id: string, hospitalId: string): Promise<void> {
    const { error } = await this.supabase
      .from('hospital_procedures')
      .delete()
      .eq('id', id)
      .eq('hospital_id', hospitalId);

    if (error) throw error;
  }

  // ---------------------------------------------------------------------------
  // Surgeons
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
  // Before/After Cases (procedure_cases + case_images)
  // ---------------------------------------------------------------------------

  async listBeforeAfterCases(hospitalId: string): Promise<MaterialsBeforeAfterCase[]> {
    const { data, error } = await this.supabase
      .from('procedure_cases')
      .select('id, hospital_id, procedure_id, case_number, provider_name, description, translations')
      .eq('hospital_id', hospitalId)
      .order('sort_order', { ascending: true });

    if (error) throw error;

    const rows = (data ?? []) as Array<Record<string, unknown>>;
    const caseIds = rows.map((row) => row.id).filter((id): id is string => typeof id === 'string');
    const procedureIds = rows
      .map((row) => row.procedure_id)
      .filter((id): id is string => typeof id === 'string' && id.length > 0);

    const [proceduresResult, caseImagesResult, caseMediaResult] = await Promise.all([
      procedureIds.length > 0
        ? this.supabase.from('procedures').select('id, procedure_name, slug').in('id', procedureIds)
        : Promise.resolve({ data: [], error: null }),
      caseIds.length > 0
        ? this.supabase.from('case_images').select('case_id, image_url, image_type, sort_order').in('case_id', caseIds).order('sort_order', { ascending: true })
        : Promise.resolve({ data: [], error: null }),
      caseIds.length > 0
        ? this.supabase.from('case_media').select('case_id, media_url, media_type, thumbnail_url, sort_order').in('case_id', caseIds).order('sort_order', { ascending: true })
        : Promise.resolve({ data: [], error: null }),
    ]);

    if (proceduresResult.error) throw proceduresResult.error;
    if (caseImagesResult.error && !shouldIgnoreCaseMediaError(caseImagesResult.error)) {
      throw caseImagesResult.error;
    }
    if (caseMediaResult.error && !shouldIgnoreCaseMediaError(caseMediaResult.error)) {
      throw caseMediaResult.error;
    }

    const proceduresById = new Map(
      (proceduresResult.data ?? [])
        .filter((row): row is { id: string; procedure_name: string | null; slug: string | null } => typeof row.id === 'string')
        .map((row) => [row.id, { name: row.procedure_name ?? '', slug: row.slug ?? null }]),
    );
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
      const linkedProcedure = typeof row.procedure_id === 'string' ? proceduresById.get(row.procedure_id) : undefined;
      const procedureName = linkedProcedure?.name ?? '';
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
          procedureSlug: linkedProcedure?.slug ?? (procedureName ? slugifyProcedureName(procedureName) : null),
          caseNumber: row.case_number as string | null,
          hospitalId,
        }),
        media: mapCaseAssetsToMedia({
          caseRow: row,
          caseImages: caseImagesById.get(row.id as string) ?? [],
          caseMedia: caseMediaById.get(row.id as string) ?? [],
          procedureSlug: linkedProcedure?.slug ?? (procedureName ? slugifyProcedureName(procedureName) : null),
          caseNumber: row.case_number as string | null,
          hospitalId,
        }),
      };
    });
  }

  async createBeforeAfterCase(data: Omit<MaterialsBeforeAfterCase, 'id'>): Promise<MaterialsBeforeAfterCase> {
    // Beauty hospitals: procedure_name only exists in China Medical Supabase.
    // Use procedure_id FK to the procedures table instead.
    let procedureId: string | null = null;
    if (data.procedureName) {
      const { data: existing } = await this.supabase
        .from('procedures')
        .select('id')
        .ilike('procedure_name', data.procedureName)
        .limit(1)
        .single();

      if (existing) {
        procedureId = existing.id;
      } else {
        const slug = data.procedureName.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
        const { data: created } = await this.supabase
          .from('procedures')
          .insert({ procedure_name: data.procedureName, slug })
          .select('id')
          .single();
        procedureId = created?.id ?? null;
      }
    }

    const caseNumber = `CASE-${Date.now()}`;
    const { data: row, error } = await this.supabase
      .from('procedure_cases')
      .insert({
        hospital_id: data.hospitalId,
        procedure_id: procedureId,
        provider_name: data.surgeonName,
        description: data.description,
        case_number: caseNumber,
        image_count: data.images.length,
        sort_order: 0,
        translations: {},
      })
      .select('id, hospital_id, provider_name, description, translations')
      .single();

    if (error) throw error;

    const media = data.media ?? data.images.map((image) => ({ type: 'image' as const, url: image.url, thumbnailUrl: null }));
    const images = media.filter((item) => item.type === 'image').map((item) => ({ url: item.url }));
    if (images.length > 0) {
      const imageRows = media.flatMap((item, index) => (
        item.type === 'image'
          ? [{ case_id: row!.id, image_url: item.url, sort_order: index }]
          : []
      ));

      const { error: imgError } = await this.supabase
        .from('case_images')
        .insert(imageRows);

      if (imgError) throw imgError;
    }

    const videoMedia = media.filter((item) => item.type === 'video');
    if (videoMedia.length > 0) {
      const mediaRows = media.flatMap((item, index) => (
        item.type === 'video'
          ? [{
              case_id: row!.id,
              media_url: item.url,
              media_type: item.type,
              thumbnail_url: item.thumbnailUrl ?? null,
              sort_order: index,
            }]
          : []
      ));
      const { error: mediaError } = await this.supabase.from('case_media').insert(mediaRows);
      if (mediaError) throw mediaError;
    }

    return {
      id: row!.id,
      hospitalId: row!.hospital_id ?? data.hospitalId,
      procedureName: data.procedureName,
      surgeonName: row!.provider_name,
      description: row!.description,
      images,
      media,
      translations: (row!.translations as Record<string, Record<string, unknown>> | null) ?? {},
    };
  }

  async updateBeforeAfterCase(id: string, hospitalId: string, updates: Partial<MaterialsBeforeAfterCase>): Promise<MaterialsBeforeAfterCase> {
    const updateData: Record<string, unknown> = {};
    // Beauty hospitals: use procedure_id FK, not procedure_name column
    if (updates.procedureName !== undefined) {
      const { data: existing } = await this.supabase
        .from('procedures')
        .select('id')
        .ilike('procedure_name', updates.procedureName)
        .limit(1)
        .single();

      if (existing) {
        updateData['procedure_id'] = existing.id;
      } else {
        const slug = updates.procedureName.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
        const { data: created } = await this.supabase
          .from('procedures')
          .insert({ procedure_name: updates.procedureName, slug })
          .select('id')
          .single();
        if (created) updateData['procedure_id'] = created.id;
      }
    }
    if (updates.surgeonName !== undefined) updateData['provider_name'] = updates.surgeonName;
    if (updates.description !== undefined) updateData['description'] = updates.description;
    updateData['updated_at'] = new Date().toISOString();

    const { data: row, error } = await this.supabase
      .from('procedure_cases')
      .update(updateData)
      .eq('id', id)
      .eq('hospital_id', hospitalId)
      .select('id, hospital_id, procedure_id, provider_name, description, translations, procedures(procedure_name)')
      .single();

    if (error) {
      if (error.code === 'PGRST116') throw new NotFoundError(`Before/After case ${id} not found for hospital ${hospitalId}`);
      throw error;
    }
    if (!row) throw new NotFoundError(`Before/After case ${id} not found for hospital ${hospitalId}`);

    const nextMedia = updates.media ?? updates.images?.map((image) => ({ type: 'image' as const, url: image.url, thumbnailUrl: null }));
    if (nextMedia !== undefined) {
      const nextImages = nextMedia.filter((item) => item.type === 'image').map((item) => ({ url: item.url }));
      const [existingImagesResult, existingMediaResult] = await Promise.all([
        this.supabase
          .from('case_images')
          .select('image_url, sort_order')
          .eq('case_id', id)
          .order('sort_order', { ascending: true }),
        this.supabase
          .from('case_media')
          .select('media_url, media_type, thumbnail_url, sort_order')
          .eq('case_id', id)
          .order('sort_order', { ascending: true }),
      ]);

      if (existingImagesResult.error) throw existingImagesResult.error;
      if (existingMediaResult.error && !shouldIgnoreCaseMediaError(existingMediaResult.error)) {
        throw existingMediaResult.error;
      }

      const previousImageRows = ((existingImagesResult.data ?? []) as Array<{ image_url: string; sort_order?: number | null }>).map((item) => ({
        case_id: id,
        image_url: item.image_url,
        sort_order: item.sort_order ?? 0,
      }));
      const previousMediaRows = ((existingMediaResult.data ?? []) as Array<{ media_url: string; media_type?: string | null; thumbnail_url?: string | null; sort_order?: number | null }>).map((item) => ({
        case_id: id,
        media_url: item.media_url,
        media_type: item.media_type ?? 'image',
        thumbnail_url: item.thumbnail_url ?? null,
        sort_order: item.sort_order ?? 0,
      }));

      const restorePreviousMedia = async (): Promise<void> => {
        const { error: restoreDeleteImagesError } = await this.supabase
          .from('case_images')
          .delete()
          .eq('case_id', id);
        if (restoreDeleteImagesError) throw restoreDeleteImagesError;

        const { error: restoreDeleteMediaError } = await this.supabase
          .from('case_media')
          .delete()
          .eq('case_id', id);
        if (restoreDeleteMediaError && !shouldIgnoreCaseMediaError(restoreDeleteMediaError)) {
          throw restoreDeleteMediaError;
        }

        if (previousImageRows.length > 0) {
          const { error: restoreImagesError } = await this.supabase
            .from('case_images')
            .insert(previousImageRows);
          if (restoreImagesError) throw restoreImagesError;
        }

        if (previousMediaRows.length > 0) {
          const { error: restoreMediaError } = await this.supabase
            .from('case_media')
            .insert(previousMediaRows);
          if (restoreMediaError && !shouldIgnoreCaseMediaError(restoreMediaError)) {
            throw restoreMediaError;
          }
        }

        await this.supabase
          .from('procedure_cases')
          .update({ image_count: previousImageRows.length })
          .eq('id', id)
          .eq('hospital_id', hospitalId);
      };

      try {
        const { error: deleteImagesError } = await this.supabase
          .from('case_images')
          .delete()
          .eq('case_id', id);
        if (deleteImagesError) throw deleteImagesError;

        const { error: deleteMediaError } = await this.supabase
          .from('case_media')
          .delete()
          .eq('case_id', id);
        if (deleteMediaError && (updates.media !== undefined || !shouldIgnoreCaseMediaError(deleteMediaError))) {
          throw deleteMediaError;
        }

        if (nextImages.length > 0) {
          const imageRows = nextMedia.flatMap((item, index) => (
            item.type === 'image'
              ? [{ case_id: id, image_url: item.url, sort_order: index }]
              : []
          ));

          const { error: imgError } = await this.supabase
            .from('case_images')
            .insert(imageRows);

          if (imgError) throw imgError;
        }

        const videoMedia = nextMedia.filter((item) => item.type === 'video');
        if (videoMedia.length > 0) {
          const mediaRows = nextMedia.flatMap((item, index) => (
            item.type === 'video'
              ? [{
                  case_id: id,
                  media_url: item.url,
                  media_type: item.type,
                  thumbnail_url: item.thumbnailUrl ?? null,
                  sort_order: index,
                }]
              : []
          ));
          const { error: mediaError } = await this.supabase.from('case_media').insert(mediaRows);
          if (mediaError) throw mediaError;
        }

        const { error: imageCountError } = await this.supabase
          .from('procedure_cases')
          .update({ image_count: nextImages.length })
          .eq('id', id)
          .eq('hospital_id', hospitalId);
        if (imageCountError) throw imageCountError;
      } catch (replacementError) {
        await restorePreviousMedia();
        throw replacementError;
      }
    }

    // Fetch current images if not replaced
    let images: Array<{ url: string }>;
    let media;
    if (nextMedia !== undefined) {
      media = nextMedia;
      images = nextMedia.filter((item) => item.type === 'image').map((item) => ({ url: item.url }));
    } else {
      const [imgResult, mediaResult] = await Promise.all([
        this.supabase
        .from('case_images')
        .select('image_url, sort_order')
        .eq('case_id', id)
          .order('sort_order', { ascending: true }),
        this.supabase
          .from('case_media')
          .select('media_url, media_type, thumbnail_url, sort_order')
          .eq('case_id', id)
          .order('sort_order', { ascending: true }),
      ]);
      if (imgResult.error) throw imgResult.error;
      if (mediaResult.error && !shouldIgnoreCaseMediaError(mediaResult.error)) {
        throw mediaResult.error;
      }

      media = mapCaseAssetsToMedia({
        caseImages: imgResult.data ?? [],
        caseMedia: mediaResult.error && shouldIgnoreCaseMediaError(mediaResult.error) ? [] : mediaResult.data ?? [],
      });
      images = media.filter((item) => item.type === 'image').map((item) => ({ url: item.url }));
    }

    const proc = (row as Record<string, unknown>).procedures as { procedure_name: string } | null;
    return {
      id: row.id,
      hospitalId: row.hospital_id ?? hospitalId,
      procedureName: proc?.procedure_name ?? updates.procedureName ?? '',
      surgeonName: row.provider_name,
      description: row.description,
      images,
      media,
      translations: (row.translations as Record<string, Record<string, unknown>> | null) ?? {},
    };
  }

  async deleteBeforeAfterCase(id: string, hospitalId: string): Promise<void> {
    // Verify record belongs to hospital before deleting images
    const { data: existing } = await this.supabase
      .from('procedure_cases')
      .select('id')
      .eq('id', id)
      .eq('hospital_id', hospitalId)
      .single();

    if (!existing) throw new NotFoundError(`Before/After case ${id} not found for hospital ${hospitalId}`);

    // Delete case images first (foreign key)
    await this.supabase
      .from('case_images')
      .delete()
      .eq('case_id', id);

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
