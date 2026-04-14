import type {
  ConsultScheduleInput,
  ConsultStatusInput,
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

export type AgentName =
  | 'FaqAgent'
  | 'RecordsAgent'
  | 'RecommendationAgent'
  | 'ConsultAgent'
  | 'HandoffAgent';

export interface AgentAction<TInput = unknown> {
  type: string;
  input: TInput;
}

export class FaqAgent {
  constructor(private readonly gateway: ToolGateway) {}

  execute(action: AgentAction<FaqSearchInput>): Promise<ToolResult<unknown>> {
    if (action.type !== 'faq.search') {
      return Promise.resolve(invalidAction('FaqAgent', action.type));
    }

    return this.gateway.faq.search(action.input);
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
