import type {
  ConsultScheduleInput,
  ConsultStatusInput,
  FaqCategorySearchInput,
  FaqGetByIdsInput,
  FaqItemRecord,
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
  type FaqPlan,
} from './faq-llm-adapter.js';

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
    taskPrompt: string;
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
        return this.answerFaq(action.input as FaqAgentInput, action.meta?.taskPrompt ?? '');
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

  private async answerFaq(
    input: FaqAgentInput,
    taskPrompt: string,
  ): Promise<ToolResult<FaqAnswerResult>> {
    const latestUserMessage = normalizeFaqUserMessage(input.latestUserMessage);
    const plan = await this.adapter.plan({
      taskPrompt,
      latestUserMessage,
    });
    const category = await this.resolveCategory(plan, input);
    const effectivePlan = category ? { ...plan, category } : plan;
    const searchResult = await this.gateway.faq.search({
      category: effectivePlan.category ?? input.category,
      query: effectivePlan.query,
      locale: input.locale,
      sessionId: input.sessionId,
      hospitalId: input.hospitalId,
    });
    const matches = searchResult.status === 'ok' ? searchResult.data.hits : [];
    const details = await this.loadFaqDetails(matches, input);
    const answer = await this.adapter.answer({
      taskPrompt,
      latestUserMessage,
      plan: effectivePlan,
      matches,
      details,
    });

    return {
      status: 'ok',
      data: answer,
    };
  }

  private async resolveCategory(inputPlan: FaqPlan, input: FaqAgentInput): Promise<string | undefined> {
    if (inputPlan.category) {
      return inputPlan.category;
    }

    if (input.category) {
      return input.category;
    }

    const result = await this.gateway.faq.categorySearch({
      query: inputPlan.query,
      locale: input.locale,
      sessionId: input.sessionId,
      hospitalId: input.hospitalId,
    });

    if (result.status !== 'ok') {
      return undefined;
    }

    return result.data.categories[0]?.name;
  }

  private async loadFaqDetails(
    matches: FaqItemRecord[],
    input: FaqAgentInput,
  ): Promise<FaqItemRecord[]> {
    const ids = matches
      .map((match) => match.id)
      .filter((id) => id.trim().length > 0)
      .slice(0, 3);

    if (ids.length === 0) {
      return [];
    }

    const result = await this.gateway.faq.getByIds({
      ids,
      locale: input.locale,
      sessionId: input.sessionId,
      hospitalId: input.hospitalId,
    });

    if (result.status !== 'ok') {
      return [];
    }

    return result.data.items;
  }
}

export class RecordsAgent {
  constructor(private readonly gateway: ToolGateway) {}

  execute(action: AgentAction<RecordsUploadInput | RecordsSaveInput | RecordsStatusInput>): Promise<ToolResult<unknown>> {
    switch (action.type) {
      case 'records.upload':
        return this.gateway.records.upload(action.input as RecordsUploadInput);
      case 'records.save':
        return this.gateway.records.save(action.input as RecordsSaveInput);
      case 'records.status':
        return this.gateway.records.status(action.input as RecordsStatusInput);
      default:
        return Promise.resolve(invalidAction('RecordsAgent', action.type));
    }
  }
}

export class RecommendationAgent {
  constructor(private readonly gateway: ToolGateway) {}

  execute(
    action: AgentAction<RecommendationGenerateInput | RecommendationPickInput | RecommendationStatusInput>,
  ): Promise<ToolResult<unknown>> {
    switch (action.type) {
      case 'recommendation.generate':
        return this.gateway.recommendation.generate(action.input as RecommendationGenerateInput);
      case 'recommendation.pick':
        return this.gateway.recommendation.pick(action.input as RecommendationPickInput);
      case 'recommendation.status':
        return this.gateway.recommendation.status(action.input as RecommendationStatusInput);
      default:
        return Promise.resolve(invalidAction('RecommendationAgent', action.type));
    }
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
