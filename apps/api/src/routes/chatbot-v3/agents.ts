import type {
  ConsultScheduleInput,
  ConsultStatusInput,
  FaqCategorySearchInput,
  FaqGetByIdsInput,
  FaqSearchInput,
  HandoffCreateInput,
  RecommendationGenerateInput,
  RecommendationPickInput,
  RecommendationStatusInput,
  RecordsSaveInput,
  RecordsStatusInput,
  RecordsUploadInput,
  ToolGateway,
  ToolResult,
} from './tool-gateway.js';
import {
  FaqLlmAdapter,
  type FaqAnswerResult,
  type FaqLlmRunMetadata,
} from './faq-llm-adapter.js';
import {
  RecordsLlmAdapter,
  type RecordsLlmRunMetadata,
} from './records-llm-adapter.js';
import {
  RecommendationLlmAdapter,
  type RecommendationLlmRunMetadata,
} from './recommendation-llm-adapter.js';
import { type RecommendationWorkerResult } from './recommendation-prompts.js';
import {
  createFallbackFaqWorkerTask,
  createFallbackRecommendationWorkerTask,
  createFallbackRecordsWorkerTask,
  type WorkerTask,
} from './worker-task.js';

export type AgentName =
  | 'FaqAgent'
  | 'RecordsAgent'
  | 'RecommendationAgent'
  | 'ConsultAgent'
  | 'HandoffAgent';

export interface AgentAction<TInput = unknown> {
  type: string;
  input: TInput;
  meta?: {
    task?: WorkerTask;
  };
}

export interface FaqAgentInput {
  latestUserMessage: string;
  locale?: string;
  sessionId?: string;
  category?: string;
  hospitalId?: string;
}

export class FaqAgent {
  constructor(
    private readonly gateway: ToolGateway,
    private readonly adapter = new FaqLlmAdapter(),
  ) {}

  execute(action: AgentAction<FaqAgentInput | FaqCategorySearchInput | FaqSearchInput | FaqGetByIdsInput>): Promise<ToolResult<unknown>> {
    switch (action.type) {
      case 'faq.answer':
        return this.answerFaq(action.input as FaqAgentInput, action.meta?.task);
      case 'faq.categorySearch':
        return this.gateway.faq.categorySearch(action.input as FaqCategorySearchInput);
      case 'faq.search':
        return this.gateway.faq.search(action.input as FaqSearchInput);
      case 'faq.getByIds':
        return this.gateway.faq.getByIds(action.input as FaqGetByIdsInput);
      default:
        return Promise.resolve(invalidAction('FaqAgent', action.type));
    }
  }

  getLastLlmRunMetadata(): FaqLlmRunMetadata | null {
    return this.adapter.getLastRunMetadata();
  }

  private async answerFaq(
    input: FaqAgentInput,
    task: WorkerTask | undefined,
  ): Promise<ToolResult<FaqAnswerResult>> {
    const latestUserMessage = normalizeFaqUserMessage(input.latestUserMessage);
    const faqTask = task?.agent === 'FaqAgent'
      ? { ...task, latestUserMessage }
      : createFallbackFaqWorkerTask(latestUserMessage);
    const answer = await this.adapter.answer({
      task: faqTask,
      plan: {
        query: latestUserMessage,
        reason: 'faq retrieval disabled; answer from loaded domain skill context',
      },
      matches: [],
      details: [],
    });

    return {
      status: 'ok',
      data: answer,
    };
  }

}

export class RecordsAgent {
  constructor(
    private readonly gateway: ToolGateway,
    private readonly worker = new RecordsLlmAdapter(),
  ) {}

  async execute(action: AgentAction<RecordsUploadInput | RecordsSaveInput | RecordsStatusInput>): Promise<ToolResult<unknown>> {
    switch (action.type) {
      case 'records.upload':
        return this.gateway.records.upload(action.input as RecordsUploadInput);
      case 'records.save':
        return this.gateway.records.save(action.input as RecordsSaveInput);
      case 'records.status':
        return {
          status: 'ok',
          data: await this.worker.runStatus({
            task: action.meta?.task?.agent === 'RecordsAgent'
              ? action.meta.task
              : createFallbackRecordsWorkerTask(''),
          }),
        };
      default:
        return invalidAction('RecordsAgent', action.type);
    }
  }

  getLastLlmRunMetadata(): RecordsLlmRunMetadata | null {
    return this.worker.getLastRunMetadata();
  }
}

export class RecommendationAgent {
  constructor(
    private readonly gateway: ToolGateway,
    private readonly worker = new RecommendationLlmAdapter(),
  ) {}

  async execute(
    action: AgentAction<RecommendationGenerateInput | RecommendationPickInput | RecommendationStatusInput>,
  ): Promise<ToolResult<unknown>> {
    switch (action.type) {
      case 'recommendation.generate':
        return this.generateRecommendations(
          action.input as RecommendationGenerateInput,
          action.meta?.task,
        );
      case 'recommendation.pick':
        return this.gateway.recommendation.pick(action.input as RecommendationPickInput);
      case 'recommendation.status':
        return this.gateway.recommendation.status(action.input as RecommendationStatusInput);
      default:
        return Promise.resolve(invalidAction('RecommendationAgent', action.type));
    }
  }

  getLastLlmRunMetadata(): RecommendationLlmRunMetadata | null {
    return this.worker.getLastRunMetadata();
  }

  private async generateRecommendations(
    input: RecommendationGenerateInput,
    task: WorkerTask | undefined,
  ): Promise<ToolResult<RecommendationWorkerResult>> {
    const generated = await this.gateway.recommendation.generate(input);
    if (generated.status === 'error') {
      return generated;
    }

    const recommendationTask = task?.agent === 'RecommendationAgent'
      ? task
      : createFallbackRecommendationWorkerTask('');

    return {
      status: 'ok',
      data: {
        ...(await this.worker.runGenerate({
          task: recommendationTask,
          recommendations: generated.data.recommendations,
        })),
        recommendationTask: recommendationTask.recommendationTask,
      },
    };
  }
}

export class ConsultAgent {
  constructor(private readonly gateway: ToolGateway) {}

  execute(action: AgentAction<ConsultScheduleInput | ConsultStatusInput>): Promise<ToolResult<unknown>> {
    switch (action.type) {
      case 'consult.schedule':
        return this.gateway.consult.schedule(action.input as ConsultScheduleInput);
      case 'consult.status':
        return this.gateway.consult.status(action.input as ConsultStatusInput);
      default:
        return Promise.resolve(invalidAction('ConsultAgent', action.type));
    }
  }
}

export class HandoffAgent {
  constructor(private readonly gateway: ToolGateway) {}

  execute(action: AgentAction<HandoffCreateInput>): Promise<ToolResult<unknown>> {
    if (action.type !== 'handoff.create') {
      return Promise.resolve(invalidAction('HandoffAgent', action.type));
    }

    return this.gateway.handoff.create(action.input);
  }
}

function invalidAction(agentName: AgentName, actionType: string): ToolResult<never> {
  return {
    status: 'error',
    code: 'VALIDATION_ERROR',
    message: `${agentName} cannot execute ${actionType}`,
  };
}

function normalizeFaqUserMessage(value: string): string {
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : 'faq question';
}
