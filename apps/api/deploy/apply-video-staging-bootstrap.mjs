import process from 'node:process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, URL } from 'node:url';
import { getCrmDb } from '@medical-crm/infrastructure/database';

if (process.env.VIDEO_INTERPRETATION_DEPLOYMENT_TIER !== 'STAGING') {
  throw new Error('Refusing to apply the video-only bootstrap outside the explicit STAGING tier');
}

const projectRef = process.env.VIDEO_STAGING_SUPABASE_PROJECT_REF;
if (!projectRef || !/^[a-z0-9]{20}$/.test(projectRef)) {
  throw new Error('VIDEO_STAGING_SUPABASE_PROJECT_REF is missing or invalid');
}

function databaseUrlMatchesProjectRef(rawUrl) {
  try {
    const url = new URL(rawUrl);
    const username = decodeURIComponent(url.username);
    return url.hostname === `db.${projectRef}.supabase.co`
      || (url.hostname.endsWith('.pooler.supabase.com')
        && username === `postgres.${projectRef}`);
  } catch {
    return false;
  }
}

if (!process.env.DATABASE_URL
  || !process.env.DIRECT_URL
  || !databaseUrlMatchesProjectRef(process.env.DATABASE_URL)
  || !databaseUrlMatchesProjectRef(process.env.DIRECT_URL)) {
  throw new Error('Staging database URLs do not match the pinned Supabase project ref');
}

const __dirname = dirname(fileURLToPath(import.meta.url));
const bootstrapPath = resolve(
  __dirname,
  '../../../packages/infrastructure/database/video-staging-bootstrap.sql',
);
const sql = getCrmDb().$client;

try {
  const publicRelations = await sql`
    SELECT table_name
    FROM information_schema.tables
    WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
  `;
  const allowedRelations = new Set([
    '_prisma_migrations',
    'spatial_ref_sys',
    'audit_logs',
    'case_progress',
    'cases',
    'consultation_transcripts',
    'consultations',
    'conversations',
    'documents',
    'hospital_registration_tokens',
    'hospitals',
    'messages',
    'translation_tasks',
    'users',
    'video_consultations',
    'video_consultation_participants',
    'video_consultation_hosted_deployments',
    'video_consultation_ai_consents',
    'video_consultation_interpretation_jobs',
    'video_consultation_interpretation_events',
    'video_consultation_source_tracks',
    'video_consultation_provider_sessions',
    'video_interpretation_release_approvals',
    'video_consultation_interpretation_allowlist',
    'video_interpretation_self_hosts',
    'video_interpretation_reconcile_leases',
    'video_interpretation_schema_migrations',
  ]);
  const unexpectedRelations = publicRelations
    .map((row) => row.table_name)
    .filter((name) => !allowedRelations.has(name));
  if (unexpectedRelations.length > 0) {
    throw new Error('Refusing staging bootstrap because the public schema contains business tables');
  }

  const existingRelations = new Set(publicRelations.map((row) => row.table_name));
  const businessRelations = [
    'audit_logs',
    'case_progress',
    'cases',
    'consultation_transcripts',
    'consultations',
    'conversations',
    'documents',
    'hospital_registration_tokens',
    'hospitals',
    'messages',
    'translation_tasks',
  ];
  for (const relation of businessRelations) {
    if (!existingRelations.has(relation)) continue;
    const [businessRows] = await sql`
      SELECT EXISTS (SELECT 1 FROM public.${sql(relation)} LIMIT 1) AS has_rows
    `;
    if (businessRows?.has_rows) {
      throw new Error('Refusing staging bootstrap because business data exists');
    }
  }

  if (publicRelations.some((row) => row.table_name === 'users')) {
    const [users] = await sql`
      SELECT count(*)::int AS total,
             count(*) FILTER (
               WHERE email IS DISTINCT FROM 'video-staging-admin@invalid.example'
             )::int AS unexpected
      FROM users
    `;
    if (Number(users?.total ?? 0) > 1 || Number(users?.unexpected ?? 0) > 0) {
      throw new Error('Refusing staging bootstrap because non-synthetic users exist');
    }
  }

  if (publicRelations.some((row) => row.table_name === 'video_consultations')) {
    const consultations = await sql`
      SELECT room_name, case_id, patient_id, patient_name, patient_email, metadata
      FROM video_consultations
    `;
    const unsafeConsultation = consultations.find((consultation) => {
      const metadata = consultation.metadata;
      return !/^medora-deidentified-e2e-[0-9a-f]{16}$/.test(consultation.room_name)
        || consultation.case_id !== null
        || consultation.patient_id !== null
        || consultation.patient_name !== null
        || consultation.patient_email !== null
        || typeof metadata !== 'object'
        || metadata === null
        || Array.isArray(metadata)
        || metadata.synthetic !== true
        || metadata.classification !== 'DEIDENTIFIED_EVALUATION';
    });
    if (unsafeConsultation) {
      throw new Error('Refusing staging bootstrap because a non-synthetic consultation exists');
    }
  }

  await sql.file(bootstrapPath);
  const [verification] = await sql`
    SELECT
      to_regclass('public.video_consultation_participants') IS NOT NULL AS participants_table,
      EXISTS (
        SELECT 1 FROM pg_class table_class
        JOIN pg_namespace table_schema ON table_schema.oid = table_class.relnamespace
        WHERE table_schema.nspname = 'public'
          AND table_class.relname = 'video_consultation_participants'
          AND table_class.relrowsecurity = true
      ) AS participants_rls,
      NOT EXISTS (
        SELECT 1 FROM (VALUES ('anon'), ('authenticated'), ('service_role')) roles(role_name)
        WHERE to_regrole(roles.role_name) IS NOT NULL
          AND has_table_privilege(
            roles.role_name,
            'public.video_consultation_participants',
            'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER'
          )
      ) AS data_api_denied
  `;
  if (!verification?.participants_table
    || !verification.participants_rls
    || !verification.data_api_denied) {
    throw new Error('Video staging bootstrap verification failed');
  }
  globalThis.console.log(JSON.stringify({
    applied: true,
    participantsTable: true,
    participantsRls: true,
    dataApiDenied: true,
  }));
} finally {
  await sql.end();
}
