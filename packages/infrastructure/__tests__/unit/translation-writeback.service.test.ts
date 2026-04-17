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

function cloneRows(rows: HospitalI18nRow[]): HospitalI18nRow[] {
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
