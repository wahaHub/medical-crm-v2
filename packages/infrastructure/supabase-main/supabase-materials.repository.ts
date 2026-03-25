import type { SupabaseClient } from '@supabase/supabase-js';
import type {
  IMaterialsRepository,
  IStorageService,
  MaterialsHospitalInfo,
  MaterialsProcedure,
  MaterialsSurgeon,
  MaterialsBeforeAfterCase,
} from '@medical-crm/domain';
import { NotFoundError } from '@medical-crm/utils';
import {
  buildSurgeonMutation,
  mapCaseAssetsToImages,
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
        .eq('hospital_id', data.id)
        .eq('language_code', 'en')
        .single(),
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

    const translation = translationResult.status === 'fulfilled' && !translationResult.value.error
      ? translationResult.value.data
      : null;
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
      tagline: translation?.tagline ?? undefined,
      taglineEn: translation?.tagline ?? undefined,
      description: translation?.description ?? undefined,
      descriptionEn: translation?.description ?? undefined,
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
    const translationUpdates: Record<string, unknown> = {};
    if (updates.tagline !== undefined) translationUpdates['tagline'] = updates.tagline;
    else if (updates.taglineEn !== undefined) translationUpdates['tagline'] = updates.taglineEn;
    if (updates.description !== undefined) translationUpdates['description'] = updates.description;
    else if (updates.descriptionEn !== undefined) translationUpdates['description'] = updates.descriptionEn;

    if (Object.keys(translationUpdates).length > 0) {
      translationUpdates['updated_at'] = new Date().toISOString();
      const { data: transData, error: transError } = await this.supabase
        .from('hospital_translations')
        .update(translationUpdates)
        .eq('hospital_id', hospitalId)
        .eq('language_code', 'en')
        .select('id');

      if (!transError && (!transData || transData.length === 0)) {
        await this.supabase
          .from('hospital_translations')
          .insert({ hospital_id: hospitalId, language_code: 'en', ...translationUpdates });
      }
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
      .select('id, hospital_id, name, title, image_url, experience_years, specialties, languages, education, certifications, bio, images')
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
      .select('id, hospital_id, name, title, image_url, experience_years, specialties, languages, education, certifications, bio, images')
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
      .select('id, hospital_id, name, title, image_url, experience_years, specialties, languages, education, certifications, bio, images')
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
      .select('id, hospital_id, procedure_id, case_number, provider_name, description')
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
        images: mapCaseAssetsToImages({
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
      })
      .select('id, hospital_id, provider_name, description')
      .single();

    if (error) throw error;

    // Insert case images
    if (data.images.length > 0) {
      const imageRows = data.images.map((img, idx) => ({
        case_id: row!.id,
        image_url: img.url,
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
      procedureName: data.procedureName,
      surgeonName: row!.provider_name,
      description: row!.description,
      images: data.images,
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
      .select('id, hospital_id, procedure_id, provider_name, description, procedures(procedure_name)')
      .single();

    if (error) {
      if (error.code === 'PGRST116') throw new NotFoundError(`Before/After case ${id} not found for hospital ${hospitalId}`);
      throw error;
    }
    if (!row) throw new NotFoundError(`Before/After case ${id} not found for hospital ${hospitalId}`);

    // If images are provided, replace all existing images
    if (updates.images !== undefined) {
      // Delete existing images
      await this.supabase
        .from('case_images')
        .delete()
        .eq('case_id', id);

      // Insert new images
      if (updates.images.length > 0) {
        const imageRows = updates.images.map((img, idx) => ({
          case_id: id,
          image_url: img.url,
          sort_order: idx,
        }));

        const { error: imgError } = await this.supabase
          .from('case_images')
          .insert(imageRows);

        if (imgError) throw imgError;
      }

      // Update image_count
      await this.supabase
        .from('procedure_cases')
        .update({ image_count: updates.images.length })
        .eq('id', id)
        .eq('hospital_id', hospitalId);
    }

    // Fetch current images if not replaced
    let images: Array<{ url: string }>;
    if (updates.images !== undefined) {
      images = updates.images;
    } else {
      const { data: imgData } = await this.supabase
        .from('case_images')
        .select('image_url, sort_order')
        .eq('case_id', id)
        .order('sort_order', { ascending: true });

      images = (imgData ?? []).map((img) => ({
        url: img.image_url,
      }));
    }

    const proc = (row as Record<string, unknown>).procedures as { procedure_name: string } | null;
    return {
      id: row.id,
      hospitalId: row.hospital_id ?? hospitalId,
      procedureName: proc?.procedure_name ?? updates.procedureName ?? '',
      surgeonName: row.provider_name,
      description: row.description,
      images,
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
}
