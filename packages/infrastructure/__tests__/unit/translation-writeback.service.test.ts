import { beforeEach, describe, expect, it, vi } from 'vitest';
import { TranslationTask, type BatchTranslateResult } from '@medical-crm/domain';
import type { SupabaseClient } from '@supabase/supabase-js';
import { TranslationWritebackService } from '../../services/translation-writeback.service.js';

type HospitalI18nRow = Record<string, unknown>;

function makeTask(overrides: Partial<ConstructorParameters<typeof TranslationTask>[0]> = {}): TranslationTask {
  return new TranslationTask({
    id: 'task-1',
    sourceDb: 'supabase_china',
    entityType: 'hospital_info',
    entityId: 'hospital-1',
    chunkKey: 'core',
    hospitalType: 'REGULAR',
    fieldsToTranslate: {},
    targetLanguages: ['en'],
    sourceLanguage: 'zh',
    targetLanguage: 'en',
    detectedLanguage: null,
    status: 'pending',
    errorMessage: null,
    retryCount: 0,
    createdAt: new Date('2026-04-17T00:00:00.000Z'),
    startedAt: null,
    completedAt: null,
    ...overrides,
  });
}

function makeResult(translations: Record<string, Record<string, unknown>>): BatchTranslateResult {
  return {
    detectedLanguage: 'zh',
    translations,
  };
}

function cloneRows<T extends Record<string, unknown>>(rows: T[]): T[] {
  return rows.map((row) => structuredClone(row));
}

function makeChinaSupabase(rows: HospitalI18nRow[]): SupabaseClient & { upsertCalls: Array<Record<string, unknown>> } {
  const state = cloneRows(rows);
  const upsertCalls: Array<Record<string, unknown>> = [];

  const client = {
    from: vi.fn((table: string) => {
      if (table !== 'hospital_i18n') {
        throw new Error(`Unexpected table: ${table}`);
      }

      return {
        select: vi.fn(() => ({
          eq: vi.fn(async (column: string, value: string) => {
            if (column !== 'hospital_id') {
              throw new Error(`Unexpected filter column: ${column}`);
            }

            return {
              data: state.filter((row) => row.hospital_id === value).map((row) => structuredClone(row)),
              error: null,
            };
          }),
        })),
        upsert: vi.fn(async (row: Record<string, unknown>) => {
          upsertCalls.push(structuredClone(row));

          const nextRow = structuredClone(row);
          const index = state.findIndex(
            (existing) => existing.hospital_id === nextRow.hospital_id && existing.locale === nextRow.locale,
          );

          if (index >= 0) {
            state[index] = {
              ...state[index],
              ...nextRow,
            };
          } else {
            state.push(nextRow);
          }

          return { error: null };
        }),
      };
    }),
    upsertCalls,
  };

  return client as SupabaseClient & { upsertCalls: Array<Record<string, unknown>> };
}

type MaterialRow = Record<string, unknown> & {
  id: string;
  translations?: Record<string, Record<string, unknown>>;
};

function makeMaterialSupabase(rowsByTable: {
  hospital_material_reviews?: MaterialRow[];
  hospital_material_packages?: MaterialRow[];
}) {
  const state = {
    hospital_material_reviews: cloneRows(rowsByTable.hospital_material_reviews ?? []),
    hospital_material_packages: cloneRows(rowsByTable.hospital_material_packages ?? []),
  };
  const updateCalls: Array<{ table: string; id: string; payload: Record<string, unknown> }> = [];

  const from = vi.fn((table: string) => {
    if (!(table in state)) {
      throw new Error(`Unexpected table: ${table}`);
    }

    return {
      select: vi.fn(() => ({
        eq: vi.fn((column: string, value: string) => {
          if (column !== 'id') {
            throw new Error(`Unexpected filter column: ${column}`);
          }

          return {
            single: vi.fn(async () => {
              const row = state[table as keyof typeof state].find((entry) => entry.id === value);
              return {
                data: row ? structuredClone(row) : null,
                error: row ? null : { message: `Row not found for ${table}:${value}` },
              };
            }),
          };
        }),
      })),
      update: vi.fn((payload: Record<string, unknown>) => ({
        eq: vi.fn(async (column: string, value: string) => {
          if (column !== 'id') {
            throw new Error(`Unexpected update filter column: ${column}`);
          }

          updateCalls.push({
            table,
            id: value,
            payload: structuredClone(payload),
          });

          const rows = state[table as keyof typeof state];
          const index = rows.findIndex((entry) => entry.id === value);
          if (index >= 0) {
            rows[index] = {
              ...rows[index],
              ...structuredClone(payload),
            };
          }

          return { error: null };
        }),
      })),
    };
  });

  return {
    client: { from } as unknown as SupabaseClient,
    from,
    updateCalls,
  };
}

describe('TranslationWritebackService hospital chunk writeback', () => {
  let chinaSupabase: SupabaseClient & { upsertCalls: Array<Record<string, unknown>> };
  let service: TranslationWritebackService;

  beforeEach(() => {
    chinaSupabase = makeChinaSupabase([]);
    service = new TranslationWritebackService(
      {} as never,
      {} as SupabaseClient,
      chinaSupabase,
    );
  });

  it('merges translated departments_info onto source entries without dropping media, codes, or stats', async () => {
    chinaSupabase = makeChinaSupabase([
      {
        hospital_id: 'hospital-1',
        locale: 'en',
        name: 'Existing English Name',
        display_name: 'Existing English Name',
      },
    ]);
    service = new TranslationWritebackService({} as never, {} as SupabaseClient, chinaSupabase);

    await service.writeback(
      makeTask({
        chunkKey: 'departments_info',
        fieldsToTranslate: {
          departments_info: [
            {
              department_code: 'cardiology',
              department_name: 'Cardiology',
              description: 'Original description',
              image_url: 'https://example.com/cardiology.jpg',
              key_services: ['ECG', 'Cath Lab'],
              specialists: 12,
              annual_patients: 34000,
            },
          ],
        },
      }),
      makeResult({
        en: {
          departments_info: [
            {
              department_code: 'cardiology',
              department_name: 'Heart Center',
              description: 'Translated description',
            },
          ],
        },
      }),
    );

    expect(chinaSupabase.upsertCalls).toHaveLength(1);
    expect(chinaSupabase.upsertCalls[0]).not.toHaveProperty('updated_at');
    expect(chinaSupabase.upsertCalls[0]).toMatchObject({
      hospital_id: 'hospital-1',
      locale: 'en',
      name: 'Existing English Name',
      display_name: 'Existing English Name',
      departments_info: [
        {
          department_code: 'cardiology',
          department_name: 'Heart Center',
          description: 'Translated description',
          image_url: 'https://example.com/cardiology.jpg',
          key_services: ['ECG', 'Cath Lab'],
          specialists: 12,
          annual_patients: 34000,
        },
      ],
    });
  });

  it('preserves untouched translated departments when a partial task payload updates only one department', async () => {
    chinaSupabase = makeChinaSupabase([
      {
        hospital_id: 'hospital-1',
        locale: 'en',
        name: 'Existing English Name',
        display_name: 'Existing English Name',
        departments_info: [
          {
            department_code: 'cardiology',
            department_name: 'Heart Center',
            description: 'Existing translated cardiology description',
            image_url: 'https://example.com/cardiology-en.jpg',
            key_services: ['ECG'],
            specialists: 12,
            annual_patients: 34000,
          },
          {
            department_code: 'neurology',
            department_name: 'Brain Center',
            description: 'Existing translated neurology description',
            image_url: 'https://example.com/neurology-en.jpg',
            key_services: ['EEG'],
            specialists: 6,
            annual_patients: 12000,
          },
        ],
      },
    ]);
    service = new TranslationWritebackService({} as never, {} as SupabaseClient, chinaSupabase);

    await service.writeback(
      makeTask({
        chunkKey: 'departments_info',
        fieldsToTranslate: {
          departments_info: [
            {
              department_code: 'cardiology',
              department_name: '心内科',
              description: '源中文描述',
              image_url: 'https://example.com/cardiology-zh.jpg',
              key_services: ['心电图', '介入治疗'],
              specialists: 14,
              annual_patients: 36000,
            },
          ],
        },
      }),
      makeResult({
        en: {
          departments_info: [
            {
              department_code: 'cardiology',
              department_name: 'Cardiology',
              description: 'Updated translated cardiology description',
            },
          ],
        },
      }),
    );

    expect(chinaSupabase.upsertCalls).toHaveLength(1);
    expect(chinaSupabase.upsertCalls[0]).not.toHaveProperty('updated_at');
    expect(chinaSupabase.upsertCalls[0]).toMatchObject({
      hospital_id: 'hospital-1',
      locale: 'en',
      departments_info: [
        {
          department_code: 'cardiology',
          department_name: 'Cardiology',
          description: 'Updated translated cardiology description',
          image_url: 'https://example.com/cardiology-zh.jpg',
          key_services: ['心电图', '介入治疗'],
          specialists: 14,
          annual_patients: 36000,
        },
        {
          department_code: 'neurology',
          department_name: 'Brain Center',
          description: 'Existing translated neurology description',
          image_url: 'https://example.com/neurology-en.jpg',
          key_services: ['EEG'],
          specialists: 6,
          annual_patients: 12000,
        },
      ],
    });
  });

  it('writes equipment translations into equipment_translated while preserving locale names from a core row', async () => {
    chinaSupabase = makeChinaSupabase([
      {
        hospital_id: 'hospital-1',
        locale: 'en',
        name: 'Existing English Name',
        display_name: 'Existing Display Name',
        short_description: 'Core row already exists',
      },
    ]);
    service = new TranslationWritebackService({} as never, {} as SupabaseClient, chinaSupabase);

    await service.writeback(
      makeTask({
        chunkKey: 'equipment',
        fieldsToTranslate: {
          equipment: [
            {
              name: 'MRI Scanner',
              image_url: 'https://example.com/mri.jpg',
              description: 'Original equipment description',
            },
          ],
        },
      }),
      makeResult({
        en: {
          equipment: [
            {
              idx: 0,
              name: 'MRI Scanner EN',
              description: 'Translated equipment description',
            },
          ],
        },
      }),
    );

    expect(chinaSupabase.upsertCalls).toHaveLength(1);
    expect(chinaSupabase.upsertCalls[0]).not.toHaveProperty('updated_at');
    expect(chinaSupabase.upsertCalls[0]).toMatchObject({
      hospital_id: 'hospital-1',
      locale: 'en',
      name: 'Existing English Name',
      display_name: 'Existing Display Name',
      equipment_translated: [
        {
          idx: 0,
          name: 'MRI Scanner EN',
          description: 'Translated equipment description',
        },
      ],
    });
  });

  it('creates a departments-only locale row from base locale names when the target locale does not exist yet', async () => {
    chinaSupabase = makeChinaSupabase([
      {
        hospital_id: 'hospital-1',
        locale: 'zh',
        name: '原医院名称',
        display_name: '原医院显示名',
      },
    ]);
    service = new TranslationWritebackService({} as never, {} as SupabaseClient, chinaSupabase);

    await service.writeback(
      makeTask({
        chunkKey: 'departments_info',
        fieldsToTranslate: {
          departments_info: [
            {
              department_code: 'dermatology',
              department_name: '皮肤科',
              description: '原始描述',
              image_url: 'https://example.com/dermatology.jpg',
              key_services: ['激光'],
              specialists: 8,
              annual_patients: 12000,
            },
          ],
        },
      }),
      makeResult({
        en: {
          departments_info: [
            {
              department_code: 'dermatology',
              department_name: 'Dermatology',
              description: 'Translated dermatology description',
            },
          ],
        },
      }),
    );

    expect(chinaSupabase.upsertCalls).toHaveLength(1);
    expect(chinaSupabase.upsertCalls[0]).not.toHaveProperty('updated_at');
    expect(chinaSupabase.upsertCalls[0]).toMatchObject({
      hospital_id: 'hospital-1',
      locale: 'en',
      name: '原医院名称',
      display_name: '原医院显示名',
      departments_info: [
        expect.objectContaining({
          department_code: 'dermatology',
          image_url: 'https://example.com/dermatology.jpg',
        }),
      ],
    });
  });

  it('creates an equipment-only locale row from base locale names when the target locale does not exist yet', async () => {
    chinaSupabase = makeChinaSupabase([
      {
        hospital_id: 'hospital-1',
        locale: 'zh',
        name: '原医院名称',
        display_name: '原医院显示名',
      },
    ]);
    service = new TranslationWritebackService({} as never, {} as SupabaseClient, chinaSupabase);

    await service.writeback(
      makeTask({
        chunkKey: 'equipment',
        fieldsToTranslate: {
          equipment: [
            {
              name: 'CT Scanner',
              image_url: 'https://example.com/ct.jpg',
              description: '原始设备描述',
            },
          ],
        },
      }),
      makeResult({
        en: {
          equipment: [
            {
              idx: 0,
              name: 'CT Scanner EN',
              description: 'Translated CT description',
            },
          ],
        },
      }),
    );

    expect(chinaSupabase.upsertCalls).toHaveLength(1);
    expect(chinaSupabase.upsertCalls[0]).not.toHaveProperty('updated_at');
    expect(chinaSupabase.upsertCalls[0]).toMatchObject({
      hospital_id: 'hospital-1',
      locale: 'en',
      name: '原医院名称',
      display_name: '原医院显示名',
      equipment_translated: [
        {
          idx: 0,
          name: 'CT Scanner EN',
          description: 'Translated CT description',
        },
      ],
    });
  });
});

describe('TranslationWritebackService materials review/package writeback', () => {
  it('merges beauty review translations into hospital_material_reviews without overwriting existing language fields', async () => {
    const beautySupabase = makeMaterialSupabase({});
    const crmSupabase = makeMaterialSupabase({
      hospital_material_reviews: [
        {
          id: 'review-1',
          translations: {
            en: {
              treatmentName: 'Existing treatment',
              preserved_note: 'keep me',
            },
            ja: {
              reviewComment: '既存のコメント',
            },
          },
        },
      ],
    });
    const chinaSupabase = makeMaterialSupabase({});
    const service = new TranslationWritebackService(
      {} as never,
      beautySupabase.client,
      chinaSupabase.client,
      crmSupabase.client,
    );

    await service.writeback(
      makeTask({
        sourceDb: 'supabase_beauty',
        entityType: 'review',
        entityId: 'review-1',
      }),
      makeResult({
        en: {
          treatmentName: 'Updated treatment',
          reviewComment: 'Translated review comment',
          media: [{ caption: 'Translated caption' }],
        },
        ko: {
          reviewTitle: '번역된 제목',
          review_title: 'ignored legacy casing',
        },
      }),
    );

    expect(crmSupabase.from).toHaveBeenCalledWith('hospital_material_reviews');
    expect(crmSupabase.updateCalls).toHaveLength(1);
    expect(crmSupabase.updateCalls[0]).toMatchObject({
      table: 'hospital_material_reviews',
      id: 'review-1',
      payload: {
        translations: {
          en: {
            treatmentName: 'Updated treatment',
            preserved_note: 'keep me',
            reviewComment: 'Translated review comment',
          },
          ja: {
            reviewComment: '既存のコメント',
          },
          ko: {
            reviewTitle: '번역된 제목',
          },
        },
        updated_at: expect.any(String),
      },
    });
    expect(beautySupabase.updateCalls).toHaveLength(0);
    expect(chinaSupabase.updateCalls).toHaveLength(0);
  });

  it('merges beauty package translations into hospital_material_packages without overwriting existing language fields', async () => {
    const beautySupabase = makeMaterialSupabase({});
    const crmSupabase = makeMaterialSupabase({
      hospital_material_packages: [
        {
          id: 'package-1',
          translations: {
            en: {
              title: 'Existing package title',
              summary: 'Existing summary',
            },
            fr: {
              title: 'Titre existant',
            },
          },
        },
      ],
    });
    const chinaSupabase = makeMaterialSupabase({});
    const service = new TranslationWritebackService(
      {} as never,
      beautySupabase.client,
      chinaSupabase.client,
      crmSupabase.client,
    );

    await service.writeback(
      makeTask({
        sourceDb: 'supabase_beauty',
        entityType: 'package',
        entityId: 'package-1',
      }),
      makeResult({
        en: {
          subtitle: 'Translated subtitle',
          includes: [{ text: 'Translated inclusion' }],
          tags: [{ label: 'ignore me', category: 'service' }],
        },
        zh: {
          title: '翻译后的标题',
        },
      }),
    );

    expect(crmSupabase.from).toHaveBeenCalledWith('hospital_material_packages');
    expect(crmSupabase.updateCalls).toHaveLength(1);
    expect(crmSupabase.updateCalls[0]).toMatchObject({
      table: 'hospital_material_packages',
      id: 'package-1',
      payload: {
        translations: {
          en: {
            title: 'Existing package title',
            summary: 'Existing summary',
            subtitle: 'Translated subtitle',
            includes: [{ text: 'Translated inclusion' }],
          },
          fr: {
            title: 'Titre existant',
          },
          zh: {
            title: '翻译后的标题',
          },
        },
        updated_at: expect.any(String),
      },
    });
    expect(beautySupabase.updateCalls).toHaveLength(0);
    expect(chinaSupabase.updateCalls).toHaveLength(0);
  });

  it('merges china review translations into hospital_material_reviews without overwriting existing language fields', async () => {
    const beautySupabase = makeMaterialSupabase({});
    const chinaSupabase = makeMaterialSupabase({});
    const crmSupabase = makeMaterialSupabase({
      hospital_material_reviews: [
        {
          id: 'review-2',
          translations: {
            en: {
              reviewTitle: 'Existing title',
              source_tag: 'keep',
            },
            zh: {
              reviewComment: '旧的评论',
            },
          },
        },
      ],
    });
    const service = new TranslationWritebackService(
      {} as never,
      beautySupabase.client,
      chinaSupabase.client,
      crmSupabase.client,
    );

    await service.writeback(
      makeTask({
        sourceDb: 'supabase_china',
        entityType: 'review',
        entityId: 'review-2',
      }),
      makeResult({
        en: {
          reviewComment: 'Updated review comment',
        },
        ja: {
          reviewTitle: '新しいタイトル',
          media: [{ caption: 'キャプション' }],
        },
      }),
    );

    expect(crmSupabase.from).toHaveBeenCalledWith('hospital_material_reviews');
    expect(crmSupabase.updateCalls).toHaveLength(1);
    expect(crmSupabase.updateCalls[0]).toMatchObject({
      table: 'hospital_material_reviews',
      id: 'review-2',
      payload: {
        translations: {
          en: {
            reviewTitle: 'Existing title',
            source_tag: 'keep',
            reviewComment: 'Updated review comment',
          },
          zh: {
            reviewComment: '旧的评论',
          },
          ja: {
            reviewTitle: '新しいタイトル',
          },
        },
        updated_at: expect.any(String),
      },
    });
    expect(beautySupabase.updateCalls).toHaveLength(0);
    expect(chinaSupabase.updateCalls).toHaveLength(0);
  });

  it('merges china package translations into hospital_material_packages without overwriting existing language fields', async () => {
    const beautySupabase = makeMaterialSupabase({});
    const chinaSupabase = makeMaterialSupabase({});
    const crmSupabase = makeMaterialSupabase({
      hospital_material_packages: [
        {
          id: 'package-2',
          translations: {
            en: {
              title: 'Existing package title',
              extras: ['keep'],
            },
            ko: {
              summary: '기존 요약',
            },
          },
        },
      ],
    });
    const service = new TranslationWritebackService(
      {} as never,
      beautySupabase.client,
      chinaSupabase.client,
      crmSupabase.client,
    );

    await service.writeback(
      makeTask({
        sourceDb: 'supabase_china',
        entityType: 'package',
        entityId: 'package-2',
      }),
      makeResult({
        en: {
          summary: 'Updated summary',
          reviews: [{ reviewerCountry: 'KR', comment: 'Translated review' }],
        },
        fr: {
          subtitle: 'Sous-titre traduit',
        },
      }),
    );

    expect(crmSupabase.from).toHaveBeenCalledWith('hospital_material_packages');
    expect(crmSupabase.updateCalls).toHaveLength(1);
    expect(crmSupabase.updateCalls[0]).toMatchObject({
      table: 'hospital_material_packages',
      id: 'package-2',
      payload: {
        translations: {
          en: {
            title: 'Existing package title',
            extras: ['keep'],
            summary: 'Updated summary',
            reviews: [{ comment: 'Translated review' }],
          },
          ko: {
            summary: '기존 요약',
          },
          fr: {
            subtitle: 'Sous-titre traduit',
          },
        },
        updated_at: expect.any(String),
      },
    });
    expect(beautySupabase.updateCalls).toHaveLength(0);
    expect(chinaSupabase.updateCalls).toHaveLength(0);
  });
});
