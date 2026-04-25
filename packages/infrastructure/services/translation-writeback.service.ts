import { sql, eq } from 'drizzle-orm';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { TranslationTask, BatchTranslateResult } from '@medical-crm/domain';
import type { CrmDb } from '../database/crm-client.js';
import {
  supportTickets,
  supportTicketReplies,
  consultations,
  questionCollectorTemplates,
  questionCollectorResponses,
  chatbotFaqItems,
  chatbotFaqCategories,
} from '../database/schema/index.js';

/**
 * TranslationWritebackService
 *
 * Routes translation results back to the correct database and table based on
 * task.sourceDb and task.entityType, merging translated fields into the
 * entity's `translations` JSONB column (CRM, material reviews/packages) or
 * the appropriate i18n row (Supabase Beauty: hospital_translations,
 * Supabase China: hospital_i18n).
 */
export class TranslationWritebackService {
  constructor(
    private readonly crmDb: CrmDb,
    private readonly beautySupabase: SupabaseClient,
    private readonly chinaSupabase: SupabaseClient,
    private readonly crmSupabase?: SupabaseClient,
  ) {}

  async writeback(task: TranslationTask, result: BatchTranslateResult): Promise<void> {
    switch (task.sourceDb) {
      case 'crm':
        await this.crmWriteback(task, result);
        break;
      case 'supabase_beauty':
        await this.beautyWriteback(task, result);
        break;
      case 'supabase_china':
        await this.chinaWriteback(task, result);
        break;
      default:
        throw new Error(`Unknown sourceDb: ${String(task.sourceDb)}`);
    }
  }

  // ---------------------------------------------------------------------------
  // CRM writeback
  // ---------------------------------------------------------------------------

  private async crmWriteback(task: TranslationTask, result: BatchTranslateResult): Promise<void> {
    switch (task.entityType) {
      case 'support_ticket':
        await this.crmMergeTranslations(supportTickets, task.entityId, result.translations);
        break;
      case 'support_ticket_reply':
        await this.crmMergeTranslations(supportTicketReplies, task.entityId, result.translations);
        break;
      case 'consultation':
        await this.crmMergeTranslations(consultations, task.entityId, result.translations);
        break;
      case 'qc_template':
        await this.crmMergeTranslations(questionCollectorTemplates, task.entityId, result.translations);
        break;
      case 'qc_response':
        await this.crmMergeTranslations(questionCollectorResponses, task.entityId, result.translations);
        break;
      case 'chatbot_faq_item':
        await this.crmMergeTranslations(chatbotFaqItems, task.entityId, result.translations);
        break;
      case 'chatbot_faq_category':
        await this.crmMergeTranslations(chatbotFaqCategories, task.entityId, result.translations);
        break;
      default:
        throw new Error(`Unknown CRM entityType for writeback: ${task.entityType}`);
    }
  }

  /**
   * Merges `translations` JSONB into an existing row.
   * SQL equivalent: UPDATE <table> SET translations = COALESCE(translations, '{}'::jsonb) || $1::jsonb WHERE id = $2
   */
  private async crmMergeTranslations(
    table: typeof supportTickets
      | typeof supportTicketReplies
      | typeof consultations
      | typeof questionCollectorTemplates
      | typeof questionCollectorResponses
      | typeof chatbotFaqItems
      | typeof chatbotFaqCategories,
    entityId: string,
    translations: Record<string, Record<string, unknown>>,
  ): Promise<void> {
    await this.crmDb
      .update(table)
      .set({
        translations: sql`COALESCE(${table.translations}, '{}'::jsonb) || ${JSON.stringify(translations)}::jsonb`,
      })
      .where(eq(table.id, entityId));
  }

  // ---------------------------------------------------------------------------
  // Supabase Beauty writeback
  // ---------------------------------------------------------------------------

  private async beautyWriteback(task: TranslationTask, result: BatchTranslateResult): Promise<void> {
    switch (task.entityType) {
      case 'surgeon':
        await this.beautyMergeSurgeonTranslations(task.entityId, result.translations);
        break;
      case 'procedure_case':
        await this.beautyMergeProcedureCaseTranslations(task.entityId, result.translations);
        break;
      case 'review':
        await this.beautyMergeMaterialReviewTranslations(task.entityId, result.translations);
        break;
      case 'package':
        await this.beautyMergeMaterialPackageTranslations(task.entityId, result.translations);
        break;
      case 'hospital_info':
        await this.beautyWritebackHospitalInfo(task.entityId, result.translations);
        break;
      default:
        throw new Error(`Unknown Supabase Beauty entityType for writeback: ${task.entityType}`);
    }
  }

  /**
   * Merge translated fields into surgeons.translations JSONB column (Beauty).
   * Read existing, deep-merge per language, write back.
   */
  private async beautyMergeSurgeonTranslations(
    surgeonId: string,
    translations: Record<string, Record<string, unknown>>,
  ): Promise<void> {
    const { data: existing, error: fetchError } = await this.beautySupabase
      .from('surgeons')
      .select('translations')
      .eq('id', surgeonId)
      .single();

    if (fetchError) throw fetchError;

    const currentTranslations = (existing?.translations as Record<string, unknown> | null) ?? {};
    const merged = this.mergeLanguageTranslations(currentTranslations, translations);

    const { error } = await this.beautySupabase
      .from('surgeons')
      .update({ translations: merged, updated_at: new Date().toISOString() })
      .eq('id', surgeonId);

    if (error) throw error;
  }

  /**
   * Merge translated fields into procedure_cases.translations JSONB column (Beauty).
   */
  private async beautyMergeProcedureCaseTranslations(
    caseId: string,
    translations: Record<string, Record<string, unknown>>,
  ): Promise<void> {
    const { data: existing, error: fetchError } = await this.beautySupabase
      .from('procedure_cases')
      .select('translations')
      .eq('id', caseId)
      .single();

    if (fetchError) throw fetchError;

    const currentTranslations = (existing?.translations as Record<string, unknown> | null) ?? {};
    const merged = this.mergeLanguageTranslations(currentTranslations, translations);

    const { error } = await this.beautySupabase
      .from('procedure_cases')
      .update({ translations: merged, updated_at: new Date().toISOString() })
      .eq('id', caseId);

    if (error) throw error;
  }

  /**
   * Upsert into hospital_translations per language_code (Beauty).
   *
   * Field mapping (mirrors updateHospitalInfo in supabase-materials.repository.ts):
   *   translated.tagline    -> hospital_translations.tagline
   *   translated.description -> hospital_translations.description
   *
   * Any additional translated fields are stored as-is where the column name matches.
   * Upserts on (hospital_id, language_code) conflict.
   */
  private async beautyWritebackHospitalInfo(
    hospitalId: string,
    translations: Record<string, Record<string, unknown>>,
  ): Promise<void> {
    for (const [languageCode, translatedFields] of Object.entries(translations)) {
      const row: Record<string, unknown> = {
        hospital_id: hospitalId,
        language_code: languageCode,
        updated_at: new Date().toISOString(),
      };

      // Apply the same field-mapping rules as updateHospitalInfo.
      if (translatedFields['tagline'] !== undefined) row['tagline'] = translatedFields['tagline'];
      if (translatedFields['description'] !== undefined) row['description'] = translatedFields['description'];

      if (!('tagline' in row) && !('description' in row)) continue;

      const { error } = await this.beautySupabase
        .from('hospital_translations')
        .upsert(row, { onConflict: 'hospital_id,language_code' });

      if (error) throw error;
    }
  }

  /**
   * Merge translated fields into hospital_material_reviews.translations JSONB column (Beauty).
   */
  private async beautyMergeMaterialReviewTranslations(
    reviewId: string,
    translations: Record<string, Record<string, unknown>>,
  ): Promise<void> {
    await this.beautyMergeMaterialTranslations(
      'hospital_material_reviews',
      reviewId,
      this.sanitizeReviewTranslations(translations),
    );
  }

  /**
   * Merge translated fields into hospital_material_packages.translations JSONB column (Beauty).
   */
  private async beautyMergeMaterialPackageTranslations(
    packageId: string,
    translations: Record<string, Record<string, unknown>>,
  ): Promise<void> {
    await this.beautyMergeMaterialTranslations(
      'hospital_material_packages',
      packageId,
      this.sanitizePackageTranslations(translations),
    );
  }

  private async beautyMergeMaterialTranslations(
    tableName: 'hospital_material_reviews' | 'hospital_material_packages',
    entityId: string,
    translations: Record<string, Record<string, unknown>>,
  ): Promise<void> {
    const materialsSupabase = this.crmSupabase ?? this.beautySupabase;
    const { data: existing, error: fetchError } = await materialsSupabase
      .from(tableName)
      .select('translations')
      .eq('id', entityId)
      .single();

    if (fetchError) throw fetchError;

    const currentTranslations = (existing?.translations as Record<string, unknown> | null) ?? {};
    const merged = this.mergeLanguageTranslations(currentTranslations, translations);

    const { error } = await materialsSupabase
      .from(tableName)
      .update({ translations: merged, updated_at: new Date().toISOString() })
      .eq('id', entityId);

    if (error) throw error;
  }

  // ---------------------------------------------------------------------------
  // Supabase China writeback
  // ---------------------------------------------------------------------------

  private async chinaWriteback(task: TranslationTask, result: BatchTranslateResult): Promise<void> {
    switch (task.entityType) {
      case 'surgeon':
        await this.chinaMergeSurgeonTranslations(task.entityId, result.translations);
        break;
      case 'procedure_case':
        await this.chinaMergeProcedureCaseTranslations(task.entityId, result.translations);
        break;
      case 'review':
        await this.chinaMergeMaterialReviewTranslations(task.entityId, result.translations);
        break;
      case 'package':
        await this.chinaMergeMaterialPackageTranslations(task.entityId, result.translations);
        break;
      case 'hospital_info':
        await this.chinaWritebackHospitalInfo(task, result.translations);
        break;
      default:
        throw new Error(`Unknown Supabase China entityType for writeback: ${task.entityType}`);
    }
  }

  /**
   * Merge translated fields into surgeons.translations JSONB column (China).
   */
  private async chinaMergeSurgeonTranslations(
    surgeonId: string,
    translations: Record<string, Record<string, unknown>>,
  ): Promise<void> {
    const { data: existing, error: fetchError } = await this.chinaSupabase
      .from('surgeons')
      .select('translations')
      .eq('id', surgeonId)
      .single();

    if (fetchError) throw fetchError;

    const currentTranslations = (existing?.translations as Record<string, unknown> | null) ?? {};
    const merged = this.mergeLanguageTranslations(currentTranslations, translations);

    const { error } = await this.chinaSupabase
      .from('surgeons')
      .update({ translations: merged, updated_at: new Date().toISOString() })
      .eq('id', surgeonId);

    if (error) throw error;
  }

  /**
   * Merge translated fields into procedure_cases.translations JSONB column (China).
   */
  private async chinaMergeProcedureCaseTranslations(
    caseId: string,
    translations: Record<string, Record<string, unknown>>,
  ): Promise<void> {
    const { data: existing, error: fetchError } = await this.chinaSupabase
      .from('procedure_cases')
      .select('translations')
      .eq('id', caseId)
      .single();

    if (fetchError) throw fetchError;

    const currentTranslations = (existing?.translations as Record<string, unknown> | null) ?? {};
    const merged = this.mergeLanguageTranslations(currentTranslations, translations);

    const { error } = await this.chinaSupabase
      .from('procedure_cases')
      .update({ translations: merged, updated_at: new Date().toISOString() })
      .eq('id', caseId);

    if (error) throw error;
  }

  /**
   * Merge translated fields into hospital_material_reviews.translations JSONB column (China).
   */
  private async chinaMergeMaterialReviewTranslations(
    reviewId: string,
    translations: Record<string, Record<string, unknown>>,
  ): Promise<void> {
    await this.chinaMergeMaterialTranslations(
      'hospital_material_reviews',
      reviewId,
      this.sanitizeReviewTranslations(translations),
    );
  }

  /**
   * Merge translated fields into hospital_material_packages.translations JSONB column (China).
   */
  private async chinaMergeMaterialPackageTranslations(
    packageId: string,
    translations: Record<string, Record<string, unknown>>,
  ): Promise<void> {
    await this.chinaMergeMaterialTranslations(
      'hospital_material_packages',
      packageId,
      this.sanitizePackageTranslations(translations),
    );
  }

  private async chinaMergeMaterialTranslations(
    tableName: 'hospital_material_reviews' | 'hospital_material_packages',
    entityId: string,
    translations: Record<string, Record<string, unknown>>,
  ): Promise<void> {
    const materialsSupabase = this.crmSupabase ?? this.chinaSupabase;
    const { data: existing, error: fetchError } = await materialsSupabase
      .from(tableName)
      .select('translations')
      .eq('id', entityId)
      .single();

    if (fetchError) throw fetchError;

    const currentTranslations = (existing?.translations as Record<string, unknown> | null) ?? {};
    const merged = this.mergeLanguageTranslations(currentTranslations, translations);

    const { error } = await materialsSupabase
      .from(tableName)
      .update({ translations: merged, updated_at: new Date().toISOString() })
      .eq('id', entityId);

    if (error) throw error;
  }

  /**
   * Upsert into hospital_i18n per locale (China).
   *
   * Field mapping (mirrors updateHospitalInfo in china-medical-materials.repository.ts):
   *   translated.name / display_name        -> hospital_i18n.name + display_name
   *   translated.tagline / value_proposition -> hospital_i18n.value_proposition
   *   translated.description / short_description -> hospital_i18n.short_description
   *   translated.overview                   -> hospital_i18n.overview
   *   translated.full_description            -> hospital_i18n.full_description
   *   translated.hospital_type              -> hospital_i18n.hospital_type
   *   translated.tier                       -> hospital_i18n.tier
   *   translated.ownership_type             -> hospital_i18n.ownership_type
   *   translated.core_specialties           -> hospital_i18n.core_specialties
   *
   * For facilities_info (operating hours, promotional videos, video testimonials):
   *   The existing facilities_info JSONB is read first, merged, then written back.
   *
   * Upserts on (hospital_id, locale) conflict.
   */
  private async chinaWritebackHospitalInfo(
    task: TranslationTask,
    translations: Record<string, Record<string, unknown>>,
  ): Promise<void> {
    const hospitalId = task.entityId;

    // Fetch existing i18n rows so we can deep-merge facilities_info and seed locale names.
    const { data: existingRows, error: fetchError } = await this.chinaSupabase
      .from('hospital_i18n')
      .select('locale, name, display_name, facilities_info, departments_info')
      .eq('hospital_id', hospitalId);

    if (fetchError) throw fetchError;

    const existingByLocale = new Map<string, Record<string, unknown>>();
    for (const row of existingRows ?? []) {
      const r = row as Record<string, unknown>;
      existingByLocale.set(r['locale'] as string, r);
    }

    for (const [locale, translatedFields] of Object.entries(translations)) {
      const row: Record<string, unknown> = {
        hospital_id: hospitalId,
        locale,
      };
      const existingLocaleRow = existingByLocale.get(locale);
      const nameSeed = this.resolveHospitalLocaleNameSeed(existingRows ?? [], existingLocaleRow, task, locale);

      // Apply the same field-mapping rules as updateHospitalInfo in china-medical-materials.repository.ts
      if (translatedFields['name'] !== undefined) {
        row['name'] = translatedFields['name'];
        row['display_name'] = translatedFields['name'];
      }
      if (translatedFields['display_name'] !== undefined) row['display_name'] = translatedFields['display_name'];
      if (translatedFields['tagline'] !== undefined) row['value_proposition'] = translatedFields['tagline'];
      if (translatedFields['value_proposition'] !== undefined) row['value_proposition'] = translatedFields['value_proposition'];
      if (translatedFields['description'] !== undefined) {
        row['short_description'] = translatedFields['description'];
        // Only set overview from description if not explicitly provided
        if (translatedFields['overview'] === undefined) {
          row['overview'] = translatedFields['description'];
        }
      }
      if (translatedFields['fullDescription'] !== undefined) row['full_description'] = translatedFields['fullDescription'];
      if (translatedFields['hospitalType'] !== undefined) row['hospital_type'] = translatedFields['hospitalType'];
      if (translatedFields['ownershipType'] !== undefined) row['ownership_type'] = translatedFields['ownershipType'];
      if (translatedFields['coreSpecialties'] !== undefined) row['core_specialties'] = translatedFields['coreSpecialties'];
      if (translatedFields['short_description'] !== undefined) row['short_description'] = translatedFields['short_description'];
      if (translatedFields['overview'] !== undefined) row['overview'] = translatedFields['overview'];
      if (translatedFields['full_description'] !== undefined) row['full_description'] = translatedFields['full_description'];
      if (translatedFields['hospital_type'] !== undefined) row['hospital_type'] = translatedFields['hospital_type'];
      if (translatedFields['tier'] !== undefined) row['tier'] = translatedFields['tier'];
      if (translatedFields['ownership_type'] !== undefined) row['ownership_type'] = translatedFields['ownership_type'];
      if (translatedFields['core_specialties'] !== undefined) row['core_specialties'] = translatedFields['core_specialties'];

      // facilities_info: merge with existing row
      const existingFacilitiesInfo = (existingLocaleRow?.['facilities_info'] as Record<string, unknown> | null) ?? {};
      const hasFacilitiesUpdate =
        translatedFields['promotionalVideos'] !== undefined
        || translatedFields['videoTestimonials'] !== undefined
        || translatedFields['operatingHours'] !== undefined
        || translatedFields['hours'] !== undefined;

      if (hasFacilitiesUpdate) {
        const nextOperatingHours = translatedFields['operatingHours'] ?? translatedFields['hours'];
        row['facilities_info'] = {
          ...existingFacilitiesInfo,
          ...(translatedFields['promotionalVideos'] !== undefined ? { promotionalVideos: translatedFields['promotionalVideos'] } : {}),
          ...(translatedFields['videoTestimonials'] !== undefined ? { videoTestimonials: translatedFields['videoTestimonials'] } : {}),
          ...(nextOperatingHours !== undefined ? { operatingHours: nextOperatingHours } : {}),
        };
      }

      // departments_info: if translated fields contain structured department data
      if (translatedFields['departmentsInfo'] !== undefined) {
        row['departments_info'] = this.mergeDepartmentsInfo(
          task.fieldsToTranslate['departmentsInfo'],
          existingLocaleRow?.['departments_info'],
          translatedFields['departmentsInfo'],
        );
      }
      if (translatedFields['departments_info'] !== undefined) {
        row['departments_info'] = this.mergeDepartmentsInfo(
          task.fieldsToTranslate['departments_info'],
          existingLocaleRow?.['departments_info'],
          translatedFields['departments_info'],
        );
      }

      if (translatedFields['equipment_translated'] !== undefined) {
        row['equipment_translated'] = translatedFields['equipment_translated'];
      } else if (translatedFields['equipment'] !== undefined) {
        row['equipment_translated'] = translatedFields['equipment'];
      }

      if (Object.keys(row).length === 2) continue;

      if (row['name'] === undefined && nameSeed.name !== undefined) row['name'] = nameSeed.name;
      if (row['display_name'] === undefined) {
        row['display_name'] = nameSeed.displayName ?? row['name'];
      }
      if (row['name'] === undefined && row['display_name'] !== undefined) {
        row['name'] = row['display_name'];
      }

      const { error } = await this.chinaSupabase
        .from('hospital_i18n')
        .upsert(row, { onConflict: 'hospital_id,locale' });

      if (error) throw error;
    }
  }

  // ---------------------------------------------------------------------------
  // Shared helpers
  // ---------------------------------------------------------------------------

  /**
   * Deep-merge new language translations into existing translations JSONB.
   * For each language key, shallowly merges fields (existing fields are preserved,
   * new fields overwrite on conflict).
   */
  private mergeLanguageTranslations(
    existing: Record<string, unknown>,
    incoming: Record<string, Record<string, unknown>>,
  ): Record<string, unknown> {
    const result: Record<string, unknown> = { ...existing };
    for (const [lang, fields] of Object.entries(incoming)) {
      const existingLang = (result[lang] as Record<string, unknown> | undefined) ?? {};
      result[lang] = { ...existingLang, ...fields };
    }
    return result;
  }

  private sanitizeReviewTranslations(
    translations: Record<string, Record<string, unknown>>,
  ): Record<string, Record<string, unknown>> {
    const sanitized: Record<string, Record<string, unknown>> = {};

    for (const [lang, fields] of Object.entries(translations)) {
      const next: Record<string, unknown> = {};
      if ('treatmentName' in fields) next['treatmentName'] = fields['treatmentName'] ?? null;
      if ('reviewTitle' in fields) next['reviewTitle'] = fields['reviewTitle'] ?? null;
      if ('reviewComment' in fields) next['reviewComment'] = fields['reviewComment'] ?? null;
      if (Object.keys(next).length > 0) sanitized[lang] = next;
    }

    return sanitized;
  }

  private sanitizePackageTranslations(
    translations: Record<string, Record<string, unknown>>,
  ): Record<string, Record<string, unknown>> {
    const sanitized: Record<string, Record<string, unknown>> = {};

    for (const [lang, fields] of Object.entries(translations)) {
      const next: Record<string, unknown> = {};
      if ('title' in fields) next['title'] = fields['title'] ?? null;
      if ('subtitle' in fields) next['subtitle'] = fields['subtitle'] ?? null;
      if ('summary' in fields) next['summary'] = fields['summary'] ?? null;
      if ('includes' in fields && Array.isArray(fields['includes'])) {
        next['includes'] = (fields['includes'] as unknown[])
          .filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === 'object' && !Array.isArray(item))
          .map((item) => ({
            ...(item['id'] !== undefined ? { id: item['id'] } : {}),
            text: item['text'] ?? null,
          }));
      }
      if ('process' in fields && Array.isArray(fields['process'])) {
        next['process'] = (fields['process'] as unknown[])
          .filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === 'object' && !Array.isArray(item))
          .map((item) => ({
            ...(item['id'] !== undefined ? { id: item['id'] } : {}),
            stepTitle: item['stepTitle'] ?? null,
            description: item['description'] ?? null,
          }));
      }
      if ('cases' in fields && Array.isArray(fields['cases'])) {
        next['cases'] = (fields['cases'] as unknown[])
          .filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === 'object' && !Array.isArray(item))
          .map((item) => ({
            ...(item['id'] !== undefined ? { id: item['id'] } : {}),
            story: item['story'] ?? null,
            result: item['result'] ?? null,
          }));
      }
      if ('reviews' in fields && Array.isArray(fields['reviews'])) {
        next['reviews'] = (fields['reviews'] as unknown[])
          .filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === 'object' && !Array.isArray(item))
          .map((item) => ({
            ...(item['id'] !== undefined ? { id: item['id'] } : {}),
            comment: item['comment'] ?? null,
          }));
      }
      if (Object.keys(next).length > 0) sanitized[lang] = next;
    }

    return sanitized;
  }

  private resolveHospitalLocaleNameSeed(
    existingRows: Record<string, unknown>[],
    existingLocaleRow: Record<string, unknown> | undefined,
    task: TranslationTask,
    locale: string,
  ): { name?: unknown; displayName?: unknown } {
    const fallbackRow =
      existingLocaleRow
      ?? existingRows.find((row) => row['locale'] === locale)
      ?? existingRows.find((row) => row['locale'] === task.sourceLanguage)
      ?? existingRows[0];

    const taskName = task.fieldsToTranslate['name'] ?? task.fieldsToTranslate['display_name'];
    const taskDisplayName = task.fieldsToTranslate['display_name'] ?? task.fieldsToTranslate['name'];
    const rowName = fallbackRow?.['name'] ?? fallbackRow?.['display_name'];
    const rowDisplayName = fallbackRow?.['display_name'] ?? fallbackRow?.['name'];

    return {
      name: rowName ?? taskName,
      displayName: rowDisplayName ?? taskDisplayName ?? rowName ?? taskName,
    };
  }

  private mergeDepartmentsInfo(
    sourceValue: unknown,
    existingValue: unknown,
    translatedValue: unknown,
  ): Array<Record<string, unknown>> | undefined {
    if (!Array.isArray(translatedValue)) return undefined;

    const existingEntries = Array.isArray(existingValue) ? existingValue.filter(
      (entry): entry is Record<string, unknown> => Boolean(entry) && typeof entry === 'object' && !Array.isArray(entry),
    ) : [];
    const sourceEntries = Array.isArray(sourceValue) ? sourceValue.filter(
      (entry): entry is Record<string, unknown> => Boolean(entry) && typeof entry === 'object' && !Array.isArray(entry),
    ) : [];
    const translatedEntries = translatedValue.filter(
      (entry): entry is Record<string, unknown> => Boolean(entry) && typeof entry === 'object' && !Array.isArray(entry),
    );

    const mergedByCode = new Map<string, Record<string, unknown>>();
    const orderedCodes: string[] = [];
    const anonymousEntries: Array<Record<string, unknown>> = [];

    const overlayEntries = (entries: Array<Record<string, unknown>>) => {
      for (const entry of entries) {
        const code = entry['department_code'];
        if (typeof code === 'string' && code.length > 0) {
          if (!mergedByCode.has(code)) orderedCodes.push(code);
          mergedByCode.set(code, {
            ...(mergedByCode.get(code) ?? {}),
            ...entry,
          });
          continue;
        }

        anonymousEntries.push({ ...entry });
      }
    };

    overlayEntries(existingEntries);
    overlayEntries(sourceEntries);
    overlayEntries(translatedEntries);

    if (mergedByCode.size === 0 && anonymousEntries.length === 0) {
      return undefined;
    }

    return [
      ...orderedCodes.map((code) => ({ ...mergedByCode.get(code)! })),
      ...anonymousEntries,
    ];
  }
}
