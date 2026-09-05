import { Hono } from 'hono';
import { z } from '@hono/zod-openapi';
import { getCrmDb } from '@medical-crm/infrastructure/database';
import { AccessToken, RoomServiceClient } from 'livekit-server-sdk';
import {
  videoConsultationJoinEnabled,
  readLiveKitConfig,
} from '../video-interpretation/security.js';
import {
  canonicalPatientVideoIdentity,
  closePatientRoom,
  effectiveConsultationStatus,
  patientJoinDecision,
} from '../video-interpretation/patient-video-access.js';

const app = new Hono();

// Only Dr. Li is currently authorized to conduct video consultations.
const VIDEO_CONSULTATION_DOCTOR_IDS = ['dr-li'];
const DEFAULT_DURATION_MINUTES = 30;

const STATUS_ENUM = z.enum([
  'PENDING_CONFIRMATION',
  'SCHEDULED',
  'IN_PROGRESS',
  'COMPLETED',
  'CANCELLED',
  'REJECTED',
]);

type VideoConsultationStatus = z.infer<typeof STATUS_ENUM>;

interface VideoConsultation {
  id: string;
  case_id: string | null;
  patient_id: string | null;
  patient_name: string | null;
  patient_email: string | null;
  room_name: string;
  status: VideoConsultationStatus;
  scheduled_at: string | null;
  title: string | null;
  description: string | null;
  host_identity: string | null;
  timezone: string | null;
  doctor_id: string | null;
  doctor_name: string | null;
  duration_minutes: number;
  doctor_response_at: string | null;
  doctor_response_note: string | null;
  started_at: string | null;
  ended_at: string | null;
  duration_seconds: number | null;
  patient_language: string | null;
  metadata: Record<string, unknown> | null;
  created_at: string;
  updated_at: string;
}

interface VideoConsultationParticipant {
  id: string;
  consultation_id: string;
  identity: string;
  display_name: string | null;
  role: string | null;
  joined_at: string;
  left_at: string | null;
  duration_seconds: number | null;
  metadata: Record<string, unknown> | null;
}

function getDbSql() {
  return getCrmDb().$client;
}

function parseDate(value: string | Date): Date {
  return typeof value === 'string' ? new Date(value) : value;
}

function intervalsOverlap(
  aStart: Date,
  aEnd: Date,
  bStart: Date,
  bEnd: Date,
): boolean {
  return aStart < bEnd && bStart < aEnd;
}

function nowIso(): string {
  return new Date().toISOString();
}

async function closeConsultationRoomForPatient(
  consultation: Pick<VideoConsultation, 'id' | 'room_name'>,
  patientId: string,
): Promise<void> {
  // Cleanup is intentionally independent from the current join kill switch.
  // Without server credentials no remote cleanup call is possible; normal
  // deployments that can issue tokens retain these credentials across a kill.
  if (!process.env.LIVEKIT_URL || !process.env.LIVEKIT_API_KEY || !process.env.LIVEKIT_API_SECRET) {
    throw new Error('video_room_cleanup_unavailable');
  }
  const config = readLiveKitConfig();
  const room = new RoomServiceClient(
    config.livekitUrl.replace(/^wss:/, 'https:').replace(/^ws:/, 'http:'),
    config.apiKey,
    config.apiSecret,
  );
  await closePatientRoom(
    room,
    consultation.room_name,
    canonicalPatientVideoIdentity(patientId, consultation.id),
  );
}

const listQuerySchema = z.object({
  from: z.string().datetime().optional(),
  to: z.string().datetime().optional(),
  status: z.union([STATUS_ENUM, z.array(STATUS_ENUM)]).optional(),
  limit: z.coerce.number().int().positive().max(100).optional(),
});

const scheduleSchema = z.object({
  patientId: z.string().uuid(),
  patientName: z.string().nullable().optional(),
  patientEmail: z.string().email().nullable().optional(),
  caseId: z.string().uuid().optional(),
  scheduledAt: z.string().datetime().optional(),
  doctorId: z.string().min(1),
  doctorName: z.string().nullable().optional(),
  title: z.string().optional(),
  description: z.string().optional(),
  durationMinutes: z.number().int().positive().default(DEFAULT_DURATION_MINUTES),
  timezone: z.string().default('UTC'),
  metadata: z.record(z.unknown()).nullable().optional(),
  patientLanguage: z.string().nullable().optional(),
});

const rescheduleSchema = z.object({
  scheduledAt: z.string().datetime(),
  doctorId: z.string().min(1),
  doctorName: z.string().nullable().optional(),
  patientName: z.string().nullable().optional(),
  patientEmail: z.string().email().nullable().optional(),
  durationMinutes: z.number().int().positive().default(DEFAULT_DURATION_MINUTES),
});

const joinSchema = z.object({
  identity: z.string().min(1),
  displayName: z.string().optional(),
  role: z.enum(['PATIENT', 'DOCTOR', 'COORDINATOR', 'GUEST']).default('PATIENT'),
  metadata: z.record(z.unknown()).optional(),
});

const availabilityQuerySchema = z.object({
  doctorId: z.string().min(1),
  scheduledAt: z.string().datetime(),
  durationMinutes: z.coerce.number().int().positive().default(DEFAULT_DURATION_MINUTES),
  excludeId: z.string().uuid().optional(),
});

// GET /doctors
app.get('/doctors', async (c) => {
  const sql = getDbSql();
  const rows = await sql<{
    surgeon_id: string;
    name: string;
    title: string | null;
    image_url: string | null;
  }[]>`
    SELECT surgeon_id, name, title, image_url
    FROM public.surgeons
    WHERE surgeon_id IN ${sql(VIDEO_CONSULTATION_DOCTOR_IDS)}
    ORDER BY name ASC
  `;
  return c.json(rows);
});

// GET /availability?doctorId=...&scheduledAt=...&durationMinutes=...&excludeId=...
app.get('/availability', async (c) => {
  const query = availabilityQuerySchema.parse(c.req.query());
  const sql = getDbSql();

  const start = parseDate(query.scheduledAt);
  const end = new Date(start.getTime() + query.durationMinutes * 60_000);
  const windowStart = new Date(start.getTime() - 4 * 60 * 60_000).toISOString();
  const windowEnd = new Date(end.getTime() + 4 * 60 * 60_000).toISOString();

  const rows = await sql<VideoConsultation[]>`
    SELECT *
    FROM public.video_consultations
    WHERE doctor_id = ${query.doctorId}
      AND status IN ('PENDING_CONFIRMATION', 'SCHEDULED', 'IN_PROGRESS')
      AND scheduled_at >= ${windowStart}
      AND scheduled_at <= ${windowEnd}
      ${query.excludeId ? sql`AND id <> ${query.excludeId}` : sql``}
  `;

  const conflicting = rows.find((consultation) => {
    if (!consultation.scheduled_at) return false;
    const otherStart = new Date(consultation.scheduled_at);
    const otherEnd = new Date(
      otherStart.getTime() + (consultation.duration_minutes || DEFAULT_DURATION_MINUTES) * 60_000,
    );
    return intervalsOverlap(start, end, otherStart, otherEnd);
  });

  return c.json({ available: !conflicting, conflicting: conflicting ?? null });
});

// GET /
app.get('/', async (c) => {
  const session = c.get('patientSession');
  const query = listQuerySchema.parse(c.req.query());
  const sql = getDbSql();

  const statuses = query.status
    ? Array.isArray(query.status)
      ? query.status
      : [query.status]
    : null;

  const rows = await sql<VideoConsultation[]>`
    SELECT *
    FROM public.video_consultations
    WHERE patient_id = ${session.userId}
      ${query.from ? sql`AND scheduled_at >= ${query.from}` : sql``}
      ${query.to ? sql`AND scheduled_at <= ${query.to}` : sql``}
      ${statuses ? sql`AND status IN ${sql(statuses)}` : sql``}
    ORDER BY scheduled_at DESC
    ${query.limit ? sql`LIMIT ${query.limit}` : sql``}
  `;

  return c.json(rows.map((row) => ({
    ...row,
    status: effectiveConsultationStatus(row.status, {
      scheduledAt: row.scheduled_at,
      startedAt: row.started_at,
      durationMinutes: row.duration_minutes,
    }),
  })));
});

// POST /
app.post('/', async (c) => {
  const session = c.get('patientSession');
  const body = scheduleSchema.parse(await c.req.json());
  const sql = getDbSql();

  if (body.patientId !== session.userId) {
    return c.json({ error: 'Cannot schedule for another patient' }, 403);
  }

  const isImmediate = !body.scheduledAt;
  let scheduledAt: Date | null = null;
  if (body.scheduledAt) {
    scheduledAt = new Date(body.scheduledAt);
    if (Number.isNaN(scheduledAt.getTime()) || scheduledAt <= new Date()) {
      return c.json({ error: 'scheduled_time_must_be_future' }, 400);
    }
  }

  const status: VideoConsultationStatus = isImmediate ? 'IN_PROGRESS' : 'PENDING_CONFIRMATION';

  const [draft] = await sql<VideoConsultation[]>`
    INSERT INTO public.video_consultations (
      room_name,
      patient_id,
      patient_name,
      patient_email,
      case_id,
      created_by,
      scheduled_at,
      title,
      description,
      host_identity,
      timezone,
      doctor_id,
      doctor_name,
      duration_minutes,
      status,
      metadata,
      patient_language,
      started_at
    ) VALUES (
      ${'pending'},
      ${body.patientId},
      ${body.patientName ?? null},
      ${body.patientEmail ?? null},
      ${body.caseId ?? null},
      ${body.patientId},
      ${scheduledAt ? scheduledAt.toISOString() : null},
      ${body.title ?? null},
      ${body.description ?? null},
      ${body.doctorId},
      ${body.timezone},
      ${body.doctorId},
      ${body.doctorName ?? null},
      ${body.durationMinutes},
      ${status},
      ${body.metadata ? JSON.stringify(body.metadata) : null}::jsonb,
      ${body.patientLanguage ?? null},
      ${isImmediate ? nowIso() : null}
    )
    RETURNING *
  `;

  if (!draft) {
    return c.json({ error: 'Failed to create consultation' }, 500);
  }

  const roomName = `consultation-${draft.id}`;

  const [updated] = await sql<VideoConsultation[]>`
    UPDATE public.video_consultations
    SET room_name = ${roomName}
    WHERE id = ${draft.id}
    RETURNING *
  `;

  if (!updated) {
    return c.json({ error: 'Failed to update room name' }, 500);
  }

  return c.json(updated, 201);
});

// PATCH /:id
app.patch('/:id', async (c) => {
  const session = c.get('patientSession');
  const id = c.req.param('id');
  const body = rescheduleSchema.parse(await c.req.json());
  const sql = getDbSql();

  const scheduledAt = new Date(body.scheduledAt);
  if (Number.isNaN(scheduledAt.getTime()) || scheduledAt <= new Date()) {
    return c.json({ error: 'scheduled_time_must_be_future' }, 400);
  }

  const [existing] = await sql<VideoConsultation[]>`
    SELECT * FROM public.video_consultations WHERE id = ${id} AND patient_id = ${session.userId}
  `;
  if (!existing) {
    return c.json({ error: 'Consultation not found' }, 404);
  }

  const [updated] = await sql<VideoConsultation[]>`
    UPDATE public.video_consultations
    SET
      scheduled_at = ${scheduledAt.toISOString()},
      doctor_id = ${body.doctorId},
      doctor_name = ${body.doctorName ?? null},
      patient_name = ${body.patientName ?? null},
      patient_email = ${body.patientEmail ?? null},
      duration_minutes = ${body.durationMinutes},
      status = ${'PENDING_CONFIRMATION'},
      doctor_response_at = NULL,
      doctor_response_note = NULL,
      started_at = NULL,
      ended_at = NULL,
      duration_seconds = NULL
    WHERE id = ${id}
    RETURNING *
  `;

  return c.json(updated);
});

// POST /:id/cancel
app.post('/:id/cancel', async (c) => {
  const session = c.get('patientSession');
  const id = c.req.param('id');
  const sql = getDbSql();

  const [existing] = await sql<VideoConsultation[]>`
    SELECT * FROM public.video_consultations WHERE id = ${id} AND patient_id = ${session.userId}
  `;
  if (!existing) {
    return c.json({ error: 'Consultation not found' }, 404);
  }

  const [updated] = await sql<VideoConsultation[]>`
    UPDATE public.video_consultations
    SET status = ${'CANCELLED'}
    WHERE id = ${id}
    RETURNING *
  `;

  await closeConsultationRoomForPatient(existing, session.userId);

  return c.json(updated);
});

// GET /by-room/:roomName
app.get('/by-room/:roomName', async (c) => {
  const session = c.get('patientSession');
  const roomName = c.req.param('roomName');
  const sql = getDbSql();

  const [row] = await sql<VideoConsultation[]>`
    SELECT *
    FROM public.video_consultations
    WHERE room_name = ${roomName}
      AND patient_id = ${session.userId}
    ORDER BY created_at DESC
    LIMIT 1
  `;

  return c.json(row ?? null);
});

// GET /:id
app.get('/:id', async (c) => {
  const session = c.get('patientSession');
  const id = c.req.param('id');
  const sql = getDbSql();

  const [row] = await sql<VideoConsultation[]>`
    SELECT * FROM public.video_consultations WHERE id = ${id} AND patient_id = ${session.userId}
  `;

  if (!row) {
    return c.json({ error: 'Consultation not found' }, 404);
  }

  return c.json(row);
});

// POST /:id/join
app.post('/:id/join', async (c) => {
  if (!videoConsultationJoinEnabled()) {
    return c.json({ error: 'Patient video joining is not enabled' }, 503);
  }
  const session = c.get('patientSession');
  const id = c.req.param('id');
  const body = joinSchema.parse(await c.req.json());
  const sql = getDbSql();

  const [consultation] = await sql<VideoConsultation[]>`
    SELECT * FROM public.video_consultations WHERE id = ${id} AND patient_id = ${session.userId}
  `;
  if (!consultation) {
    return c.json({ error: 'Consultation not found' }, 404);
  }
  if (!['SCHEDULED', 'IN_PROGRESS'].includes(consultation.status)) {
    return c.json({ error: 'Consultation is not open for joining' }, 409);
  }
  const canonicalIdentity = canonicalPatientVideoIdentity(session.userId, consultation.id);
  if (body.identity !== canonicalIdentity || body.role !== 'PATIENT') {
    return c.json({ error: 'Patient identity or role is not authorized' }, 403);
  }
  const join = patientJoinDecision({
    scheduledAt: consultation.scheduled_at,
    startedAt: consultation.started_at,
    durationMinutes: consultation.duration_minutes,
  });
  if (!join.allowed) {
    return c.json({ error: `Consultation join window is closed: ${join.reason}` }, 409);
  }

  if (consultation.status === 'SCHEDULED') {
    await sql`
      UPDATE public.video_consultations
      SET status = ${'IN_PROGRESS'}, started_at = ${nowIso()}
      WHERE id = ${id}
    `;
  }

  const [participant] = await sql<VideoConsultationParticipant[]>`
    INSERT INTO public.video_consultation_participants (
      consultation_id,
      identity,
      display_name,
      role,
      joined_at,
      metadata
    ) VALUES (
      ${id},
      ${body.identity},
      ${body.displayName ?? body.identity},
      ${body.role},
      ${nowIso()},
      ${body.metadata ? JSON.stringify(body.metadata) : null}::jsonb
    )
    RETURNING *
  `;

  return c.json(participant, 201);
});

// POST /:id/token — issue a LiveKit join token for the patient's own consultation
app.post('/:id/token', async (c) => {
  if (!videoConsultationJoinEnabled()) {
    return c.json({ error: 'Patient video joining is not enabled' }, 503);
  }
  const session = c.get('patientSession');
  const id = c.req.param('id');
  const sql = getDbSql();

  const [consultation] = await sql<VideoConsultation[]>`
    SELECT * FROM public.video_consultations WHERE id = ${id} AND patient_id = ${session.userId}
  `;
  if (!consultation) {
    return c.json({ error: 'Consultation not found' }, 404);
  }
  if (!['SCHEDULED', 'IN_PROGRESS'].includes(consultation.status)) {
    return c.json({ error: 'Consultation is not open for joining' }, 409);
  }
  const join = patientJoinDecision({
    scheduledAt: consultation.scheduled_at,
    startedAt: consultation.started_at,
    durationMinutes: consultation.duration_minutes,
  });
  if (!join.allowed) {
    return c.json({ error: `Consultation join window is closed: ${join.reason}` }, 409);
  }

  const config = readLiveKitConfig();
  const identity = canonicalPatientVideoIdentity(session.userId, consultation.id);
  const token = new AccessToken(config.apiKey, config.apiSecret, {
    identity,
    name: consultation.patient_name ?? undefined,
    // JWT expiry limits reconnects; server-side room cleanup ends live RTC.
    ttl: join.ttlSeconds,
  });
  token.addGrant({
    room: consultation.room_name,
    roomJoin: true,
    roomAdmin: false,
    roomList: false,
    canPublish: true,
    canSubscribe: true,
    canPublishData: true,
    canUpdateOwnMetadata: false,
  });

  return c.json({
    success: true,
    token: await token.toJwt(),
    livekitUrl: config.livekitUrl,
    identity,
    roomName: consultation.room_name,
  });
});

// POST /:id/leave
app.post('/:id/leave', async (c) => {
  const session = c.get('patientSession');
  const id = c.req.param('id');
  const body = z.object({ participantId: z.string().uuid() }).parse(await c.req.json());
  const sql = getDbSql();

  const [consultation] = await sql<VideoConsultation[]>`
    SELECT * FROM public.video_consultations WHERE id = ${id} AND patient_id = ${session.userId}
  `;
  if (!consultation) {
    return c.json({ error: 'Consultation not found' }, 404);
  }

  const canonicalIdentity = canonicalPatientVideoIdentity(session.userId, consultation.id);
  const leftAt = nowIso();
  const [updated] = await sql<VideoConsultationParticipant[]>`
    UPDATE public.video_consultation_participants
    SET left_at = ${leftAt},
        duration_seconds = GREATEST(
          0,
          ROUND(EXTRACT(EPOCH FROM (${leftAt}::timestamptz - joined_at)))::integer
        )
    WHERE id = ${body.participantId}
      AND consultation_id = ${id}
      AND identity = ${canonicalIdentity}
      AND role = 'PATIENT'
      AND left_at IS NULL
    RETURNING *
  `;
  if (!updated) {
    return c.json({ error: 'Participant not found' }, 404);
  }

  return c.json(updated);
});

// POST /:id/complete
app.post('/:id/complete', async (c) => {
  const session = c.get('patientSession');
  const id = c.req.param('id');
  const sql = getDbSql();

  const [consultation] = await sql<VideoConsultation[]>`
    SELECT * FROM public.video_consultations WHERE id = ${id} AND patient_id = ${session.userId}
  `;
  if (!consultation) {
    return c.json({ error: 'Consultation not found' }, 404);
  }

  const endedAt = nowIso();
  const durationSeconds = consultation.started_at
    ? Math.max(
        0,
        Math.round((new Date(endedAt).getTime() - new Date(consultation.started_at).getTime()) / 1000),
      )
    : null;

  const [updated] = await sql<VideoConsultation[]>`
    UPDATE public.video_consultations
    SET status = ${'COMPLETED'}, ended_at = ${endedAt}, duration_seconds = ${durationSeconds}
    WHERE id = ${id}
    RETURNING *
  `;

  await closeConsultationRoomForPatient(consultation, session.userId);

  return c.json(updated);
});

export default app;
