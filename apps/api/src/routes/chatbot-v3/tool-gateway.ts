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

export type ToolHandler<TInput, TOutput> = (input: TInput) => MaybePromise<TOutput>;

export interface FaqSearchInput {
  query: string;
  sessionId?: string;
}

export interface FaqSearchOutput {
  hits: Array<Record<string, unknown>>;
}

export interface RecordsUploadInput {
  sessionId: string;
  turnId?: string;
  attachments?: Array<Record<string, unknown>>;
}

export interface RecordsUploadOutput {
  uploadId?: string;
  accepted?: boolean;
}

export interface RecordsSaveInput {
  sessionId: string;
  turnId?: string;
  records?: Array<Record<string, unknown>>;
}

export interface RecordsSaveOutput {
  recordIds?: string[];
  saved?: boolean;
}

export interface RecordsStatusInput {
  sessionId: string;
}

export interface RecordsStatusOutput {
  state: string;
}

export interface RecommendationGenerateInput {
  sessionId: string;
  turnId?: string;
  context?: Record<string, unknown>;
}

export interface RecommendationGenerateOutput {
  recommendations: Array<Record<string, unknown>>;
}

export interface RecommendationPickInput {
  sessionId: string;
  turnId?: string;
  recommendationId: string;
}

export interface RecommendationPickOutput {
  pickedRecommendationId: string;
}

export interface RecommendationStatusInput {
  sessionId: string;
}

export interface RecommendationStatusOutput {
  state: string;
}

export interface ConsultScheduleInput {
  sessionId: string;
  turnId?: string;
  slotId: string;
}

export interface ConsultScheduleOutput {
  bookingId?: string;
  scheduled?: boolean;
}

export interface ConsultStatusInput {
  sessionId: string;
}

export interface ConsultStatusOutput {
  state: string;
}

export interface StatusQueryInput {
  sessionId: string;
}

export interface StatusQueryOutput {
  snapshot: Record<string, unknown>;
}

export interface HandoffCreateInput {
  sessionId: string;
  turnId?: string;
  reason: string;
}

export interface HandoffCreateOutput {
  handoffId?: string;
  created?: boolean;
}

export interface ToolGateway {
  faq: {
    search: (input: FaqSearchInput) => Promise<ToolResult<FaqSearchOutput>>;
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
    search?: ToolHandler<FaqSearchInput, FaqSearchOutput>;
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
      search: wrapTool('faq.search', handlers.faq?.search, readTimeoutMs),
    },
    records: {
      upload: wrapTool('records.upload', handlers.records?.upload, writeTimeoutMs),
      save: wrapTool('records.save', handlers.records?.save, writeTimeoutMs),
      status: wrapTool('records.status', handlers.records?.status, readTimeoutMs),
    },
    recommendation: {
      generate: wrapTool('recommendation.generate', handlers.recommendation?.generate, writeTimeoutMs),
      pick: wrapTool('recommendation.pick', handlers.recommendation?.pick, writeTimeoutMs),
      status: wrapTool('recommendation.status', handlers.recommendation?.status, readTimeoutMs),
    },
    consult: {
      schedule: wrapTool('consult.schedule', handlers.consult?.schedule, writeTimeoutMs),
      status: wrapTool('consult.status', handlers.consult?.status, readTimeoutMs),
    },
    status: {
      query: wrapTool('status.query', handlers.status?.query, readTimeoutMs),
    },
    handoff: {
      create: wrapTool('handoff.create', handlers.handoff?.create, writeTimeoutMs),
    },
  };
}

function wrapTool<TInput, TOutput>(
  toolName: string,
  handler: ToolHandler<TInput, TOutput> | undefined,
  timeoutMs: number,
) {
  if (!handler) {
    return async (_input: TInput): Promise<ToolResult<TOutput>> => ({
      status: 'error',
      code: 'UPSTREAM_UNAVAILABLE',
      message: `${toolName} is unavailable`,
    });
  }

  return async (input: TInput): Promise<ToolResult<TOutput>> => {
    try {
      const data = await withTimeout(handler(input), timeoutMs, toolName);
      return { status: 'ok', data };
    } catch (error) {
      return normalizeToolError<TOutput>(toolName, error);
    }
  };
}

async function withTimeout<T>(promise: MaybePromise<T>, timeoutMs: number, toolName: string): Promise<T> {
  let timeoutId: ReturnType<typeof setTimeout> | undefined;

  try {
    return await Promise.race([
      Promise.resolve(promise),
      new Promise<T>((_, reject) => {
        timeoutId = setTimeout(() => {
          reject(new Error(`${toolName} timed out after ${timeoutMs}ms`));
        }, timeoutMs);
      }),
    ]);
  } finally {
    if (timeoutId) {
      clearTimeout(timeoutId);
    }
  }
}

function normalizeToolError<T>(toolName: string, error: unknown): ToolResult<T> {
  const code = getToolErrorCode(error);
  const message = getToolErrorMessage(toolName, error);
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
