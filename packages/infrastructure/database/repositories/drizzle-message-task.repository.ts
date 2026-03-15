import { eq, sql } from 'drizzle-orm';
import type { IMessageTaskQueue, MessageTask } from '@medical-crm/domain';
import type { CrmDb } from '../crm-client.js';
import { messageTasks } from '../schema/index.js';
import { generateId } from '@medical-crm/utils';

export class DrizzleMessageTaskRepository implements IMessageTaskQueue {
  constructor(private readonly db: CrmDb) {}

  async enqueueTranslation(messageId: string, targetLang: string): Promise<void> {
    const now = new Date().toISOString();
    await this.db
      .insert(messageTasks)
      .values({
        id: generateId(),
        messageId,
        taskKind: 'TRANSLATE',
        targetLanguage: targetLang,
        status: 'PENDING',
        retryCount: 0,
        createdAt: now,
        updatedAt: now,
      });
  }

  async enqueueSummarization(messageId: string): Promise<void> {
    const now = new Date().toISOString();
    await this.db
      .insert(messageTasks)
      .values({
        id: generateId(),
        messageId,
        taskKind: 'SUMMARIZE',
        targetLanguage: null,
        status: 'PENDING',
        retryCount: 0,
        createdAt: now,
        updatedAt: now,
      });
  }

  async pullPending(limit: number): Promise<MessageTask[]> {
    const rows = await this.db
      .select()
      .from(messageTasks)
      .where(eq(messageTasks.status, 'PENDING'))
      .orderBy(sql`${messageTasks.createdAt} ASC`)
      .limit(limit);

    return rows.map((r) => this.rowToMessageTask(r));
  }

  async markProcessing(taskId: string): Promise<void> {
    const now = new Date().toISOString();
    await this.db
      .update(messageTasks)
      .set({ status: 'PROCESSING', updatedAt: now })
      .where(eq(messageTasks.id, taskId));
  }

  async markCompleted(taskId: string): Promise<void> {
    const now = new Date().toISOString();
    await this.db
      .update(messageTasks)
      .set({ status: 'COMPLETED', updatedAt: now })
      .where(eq(messageTasks.id, taskId));
  }

  async markFailed(taskId: string, error: string): Promise<void> {
    const now = new Date().toISOString();
    await this.db
      .update(messageTasks)
      .set({
        status: 'FAILED',
        errorMessage: error,
        retryCount: sql`${messageTasks.retryCount} + 1`,
        updatedAt: now,
      })
      .where(eq(messageTasks.id, taskId));
  }

  private rowToMessageTask(row: typeof messageTasks.$inferSelect): MessageTask {
    return {
      id: row.id,
      messageId: row.messageId,
      taskKind: row.taskKind as import('@medical-crm/domain').MessageTaskKind,
      targetLanguage: row.targetLanguage ?? null,
      retryCount: row.retryCount,
    };
  }
}
