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
  constructor(private readonly supabase: SupabaseClient) {}

  // ---------------------------------------------------------------------------
  // Hospital Info
  // ---------------------------------------------------------------------------

  async getHospitalInfo(hospitalId: string): Promise<MaterialsHospitalInfo | null> {
    const { data, error } = await this.supabase
      .from('hospitals')
      .select('id, name, slug, hero_image, photos, highlights')
      .eq('id', hospitalId)
      .single();

    if (error) {
      if (error.code === 'PGRST116') return null; // row not found
      throw error;
    }

    return {
      id: data.id,
      name: data.name,
      slug: data.slug,
      heroImage: data.hero_image,
      photos: data.photos ?? [],
      highlights: data.highlights ?? [],
    };
  }

  async updateHospitalInfo(hospitalId: string, updates: Partial<MaterialsHospitalInfo>): Promise<MaterialsHospitalInfo> {
    const updateData: Record<string, unknown> = {};
    if (updates.heroImage !== undefined) updateData['hero_image'] = updates.heroImage;
    if (updates.photos !== undefined) updateData['photos'] = updates.photos;
    if (updates.highlights !== undefined) updateData['highlights'] = updates.highlights;
    updateData['updated_at'] = new Date().toISOString();

    const { data, error } = await this.supabase
      .from('hospitals')
      .update(updateData)
      .eq('id', hospitalId)
      .select('id, name, slug, hero_image, photos, highlights')
      .single();

    if (error) throw error;
    if (!data) throw new NotFoundError(`Hospital ${hospitalId} not found`);

    return {
      id: data.id,
      name: data.name,
      slug: data.slug,
      heroImage: data.hero_image,
      photos: data.photos ?? [],
      highlights: data.highlights ?? [],
    };
  }

  // ---------------------------------------------------------------------------
  // Procedures (hospital_procedures + procedures join)
  // ---------------------------------------------------------------------------

  async listProcedures(hospitalId: string): Promise<MaterialsProcedure[]> {
    const { data, error } = await this.supabase
      .from('hospital_procedures')
      .select('id, hospital_id, procedure_id, price_range, price_min, price_max, is_popular, sort_order, procedures(procedure_name, description)')
      .eq('hospital_id', hospitalId)
      .order('sort_order', { ascending: true });

    if (error) throw error;

    return (data ?? []).map((row: Record<string, unknown>) => {
      const proc = row.procedures as { procedure_name: string; description: string | null } | null;
      return {
        id: row.id as string,
        hospitalId: row.hospital_id as string,
        procedureName: proc?.procedure_name ?? '',
        description: proc?.description ?? null,
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
      .select('id, hospital_id, procedure_id, price_range, price_min, price_max, is_popular, sort_order, procedures(procedure_name, description)')
      .single();

    if (error) {
      if (error.code === 'PGRST116') throw new NotFoundError(`Procedure ${id} not found for hospital ${hospitalId}`);
      throw error;
    }
    if (!row) throw new NotFoundError(`Procedure ${id} not found for hospital ${hospitalId}`);

    const proc = (row as Record<string, unknown>).procedures as { procedure_name: string; description: string | null } | null;

    // NOTE: Do NOT update the shared procedures table — it is a global catalog.

    return {
      id: row.id,
      hospitalId: row.hospital_id,
      procedureName: proc?.procedure_name ?? '',
      description: proc?.description ?? null,
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
  // Before/After Cases (procedure_cases + case_images)
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
          image_type: img.type,
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
