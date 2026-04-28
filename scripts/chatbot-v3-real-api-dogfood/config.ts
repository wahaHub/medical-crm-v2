import { type DogfoodConfig, type DogfoodScenarioId, type RunMetadata } from './types.ts';

export interface ParseDogfoodConfigOptions {
  argv?: string[];
  env?: NodeJS.ProcessEnv;
}

export interface BuildRunMetadataOptions {
  config: DogfoodConfig;
  executedScenarioIds: DogfoodScenarioId[];
  redactedCookies: string[];
  gitCommit?: string | null;
}

function getArgValue(argv: string[], flag: string) {
  const withEquals = argv.find((arg) => arg.startsWith(`${flag}=`));

  if (withEquals) {
    return withEquals.slice(flag.length + 1);
  }

  const index = argv.indexOf(flag);
  if (index >= 0 && index + 1 < argv.length) {
    return argv[index + 1];
  }

  return undefined;
}

function normalizeBaseUrl(rawBaseUrl: string) {
  const trimmed = rawBaseUrl.trim();
  if (!trimmed) {
    throw new Error('Dogfood base URL is required.');
  }

  const parsed = new URL(trimmed);
  const pathname = parsed.pathname.replace(/\/+$/, '');
  parsed.pathname = pathname || '/';

  const serialized = parsed.toString();
  if (!parsed.search && !parsed.hash && parsed.pathname === '/') {
    return serialized.replace(/\/$/, '');
  }

  return serialized;
}

function requireNonEmpty(value: string | undefined, errorMessage: string) {
  const trimmed = value?.trim();
  if (!trimmed) {
    throw new Error(errorMessage);
  }

  return trimmed;
}

export function formatUtcRunId(value: Date | string | number) {
  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}Z$/.test(value)) {
    return value;
  }

  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) {
    throw new Error('Dogfood timestamp is invalid.');
  }

  return date.toISOString().slice(0, 19).replace(/:/g, '-') + 'Z';
}

export function parseDogfoodConfig(
  argv: string[] = process.argv.slice(2),
  env: NodeJS.ProcessEnv = process.env,
): DogfoodConfig {
  const baseUrl = requireNonEmpty(
    getArgValue(argv, '--base-url') ?? env.DOGFOOD_BASE_URL,
    'Dogfood base URL is required.',
  );
  const site = requireNonEmpty(
    getArgValue(argv, '--site') ?? env.DOGFOOD_SITE,
    'Dogfood site is required.',
  );
  const runTimestampRaw =
    getArgValue(argv, '--run-id') ??
    getArgValue(argv, '--timestamp') ??
    env.DOGFOOD_RUN_ID ??
    env.DOGFOOD_TIMESTAMP ??
    formatUtcRunId(new Date());

  return {
    baseUrl: normalizeBaseUrl(baseUrl),
    site,
    runTimestamp: formatUtcRunId(runTimestampRaw),
    artifactSchemaVersion: 1,
  };
}

export function requireDogfoodRuntimeDebugSecret(env: NodeJS.ProcessEnv = process.env): string {
  return requireNonEmpty(
    env.CHATBOT_V3_DOGFOOD_DEBUG_SECRET,
    'CHATBOT_V3_DOGFOOD_DEBUG_SECRET is required for real API dogfood runtimeDebug quality gates.',
  );
}

export function buildRunMetadata({
  config,
  executedScenarioIds,
  redactedCookies,
  gitCommit = null,
}: BuildRunMetadataOptions): RunMetadata {
  return {
    artifactSchemaVersion: 1,
    runTimestamp: config.runTimestamp,
    baseUrl: config.baseUrl,
    site: config.site,
    executedScenarioIds,
    redactedCookies,
    gitCommit,
  };
}
