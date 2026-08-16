import type { IAuditLogRepository, AuditLogEntry } from '@medical-crm/domain';
import type { CrmDb } from '../crm-client.js';
import { auditLogs } from '../schema/index.js';

export class DrizzleAuditLogRepository implements IAuditLogRepository {
  constructor(private readonly db: CrmDb) {}

  async record(entry: AuditLogEntry, tx?: unknown): Promise<void> {
    await (tx ? (tx as CrmDb) : this.db).insert(auditLogs).values({
      userId: entry.userId,
      event: entry.event,
      caseId: entry.caseId ?? null,
      documentId: entry.documentId ?? null,
      hospitalId: entry.hospitalId ?? null,
      metadata: entry.metadata ?? null,
    });
  }
}
