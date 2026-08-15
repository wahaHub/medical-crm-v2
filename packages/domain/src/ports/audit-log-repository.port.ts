import type { AuditEvent } from '../enums/index.js';

export interface AuditLogEntry {
  userId: string;
  event: AuditEvent;
  caseId?: string | null;
  documentId?: string | null;
  hospitalId?: string | null;
  metadata?: Record<string, unknown> | null;
}

export interface IAuditLogRepository {
  record(entry: AuditLogEntry): Promise<void>;
}
