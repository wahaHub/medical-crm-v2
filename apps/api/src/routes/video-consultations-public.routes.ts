import { randomUUID } from 'node:crypto';
import { Hono } from 'hono';
import { z } from '@hono/zod-openapi';
import { getCrmDb } from '@medical-crm/infrastructure/database';
import { AccessToken } from 'livekit-server-sdk';
import { readLiveKitConfig } from '../video-interpretation/security.js';
import { patientJoinDecision } from '../video-interpretation/patient-video-access.js';
import { rateLimitByIp } from '../middleware/rate-limit.middleware.js';

// Public, unauthenticated guest access to video consultation rooms via a
// shareable link. The consultation UUID in the URL acts as the bearer
// capability — anyone with the link can join while the consultation is
// SCHEDULED or IN_PROGRESS and inside the join window (15 min before the
// start until 30 min after the scheduled end). This is an intentional
// temporary product decision.
const app = new Hono();

const DEFAULT_DURATION_MINUTES = 30;
const GUEST_JOIN_RATE_LIMIT = process.env.NODE_ENV === 'production'
  ? { maxRequests: 30, windowMs: 3600_000 } // 30 / hour / ip in production
  : { maxRequests: 200, windowMs: 600_000 };

const idSchema = z.string().uuid();
const guestJoinSchema = z.object({
  displayName: z.string().min(1).max(80),
});

interface ConsultationRow {
  id: string;
  room_name: string;
  status: string;
  title: string | null;
  doctor_name: string | null;
  scheduled_at: string | null;
  started_at: string | null;
  duration_minutes: number;
}

function getDbSql() {
  return getCrmDb().$client;
}

function nowIso(): string {
  return new Date().toISOString();
}

// GET /video-consultations/:id/public-info — minimal room metadata for the
// guest landing page. No patient-identifying fields are exposed.
app.get('/video-consultations/:id/public-info', async (c) => {
  const id = idSchema.parse(c.req.param('id'));
  const sql = getDbSql();

  const [consultation] = await sql<ConsultationRow[]>`
    SELECT id, room_name, status, title, doctor_name, scheduled_at, started_at, duration_minutes
    FROM public.video_consultations
    WHERE id = ${id}
  `;
  if (!consultation) {
    return c.json({ error: 'Consultation not found' }, 404);
  }

  const joinable = ['SCHEDULED', 'IN_PROGRESS'].includes(consultation.status)
    && patientJoinDecision({
      scheduledAt: consultation.scheduled_at,
      startedAt: consultation.started_at,
      durationMinutes: consultation.duration_minutes,
    }).allowed;

  return c.json({
    id: consultation.id,
    status: consultation.status,
    title: consultation.title,
    doctorName: consultation.doctor_name,
    scheduledAt: consultation.scheduled_at,
    durationMinutes: consultation.duration_minutes,
    joinable,
  });
});

// POST /video-consultations/:id/guest-join — issue a LiveKit token for a guest.
app.post(
  '/video-consultations/:id/guest-join',
  rateLimitByIp(GUEST_JOIN_RATE_LIMIT),
  async (c) => {
    const id = idSchema.parse(c.req.param('id'));
    const body = guestJoinSchema.parse(await c.req.json().catch(() => ({})));
    const sql = getDbSql();

    const [consultation] = await sql<ConsultationRow[]>`
      SELECT id, room_name, status, title, doctor_name, scheduled_at, started_at, duration_minutes
      FROM public.video_consultations
      WHERE id = ${id}
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

    const identity = `guest-${randomUUID()}`;
    const [participant] = await sql<{ id: string }[]>`
      INSERT INTO public.video_consultation_participants (
        consultation_id, identity, display_name, role, joined_at
      ) VALUES (
        ${id}, ${identity}, ${body.displayName}, 'GUEST', ${nowIso()}
      )
      RETURNING id
    `;

    const config = readLiveKitConfig();
    // LiveKit disconnects participants when their token expires, so the ttl
    // must cover the whole consultation plus a buffer for overrun.
    const ttlSeconds = (consultation.duration_minutes || DEFAULT_DURATION_MINUTES) * 60 + 30 * 60;
    const token = new AccessToken(config.apiKey, config.apiSecret, {
      identity,
      name: body.displayName,
      ttl: ttlSeconds,
    });
    token.addGrant({
      room: consultation.room_name,
      roomJoin: true,
      roomAdmin: false,
      roomList: false,
      canPublish: true,
      canSubscribe: true,
      // Guests must not publish data-channel messages: subtitle/interpretation
      // messages are trusted by identity prefix, and the translator agent
      // identity starts with 'translator-'.
      canPublishData: false,
      canUpdateOwnMetadata: false,
    });

    return c.json({
      success: true,
      token: await token.toJwt(),
      livekitUrl: config.livekitUrl,
      identity,
      roomName: consultation.room_name,
      participantId: participant?.id ?? null,
    }, 201);
  },
);

// POST /video-consultations/:id/guest-leave — mark a guest participant as left.
app.post('/video-consultations/:id/guest-leave', async (c) => {
  const id = idSchema.parse(c.req.param('id'));
  const body = z.object({ participantId: z.string().uuid() }).parse(await c.req.json().catch(() => ({})));
  const sql = getDbSql();

  const [participant] = await sql<{ id: string; joined_at: string }[]>`
    SELECT p.id, p.joined_at
    FROM public.video_consultation_participants p
    WHERE p.id = ${body.participantId} AND p.consultation_id = ${id}
  `;
  if (!participant) {
    return c.json({ error: 'Participant not found' }, 404);
  }

  const leftAt = nowIso();
  const durationSeconds = Math.max(
    0,
    Math.round((new Date(leftAt).getTime() - new Date(participant.joined_at).getTime()) / 1000),
  );
  await sql`
    UPDATE public.video_consultation_participants
    SET left_at = ${leftAt}, duration_seconds = ${durationSeconds}
    WHERE id = ${participant.id}
  `;

  return c.json({ ok: true });
});

export default app;
