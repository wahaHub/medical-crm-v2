import type { PatientSite } from '@medical-crm/domain';

type MaybePromise<T> = T | Promise<T>;

export type ToolErrorCode =
  | 'VALIDATION_ERROR'
  | 'NOT_FOUND'
  | 'CONFLICT'
  | 'PERMISSION_DENIED'
  | 'TIMEOUT'
  | 'UPSTREAM_UNAVAILABLE'
  | 'UNKNOWN';

export type ToolResult<T> =
  | { status: 'ok'; data: T }
  | { status: 'error'; code: ToolErrorCode; message: string };

export interface ToolHandlerContext {
  signal: AbortSignal;
}

export type ToolHandler<TInput, TOutput> = (
  input: TInput,
  context: ToolHandlerContext,
) => MaybePromise<TOutput>;

export interface FaqCategorySearchInput {
  query: string;
  locale?: string;
  sessionId?: string;
  site?: PatientSite;
  hospitalId?: string;
}

export interface FaqCategorySearchOutput {
  categories: Array<{
    name: string;
    sortOrder?: number;
  }>;
}

export interface FaqSearchInput {
  category?: string;
  query: string;
  locale?: string;
  sessionId?: string;
  site?: PatientSite;
  hospitalId?: string;
}

export interface FaqItemRecord {
  id: string;
  question: string;
  answer: string;
  category?: string;
}

export interface FaqSearchOutput {
  hits: FaqItemRecord[];
}

export interface FaqGetByIdsInput {
  ids: string[];
  locale?: string;
  sessionId?: string;
  site?: PatientSite;
  hospitalId?: string;
}

export interface FaqGetByIdsOutput {
  items: FaqItemRecord[];
}

export interface RecordsUploadInput {
  sessionId: string;
  site?: PatientSite;
  turnId?: string;
  attachments?: Array<Record<string, unknown>>;
}

export interface RecordsUploadOutput {
  uploadId?: string;
  accepted?: boolean;
}

export interface RecordsSaveInput {
  sessionId: string;
  site?: PatientSite;
  turnId?: string;
  records?: Array<Record<string, unknown>>;
}

export interface RecordsSaveOutput {
  recordIds?: string[];
  saved?: boolean;
}

export interface RecordsStatusInput {
  sessionId: string;
  site?: PatientSite;
}

export interface RecordsStatusOutput {
  state: string;
}

export interface RecommendationGenerateInput {
  sessionId: string;
  site?: PatientSite;
  turnId?: string;
}

export interface RecommendationGenerateOutput {
  recommendations: Array<Record<string, unknown>>;
}

export interface RecommendationPickInput {
  sessionId: string;
  site?: PatientSite;
  turnId?: string;
  recommendationId: string;
}

export interface RecommendationPickOutput {
  pickedRecommendationId: string;
}

export interface RecommendationStatusInput {
  sessionId: string;
  site?: PatientSite;
}

export interface RecommendationStatusOutput {
  state: string;
}

export interface ConsultScheduleInput {
  sessionId: string;
  site?: PatientSite;
  turnId?: string;
  slotId: string;
}

export interface ConsultScheduleOutput {
  bookingId?: string;
  scheduled?: boolean;
}

export interface ConsultStatusInput {
  sessionId: string;
  site?: PatientSite;
}

export interface ConsultStatusOutput {
  state: string;
}

export interface StatusQueryInput {
  sessionId: string;
  site?: PatientSite;
}

export interface StatusQueryOutput {
  snapshot: Record<string, unknown>;
}

export interface HandoffCreateInput {
  sessionId: string;
  site?: PatientSite;
  turnId?: string;
  reason: string;
}

export interface HandoffCreateOutput {
  handoffId?: string;
  created?: boolean;
}

export interface ToolGateway {
  faq: {
    categorySearch: (input: FaqCategorySearchInput) => Promise<ToolResult<FaqCategorySearchOutput>>;
    search: (input: FaqSearchInput) => Promise<ToolResult<FaqSearchOutput>>;
    getByIds: (input: FaqGetByIdsInput) => Promise<ToolResult<FaqGetByIdsOutput>>;
  };
  records: {
    upload: (input: RecordsUploadInput) => Promise<ToolResult<RecordsUploadOutput>>;
    save: (input: RecordsSaveInput) => Promise<ToolResult<RecordsSaveOutput>>;
    status: (input: RecordsStatusInput) => Promise<ToolResult<RecordsStatusOutput>>;
  };
  recommendation: {
    generate: (input: RecommendationGenerateInput) => Promise<ToolResult<RecommendationGenerateOutput>>;
    pick: (input: RecommendationPickInput) => Promise<ToolResult<RecommendationPickOutput>>;
    status: (input: RecommendationStatusInput) => Promise<ToolResult<RecommendationStatusOutput>>;
  };
  consult: {
    schedule: (input: ConsultScheduleInput) => Promise<ToolResult<ConsultScheduleOutput>>;
    status: (input: ConsultStatusInput) => Promise<ToolResult<ConsultStatusOutput>>;
  };
  status: {
    query: (input: StatusQueryInput) => Promise<ToolResult<StatusQueryOutput>>;
  };
  handoff: {
    create: (input: HandoffCreateInput) => Promise<ToolResult<HandoffCreateOutput>>;
  };
}

export interface ToolGatewayHandlers {
  faq?: {
    categorySearch?: ToolHandler<FaqCategorySearchInput, FaqCategorySearchOutput>;
    search?: ToolHandler<FaqSearchInput, FaqSearchOutput>;
    getByIds?: ToolHandler<FaqGetByIdsInput, FaqGetByIdsOutput>;
  };
  records?: {
    upload?: ToolHandler<RecordsUploadInput, RecordsUploadOutput>;
    save?: ToolHandler<RecordsSaveInput, RecordsSaveOutput>;
    status?: ToolHandler<RecordsStatusInput, RecordsStatusOutput>;
  };
  recommendation?: {
    generate?: ToolHandler<RecommendationGenerateInput, RecommendationGenerateOutput>;
    pick?: ToolHandler<RecommendationPickInput, RecommendationPickOutput>;
    status?: ToolHandler<RecommendationStatusInput, RecommendationStatusOutput>;
  };
  consult?: {
    schedule?: ToolHandler<ConsultScheduleInput, ConsultScheduleOutput>;
    status?: ToolHandler<ConsultStatusInput, ConsultStatusOutput>;
  };
  status?: {
    query?: ToolHandler<StatusQueryInput, StatusQueryOutput>;
  };
  handoff?: {
    create?: ToolHandler<HandoffCreateInput, HandoffCreateOutput>;
  };
}

export interface CreateToolGatewayOptions {
  handlers: ToolGatewayHandlers;
  readTimeoutMs?: number;
  writeTimeoutMs?: number;
}

export function createToolGateway({
  handlers,
  readTimeoutMs = 3000,
  writeTimeoutMs = 8000,
}: CreateToolGatewayOptions): ToolGateway {
  return {
    faq: {
      categorySearch: wrapTool('faq.categorySearch', handlers.faq?.categorySearch, readTimeoutMs, false),
      search: wrapTool('faq.search', handlers.faq?.search, readTimeoutMs, false),
      getByIds: wrapTool('faq.getByIds', handlers.faq?.getByIds, readTimeoutMs, false),
    },
    records: {
      upload: wrapTool('records.upload', handlers.records?.upload, writeTimeoutMs, true),
      save: wrapTool('records.save', handlers.records?.save, writeTimeoutMs, true),
      status: wrapTool('records.status', handlers.records?.status, readTimeoutMs, false),
    },
    recommendation: {
      generate: wrapTool('recommendation.generate', handlers.recommendation?.generate, writeTimeoutMs, true),
      pick: wrapTool('recommendation.pick', handlers.recommendation?.pick, writeTimeoutMs, true),
      status: wrapTool('recommendation.status', handlers.recommendation?.status, readTimeoutMs, false),
    },
    consult: {
      schedule: wrapTool('consult.schedule', handlers.consult?.schedule, writeTimeoutMs, true),
      status: wrapTool('consult.status', handlers.consult?.status, readTimeoutMs, false),
    },
    status: {
      query: wrapTool('status.query', handlers.status?.query, readTimeoutMs, false),
    },
    handoff: {
      create: wrapTool('handoff.create', handlers.handoff?.create, writeTimeoutMs, true),
    },
  };
}

function wrapTool<TInput, TOutput>(
  toolName: string,
  handler: ToolHandler<TInput, TOutput> | undefined,
  timeoutMs: number,
  isMutating: boolean,
) {
  if (!handler) {
    return async (_input: TInput): Promise<ToolResult<TOutput>> => ({
      status: 'error',
      code: 'UPSTREAM_UNAVAILABLE',
      message: `${toolName} is unavailable`,
    });
  }

  return async (input: TInput): Promise<ToolResult<TOutput>> => {
    const controller = new AbortController();

    try {
      const data = await withTimeout(
        handler(input, { signal: controller.signal }),
        timeoutMs,
        toolName,
        controller,
        isMutating,
      );
      return { status: 'ok', data };
    } catch (error) {
      const timeoutError = controller.signal.reason instanceof ToolTimeoutError
        ? controller.signal.reason
        : null;
      return normalizeToolError<TOutput>(toolName, error, timeoutError);
    }
  };
}

async function withTimeout<T>(
  promise: MaybePromise<T>,
  timeoutMs: number,
  toolName: string,
  controller: AbortController,
  isMutating: boolean,
): Promise<T> {
  let timeoutId: ReturnType<typeof setTimeout> | undefined;
  const timeoutError = new ToolTimeoutError(toolName, timeoutMs, isMutating);

  try {
    return await Promise.race([
      Promise.resolve(promise),
      new Promise<T>((_, reject) => {
        timeoutId = setTimeout(() => {
          controller.abort(timeoutError);
          reject(timeoutError);
        }, timeoutMs);
      }),
    ]);
  } finally {
    if (timeoutId) {
      clearTimeout(timeoutId);
    }
  }
}

function normalizeToolError<T>(toolName: string, error: unknown, timeoutError?: ToolTimeoutError | null): ToolResult<T> {
  const effectiveError = timeoutError ?? error;
  const code = getToolErrorCode(effectiveError);
  const message = getToolErrorMessage(toolName, effectiveError);
  return {
    status: 'error',
    code,
    message,
  };
}

function getToolErrorCode(error: unknown): ToolErrorCode {
  if (hasToolErrorCode(error)) {
    return error.code;
  }

  const message = error instanceof Error ? error.message.toLowerCase() : '';
  const name = error instanceof Error ? error.name.toLowerCase() : '';

  if (name.includes('timeout') || message.includes('timed out') || message.includes('timeout')) {
    return 'TIMEOUT';
  }

  return 'UNKNOWN';
}

function getToolErrorMessage(toolName: string, error: unknown): string {
  if (error instanceof ToolTimeoutError) {
    return error.message;
  }

  if (hasToolErrorMessage(error)) {
    return error.message;
  }

  if (error instanceof Error && error.message.trim().length > 0) {
    return error.message;
  }

  return `${toolName} failed`;
}

function hasToolErrorCode(error: unknown): error is { code: ToolErrorCode } {
  if (!error || typeof error !== 'object' || !('code' in error)) {
    return false;
  }

  const { code } = error as { code: unknown };
  return code === 'VALIDATION_ERROR'
    || code === 'NOT_FOUND'
    || code === 'CONFLICT'
    || code === 'PERMISSION_DENIED'
    || code === 'TIMEOUT'
    || code === 'UPSTREAM_UNAVAILABLE'
    || code === 'UNKNOWN';
}

function hasToolErrorMessage(error: unknown): error is { message: string } {
  return Boolean(
    error
      && typeof error === 'object'
      && 'message' in error
      && typeof (error as { message: unknown }).message === 'string'
      && (error as { message: string }).message.trim().length > 0,
  );
}

class ToolTimeoutError extends Error {
  readonly code = 'TIMEOUT' as const;

  constructor(toolName: string, timeoutMs: number, isMutating: boolean) {
    const guidance = isMutating
      ? ' outcome may be unknown; rely on idempotency and a status check before retrying.'
      : '';
    super(`${toolName} timed out after ${timeoutMs}ms.${guidance}`);
    this.name = 'ToolTimeoutError';
  }
}
