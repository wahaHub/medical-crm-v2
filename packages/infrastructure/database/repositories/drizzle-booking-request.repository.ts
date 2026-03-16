import { eq, sql, ilike, and } from 'drizzle-orm';
import type { IBookingRequestRepository } from '@medical-crm/domain';
import { BookingRequest, BookingRequestNumber, BookingRequestHospital } from '@medical-crm/domain';
import type { CrmDb } from '../crm-client.js';
import { bookingRequests, bookingRequestHospitals } from '../schema/index.js';

export class DrizzleBookingRequestRepository implements IBookingRequestRepository {
  constructor(private readonly db: CrmDb) {}

  async findById(id: string, tx?: unknown): Promise<BookingRequest | null> {
    const db = (tx as CrmDb) ?? this.db;
    const rows = await db
      .select()
      .from(bookingRequests)
      .where(eq(bookingRequests.id, id))
      .limit(1);

    if (rows.length === 0) return null;
    return this.rowToEntity(rows[0]!);
  }

  async findByUserId(userId: string): Promise<BookingRequest[]> {
    const rows = await this.db
      .select()
      .from(bookingRequests)
      .where(eq(bookingRequests.userId, userId))
      .orderBy(sql`${bookingRequests.createdAt} DESC`);

    return rows.map((r) => this.rowToEntity(r));
  }

  async save(entity: BookingRequest, tx?: unknown): Promise<BookingRequest> {
    const db = (tx as CrmDb) ?? this.db;
    const now = new Date().toISOString();
    const values = {
      id: entity.id,
      userId: entity.userId,
      requestNumber: entity.requestNumber.value,
      conditionType: entity.conditionType as typeof bookingRequests.conditionType.enumValues[number],
      conditionCategory: entity.conditionCategory,
      conditionDescription: entity.conditionDescription,
      destinationPreference: entity.destinationPreference as typeof bookingRequests.$inferInsert['destinationPreference'],
      preferredLanguage: entity.preferredLanguage,
      status: entity.status as typeof bookingRequests.status.enumValues[number],
      createdAt: entity.createdAt.toISOString(),
      updatedAt: now,
    };

    const rows = await db
      .insert(bookingRequests)
      .values(values)
      .onConflictDoUpdate({
        target: bookingRequests.id,
        set: {
          userId: values.userId,
          status: values.status,
          updatedAt: now,
        },
      })
      .returning();

    return this.rowToEntity(rows[0]!);
  }

  async nextRequestNumber(): Promise<string> {
    const date = new Date();
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    const prefix = `BR-${y}${m}${d}-%`;

    const result = await this.db
      .select({
        maxSeq: sql<number>`COALESCE(MAX(CAST(SPLIT_PART(${bookingRequests.requestNumber}, '-', 3) AS INTEGER)), 0)`,
      })
      .from(bookingRequests)
      .where(ilike(bookingRequests.requestNumber, prefix));

    const nextSeq = (result[0]?.maxSeq ?? 0) + 1;
    const brn = BookingRequestNumber.generate(nextSeq);
    return brn.value;
  }

  // Hospital links
  async findHospitalsByBookingId(bookingRequestId: string): Promise<BookingRequestHospital[]> {
    const rows = await this.db
      .select()
      .from(bookingRequestHospitals)
      .where(eq(bookingRequestHospitals.bookingRequestId, bookingRequestId));

    return rows.map((r) => this.rowToHospitalEntity(r));
  }

  async saveHospitals(entities: BookingRequestHospital[]): Promise<BookingRequestHospital[]> {
    if (entities.length === 0) return [];

    const values = entities.map((e) => ({
      id: e.id,
      bookingRequestId: e.bookingRequestId,
      hospitalId: e.hospitalId,
      isRecommended: e.isRecommended,
      matchScore: e.matchScore,
      recommendationReason: e.recommendationReason,
      selectedByPatient: e.selectedByPatient,
      selectedAt: e.selectedAt ? e.selectedAt.toISOString() : null,
    }));

    const rows = await this.db
      .insert(bookingRequestHospitals)
      .values(values)
      .onConflictDoNothing()
      .returning();

    return rows.map((r) => this.rowToHospitalEntity(r));
  }

  async updateHospitalSelections(bookingRequestId: string, hospitalIds: string[]): Promise<void> {
    // First, deselect all
    await this.db
      .update(bookingRequestHospitals)
      .set({ selectedByPatient: false, selectedAt: null })
      .where(eq(bookingRequestHospitals.bookingRequestId, bookingRequestId));

    // Then, select the specified ones
    if (hospitalIds.length > 0) {
      const now = new Date().toISOString();
      for (const hospitalId of hospitalIds) {
        await this.db
          .update(bookingRequestHospitals)
          .set({ selectedByPatient: true, selectedAt: now })
          .where(
            and(
              eq(bookingRequestHospitals.bookingRequestId, bookingRequestId),
              eq(bookingRequestHospitals.hospitalId, hospitalId),
            ),
          );
      }
    }
  }

  private rowToEntity(row: typeof bookingRequests.$inferSelect): BookingRequest {
    return new BookingRequest({
      id: row.id,
      userId: row.userId ?? null,
      requestNumber: new BookingRequestNumber(row.requestNumber),
      conditionType: row.conditionType as import('@medical-crm/domain').BookingConditionType,
      conditionCategory: row.conditionCategory,
      conditionDescription: row.conditionDescription ?? null,
      destinationPreference: row.destinationPreference ?? null,
      preferredLanguage: row.preferredLanguage,
      status: row.status as import('@medical-crm/domain').BookingRequestStatus,
      createdAt: new Date(row.createdAt),
      updatedAt: new Date(row.updatedAt),
    });
  }

  private rowToHospitalEntity(row: typeof bookingRequestHospitals.$inferSelect): BookingRequestHospital {
    return new BookingRequestHospital({
      id: row.id,
      bookingRequestId: row.bookingRequestId,
      hospitalId: row.hospitalId,
      isRecommended: row.isRecommended,
      matchScore: row.matchScore ?? null,
      recommendationReason: row.recommendationReason ?? null,
      selectedByPatient: row.selectedByPatient,
      selectedAt: row.selectedAt ? new Date(row.selectedAt) : null,
    });
  }
}
