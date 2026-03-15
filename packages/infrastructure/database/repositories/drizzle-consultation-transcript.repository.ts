import { eq } from 'drizzle-orm';
import type { IConsultationTranscriptRepository, TranscriptEntry, TranscriptStatus } from '@medical-crm/domain';
import { ConsultationTranscript } from '@medical-crm/domain';
import type { CrmDb } from '../crm-client.js';
import { consultationTranscripts } from '../schema/index.js';

export class DrizzleConsultationTranscriptRepository implements IConsultationTranscriptRepository {
  constructor(private readonly db: CrmDb) {}

  async findByConsultationId(consultationId: string): Promise<ConsultationTranscript | null> {
    const rows = await this.db
      .select()
      .from(consultationTranscripts)
      .where(eq(consultationTranscripts.consultationId, consultationId))
      .limit(1);

    if (rows.length === 0) return null;
    return this.rowToEntity(rows[0]!);
  }

  async save(transcript: ConsultationTranscript): Promise<ConsultationTranscript> {
    const now = new Date().toISOString();
    // DB stores status in lowercase, domain uses uppercase
    const dbStatus = transcript.status.toLowerCase();
    const values = {
      id: transcript.id,
      consultationId: transcript.consultationId,
      originalLang: transcript.originalLang,
      translatedLang: transcript.translatedLang,
      entries: transcript.entries as unknown as typeof consultationTranscripts.$inferInsert['entries'],
      status: dbStatus,
      generatedAt: transcript.generatedAt ? transcript.generatedAt.toISOString() : null,
      createdAt: transcript.createdAt.toISOString(),
      updatedAt: now,
    };

    const rows = await this.db
      .insert(consultationTranscripts)
      .values(values)
      .onConflictDoUpdate({
        target: consultationTranscripts.id,
        set: {
          entries: values.entries,
          status: values.status,
          generatedAt: values.generatedAt,
          updatedAt: now,
        },
      })
      .returning();

    return this.rowToEntity(rows[0]!);
  }

  private rowToEntity(row: typeof consultationTranscripts.$inferSelect): ConsultationTranscript {
    // DB stores status in lowercase, domain uses uppercase
    const domainStatus = row.status.toUpperCase() as TranscriptStatus;

    return new ConsultationTranscript({
      id: row.id,
      consultationId: row.consultationId,
      originalLang: row.originalLang,
      translatedLang: row.translatedLang ?? '',
      entries: (row.entries as TranscriptEntry[] | null) ?? [],
      status: domainStatus,
      generatedAt: row.generatedAt ? new Date(row.generatedAt) : null,
      createdAt: new Date(row.createdAt),
      updatedAt: new Date(row.updatedAt),
    });
  }
}
