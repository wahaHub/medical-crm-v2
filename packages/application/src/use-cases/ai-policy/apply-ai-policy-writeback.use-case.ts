import type { IAiChatSessionRepository } from '@medical-crm/domain';
import type {
  AiPolicyBackendNextAction,
  AiPolicyEngagementMode,
} from '../../dtos/ai-policy.dto.js';
import { WritebackExecutorService } from '../../services/policy-engine/writeback-executor.service.js';

interface IIdempotencyExecutor {
  execute<T>(key: string, operation: string, fn: () => Promise<T>): Promise<T>;
}

export interface ApplyAiPolicyWritebackInput {
  sessionId: string;
  assistantMessageId: string;
  idempotencyKey: string;
  policyDecision: {
    nextAction: AiPolicyBackendNextAction;
    engagementMode?: AiPolicyEngagementMode;
    writebackDepth?: 'minimal' | 'moderate' | 'complete';
    riskLevel?: string;
    reasonCodes?: string[];
    prequalificationReasonCodes?: string[];
    shortlist?: Array<Record<string, unknown>>;
  };
}

export class ApplyAiPolicyWritebackUseCase {
  constructor(
    private readonly sessionRepo: IAiChatSessionRepository,
    private readonly writebackExecutor: WritebackExecutorService,
    private readonly idempotencyExecutor: IIdempotencyExecutor,
  ) {}

  async execute(input: ApplyAiPolicyWritebackInput) {
    const session = await this.sessionRepo.findBySessionId(input.sessionId);
    if (!session) {
      throw new Error(`AI chat session not found: ${input.sessionId}`);
    }

    return this.idempotencyExecutor.execute(
      input.idempotencyKey,
      'ai_policy_writeback',
      async () => this.writebackExecutor.execute({
        sessionId: input.sessionId,
        sessionDbId: session.id,
        patientId: session.patientId,
        assistantMessageId: input.assistantMessageId,
        policyDecision: input.policyDecision,
      }),
    );
  }
}
