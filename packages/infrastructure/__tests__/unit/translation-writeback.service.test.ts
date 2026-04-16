import { describe, it, expect, vi } from 'vitest';
import { TranslationTask } from '@medical-crm/domain';
import { TranslationWritebackService } from '../../services/translation-writeback.service.js';

function makeTask() {
  return new TranslationTask({
    id: 'task-1',
    sourceDb: 'supabase_china',
    entityType: 'hospital_info',
    entityId: 'hospital-1',
    hospitalType: 'REGULAR',
    fieldsToTranslate: {
      name: '示例医院',
      description: '中文描述',
      departments_info: [
        {
          department_code: 'orthopedics',
          department_name: 'orthopedics',
          description: '骨科描述',
          image_url: 'crm/dev/materials-regular/hospital-image/hospital-1/orthopedics.png',
          key_services: ['骨科服务'],
          specialists: 12,
          annual_patients: 3456,
        },
      ],
      equipment: [
        {
          name: '达芬奇手术机器人',
          image_url: 'crm/dev/materials-regular/hospital-image/hospital-1/equipment.png',
          description: '设备中文描述',
        },
      ],
    },
    targetLanguages: ['en', 'fr'],
    sourceLanguage: null,
    targetLanguage: null,
    detectedLanguage: null,
    status: 'pending',
    errorMessage: null,
    retryCount: 0,
    createdAt: new Date('2026-04-16T00:00:00Z'),
    startedAt: null,
    completedAt: null,
  });
}

describe('TranslationWritebackService', () => {
  it('does not send updated_at when writing China hospital_i18n rows', async () => {
    const upsert = vi.fn().mockResolvedValue({ error: null });
    const selectEq = vi.fn().mockResolvedValue({
      data: [
        {
          locale: 'en',
          facilities_info: null,
          name: 'Existing English Hospital',
          display_name: 'Existing English Hospital',
        },
        {
          locale: 'fr',
          facilities_info: null,
          name: 'Hopital Existant',
          display_name: 'Hopital Existant',
        },
      ],
      error: null,
    });
    const from = vi.fn((table: string) => {
      if (table !== 'hospital_i18n') {
        throw new Error(`Unexpected table: ${table}`);
      }

      return {
        select: vi.fn(() => ({
          eq: selectEq,
        })),
        upsert,
      };
    });

    const service = new TranslationWritebackService(
      {} as never,
      {} as never,
      { from } as never,
    );

    await service.writeback(
      makeTask(),
      {
        detectedLanguage: 'zh',
        translations: {
          en: {
            name: 'Example Hospital',
            description: 'English description',
            departments_info: [
              {
                department_name: 'Orthopedics',
                description: 'Orthopedics description',
              },
            ],
            equipment: [
              {
                name: 'Da Vinci Surgical Robot',
                description: 'English equipment description',
              },
            ],
          },
          fr: {
            name: 'Hopital Exemple',
            description: 'Description francaise',
          },
        },
      },
    );

    expect(upsert).toHaveBeenCalledTimes(2);
    for (const [row] of upsert.mock.calls) {
      expect(row).not.toHaveProperty('updated_at');
      expect(row).toHaveProperty('hospital_id', 'hospital-1');
      expect(row).toHaveProperty('locale');
    }

    const englishRow = upsert.mock.calls.find(([row]) => row.locale === 'en')?.[0];
    expect(englishRow?.departments_info).toEqual([
      {
        department_code: 'orthopedics',
        department_name: 'Orthopedics',
        description: 'Orthopedics description',
        image_url: 'crm/dev/materials-regular/hospital-image/hospital-1/orthopedics.png',
        key_services: ['骨科服务'],
        specialists: 12,
        annual_patients: 3456,
      },
    ]);
    expect(englishRow?.equipment_translated).toEqual([
      {
        idx: 0,
        name: 'Da Vinci Surgical Robot',
        description: 'English equipment description',
      },
    ]);
  });

  it('reuses the existing locale name when an equipment-only translation is written back', async () => {
    const upsert = vi.fn().mockResolvedValue({ error: null });
    const selectEq = vi.fn().mockResolvedValue({
      data: [
        {
          locale: 'en',
          facilities_info: null,
          name: 'Existing English Hospital',
          display_name: 'Existing English Hospital',
        },
      ],
      error: null,
    });
    const from = vi.fn((table: string) => ({
      select: vi.fn(() => ({
        eq: selectEq,
      })),
      upsert,
    }));

    const service = new TranslationWritebackService(
      {} as never,
      {} as never,
      { from } as never,
    );

    await service.writeback(
      new TranslationTask({
        id: 'task-2',
        sourceDb: 'supabase_china',
        entityType: 'hospital_info',
        entityId: 'hospital-1',
        hospitalType: 'REGULAR',
        fieldsToTranslate: {
          equipment: [
            {
              name: '达芬奇手术机器人',
              image_url: 'crm/dev/materials-regular/hospital-image/hospital-1/equipment.png',
              description: '设备中文描述',
            },
          ],
        },
        targetLanguages: ['en'],
        sourceLanguage: null,
        targetLanguage: null,
        detectedLanguage: null,
        status: 'pending',
        errorMessage: null,
        retryCount: 0,
        createdAt: new Date('2026-04-16T00:00:00Z'),
        startedAt: null,
        completedAt: null,
      }),
      {
        detectedLanguage: 'zh',
        translations: {
          en: {
            equipment: [
              {
                name: 'Da Vinci Surgical Robot',
                description: 'English equipment description',
              },
            ],
          },
        },
      },
    );

    expect(upsert).toHaveBeenCalledWith(expect.objectContaining({
      locale: 'en',
      name: 'Existing English Hospital',
      display_name: 'Existing English Hospital',
      equipment_translated: [
        {
          idx: 0,
          name: 'Da Vinci Surgical Robot',
          description: 'English equipment description',
        },
      ],
    }), { onConflict: 'hospital_id,locale' });
  });
});
