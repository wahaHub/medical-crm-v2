import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { PatientAuthService, type PatientSite } from '../packages/domain/src/index.js';
import { getPatientAppOrigin } from '../packages/application/src/index.js';
import { getCrmDb } from '../packages/infrastructure/database/crm-client.js';
import { DrizzleUserEmailLookupRepository } from '../packages/infrastructure/database/repositories/index.js';

const REPO_ROOT = resolve(import.meta.dirname, '..');
const ENV_CANDIDATES = [
  resolve(REPO_ROOT, 'apps/api/.env'),
  resolve(REPO_ROOT, '.env'),
];

type CliOptions = {
  email: string;
  site: PatientSite;
  origin?: string;
  verify: boolean;
  json: boolean;
};

function loadRuntimeEnv(): void {
  if (typeof process.loadEnvFile !== 'function') return;
  for (const envPath of ENV_CANDIDATES) {
    if (existsSync(envPath)) {
      process.loadEnvFile(envPath);
    }
  }
}

function printUsage(): void {
  console.log([
    'Usage:',
    '  pnpm patient:login-link --email patient@example.com [--site china|beauty] [--origin https://example.com] [--no-verify] [--json]',
    '',
    'Options:',
    '  --email <email>      Patient email to generate a dashboard login link for.',
    '  --site <site>        Patient site. Defaults to china.',
    '  --origin <url>       Override frontend origin. Defaults to site origin env configuration.',
    '  --no-verify          Skip database lookup and generate the link directly.',
    '  --json               Print machine-readable JSON.',
  ].join('\n'));
}

function readArgValue(args: string[], name: string): string | undefined {
  const inlinePrefix = `--${name}=`;
  const inline = args.find((arg) => arg.startsWith(inlinePrefix));
  if (inline) return inline.slice(inlinePrefix.length);

  const index = args.indexOf(`--${name}`);
  if (index >= 0) return args[index + 1];
  return undefined;
}

function parseSite(rawSite: string | undefined): PatientSite {
  const site = (rawSite ?? 'china').trim().toLowerCase();
  if (site === 'china' || site === 'beauty') {
    return site;
  }
  throw new Error('--site must be either china or beauty');
}

function parseArgs(args: string[]): CliOptions {
  if (args.includes('--help') || args.includes('-h')) {
    printUsage();
    process.exit(0);
  }

  const email = readArgValue(args, 'email')?.trim().toLowerCase();
  if (!email) {
    throw new Error('--email is required');
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new Error('--email must be a valid email address');
  }

  return {
    email,
    site: parseSite(readArgValue(args, 'site')),
    origin: readArgValue(args, 'origin')?.trim().replace(/\/+$/, ''),
    verify: !args.includes('--no-verify'),
    json: args.includes('--json'),
  };
}

function getPatientJwtSecret(): string {
  const secret = process.env['PATIENT_JWT_SECRET']?.trim();
  if (secret) return secret;

  const allowDevSecret = process.env.NODE_ENV === 'development' || process.env.NODE_ENV === 'test' || !process.env.NODE_ENV;
  if (allowDevSecret) {
    return 'dev-patient-secret';
  }

  throw new Error('PATIENT_JWT_SECRET is required outside development/test');
}

async function assertExistingPatient(email: string, site: PatientSite): Promise<string | null> {
  const repo = new DrizzleUserEmailLookupRepository(getCrmDb());
  const emailState = await repo.findEmailState(email, site);

  if (emailState.state === 'PATIENT') {
    return emailState.userId;
  }

  if (emailState.state === 'NONE') {
    throw new Error(`No patient user found for ${email} on site ${site}. Use --no-verify to generate anyway.`);
  }

  throw new Error(`${email} belongs to a ${emailState.state.toLowerCase()} user, not a patient.`);
}

async function main(): Promise<void> {
  loadRuntimeEnv();
  const options = parseArgs(process.argv.slice(2));
  const patientId = options.verify
    ? await assertExistingPatient(options.email, options.site)
    : null;
  const authService = new PatientAuthService(getPatientJwtSecret());
  const token = await authService.createPatientLoginToken(options.email, options.site);
  const origin = options.origin ?? getPatientAppOrigin(options.site);
  const dashboardLoginLink = `${origin}/dashboard?token=${encodeURIComponent(token)}`;

  if (options.json) {
    console.log(JSON.stringify({
      email: options.email,
      site: options.site,
      patientId,
      verified: options.verify,
      expiresIn: '1h',
      dashboardLoginLink,
      token,
    }, null, 2));
    return;
  }

  console.log(`Email: ${options.email}`);
  console.log(`Site: ${options.site}`);
  console.log(`Verified patient: ${options.verify ? 'yes' : 'skipped'}`);
  if (patientId) console.log(`Patient ID: ${patientId}`);
  console.log('Expires in: 1h');
  console.log('');
  console.log(dashboardLoginLink);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
