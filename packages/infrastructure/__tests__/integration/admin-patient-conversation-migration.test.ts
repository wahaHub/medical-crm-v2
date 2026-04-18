import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import postgres from 'postgres';

const MIGRATION_PATH = new URL(
  '../../database/migrations/035_admin_patient_conversation_uniqueness.sql',
  import.meta.url,
);
const ROOT_ENV_PATH = '/Users/haowang/Desktop/medora-health-beauty/medical-crm-v2/.env';
const ROLLBACK_SENTINEL = new Error('rollback test transaction');

function loadDatabaseUrl(): string {
  const env = readFileSync(ROOT_ENV_PATH, 'utf8');
  const match = env.match(/^DATABASE_URL=(.*)$/m);
  if (!match?.[1]) {
    throw new Error('DATABASE_URL is required for migration integration test');
  }
  return match[1];
}

describe('ADMIN_PATIENT conversation uniqueness migration', () => {
  it('deduplicates duplicate conversations, re-points messages, and recreates the unique index', async () => {
    const sql = postgres(loadDatabaseUrl(), { max: 1 });
    const patientId = randomUUID();
    const caseId = randomUUID();
    const canonicalConversationId = randomUUID();
    const duplicateConversationId = randomUUID();
    const duplicateHospitalId = randomUUID();
    const canonicalMessageId = randomUUID();
    const duplicateMessageId = randomUUID();
    const migrationSql = readFileSync(MIGRATION_PATH, 'utf8');
    const now = new Date().toISOString();
    const earlier = '2026-04-18T08:00:00.000Z';
    const later = '2026-04-18T09:00:00.000Z';

    try {
      await sql.begin(async (tx) => {
        await tx`DROP INDEX IF EXISTS conversations_admin_patient_case_unique`;
        await tx`DROP INDEX IF EXISTS conversations_admin_patient_case_unique_idx`;

        await tx`
          INSERT INTO users (
            id,
            email,
            name,
            role,
            patient_site,
            country,
            preferred_language,
            updated_at
          ) VALUES (
            ${patientId},
            ${`migration-patient-${patientId}@integration.test`},
            ${'Migration Integration Patient'},
            ${'PATIENT'},
            ${'beauty'},
            ${'US'},
            ${'en'},
            ${now}
          )
        `;

        await tx`
          INSERT INTO cases (
            id,
            case_number,
            patient_id,
            patient_name,
            patient_country,
            patient_language,
            primary_diagnosis,
            diagnosis_code,
            symptoms,
            medical_history,
            status,
            stage,
            created_at,
            updated_at
          ) VALUES (
            ${caseId},
            ${`CASE-9999-${Math.floor(Math.random() * 100000 + 1000)}`},
            ${patientId},
            ${'Migration Integration Patient'},
            ${'US'},
            ${'en'},
            ${'Test diagnosis'},
            ${'T00.0'},
            ${JSON.stringify(['fatigue'])}::jsonb,
            ${'None'},
            ${'ACTIVE'},
            ${'PENDING_ASSIGNMENT'},
            ${earlier},
            ${earlier}
          )
        `;

        await tx`
          INSERT INTO conversations (
            id,
            case_id,
            category,
            hospital_id,
            title,
            last_message_id,
            last_message_at,
            last_message_preview,
            last_sender_id,
            created_at,
            updated_at
          ) VALUES
          (
            ${canonicalConversationId},
            ${caseId},
            ${'ADMIN_PATIENT'},
            ${null},
            ${'Legacy title'},
            ${null},
            ${earlier},
            ${'older preview'},
            ${null},
            ${earlier},
            ${earlier}
          ),
          (
            ${duplicateConversationId},
            ${caseId},
            ${'ADMIN_PATIENT'},
            ${duplicateHospitalId},
            ${'Merged title'},
            ${null},
            ${later},
            ${'newer preview'},
            ${null},
            ${later},
            ${later}
          )
        `;

        await tx`
          INSERT INTO messages (
            id,
            conversation_id,
            sender_id,
            content,
            original_language,
            message_type,
            moderation_status,
            attachments,
            created_at
          ) VALUES
          (
            ${canonicalMessageId},
            ${canonicalConversationId},
            ${patientId},
            ${'Canonical conversation message'},
            ${'en'},
            ${'TEXT'},
            ${'ALLOWED'},
            ${JSON.stringify([])}::jsonb,
            ${earlier}
          ),
          (
            ${duplicateMessageId},
            ${duplicateConversationId},
            ${patientId},
            ${'Duplicate conversation message'},
            ${'en'},
            ${'TEXT'},
            ${'ALLOWED'},
            ${JSON.stringify([])}::jsonb,
            ${later}
          )
        `;

        await tx.unsafe(migrationSql);

        const conversations = await tx.unsafe<{
          id: string;
          title: string | null;
          hospital_id: string | null;
          last_message_id: string | null;
          last_message_preview: string | null;
          last_message_at: string | null;
        }[]>(`
          SELECT id, title, hospital_id, last_message_id, last_message_preview, last_message_at
          FROM conversations
          WHERE case_id = '${caseId}' AND category = 'ADMIN_PATIENT'
          ORDER BY created_at ASC
        `);

        expect(conversations).toHaveLength(1);
        expect(conversations[0]?.id).toBe(duplicateConversationId);
        expect(conversations[0]?.title).toBe('Merged title');
        expect(conversations[0]?.hospital_id).toBe(duplicateHospitalId);
        expect(conversations[0]?.last_message_id).toBe(duplicateMessageId);
        expect(conversations[0]?.last_message_preview).toBe('Duplicate conversation message');
        expect(conversations[0]?.last_message_at).not.toBeNull();
        expect(new Date(conversations[0]!.last_message_at!).toISOString()).toBe('2026-04-18T09:00:00.000Z');

        const messages = await tx.unsafe<{ id: string; conversation_id: string }[]>(`
          SELECT id, conversation_id
          FROM messages
          WHERE id IN ('${canonicalMessageId}', '${duplicateMessageId}')
          ORDER BY id ASC
        `);

        expect(messages).toHaveLength(2);
        expect(messages).toEqual(expect.arrayContaining([
          { id: canonicalMessageId, conversation_id: duplicateConversationId },
          { id: duplicateMessageId, conversation_id: duplicateConversationId },
        ]));

        const indexes = await tx.unsafe<{ indexname: string }[]>(`
          SELECT indexname
          FROM pg_indexes
          WHERE schemaname = 'public'
            AND indexname = 'conversations_admin_patient_case_unique'
        `);
        expect(indexes).toHaveLength(1);

        throw ROLLBACK_SENTINEL;
      });
    } catch (error) {
      if (error !== ROLLBACK_SENTINEL) {
        throw error;
      }
    } finally {
      await sql.end();
    }
  }, 30000);
});
