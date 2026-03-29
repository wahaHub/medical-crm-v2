import { randomUUID } from 'node:crypto';
import {
  AiChatTimelineEvent,
  AiFollowupTrigger,
  AiHandoff,
  type IAiChatSessionRepository,
  type IAiChatTimelineEventRepository,
  type IAiFollowupTriggerRepository,
  type IAiHandoffRepository,
  type IAiUserProfileRepository,
} from '@medical-crm/domain';
import type { PlannedTimelineEvent, WritebackPlannerInput } from './writeback-planner.service.js';
import { WritebackPlannerService } from './writeback-planner.service.js';
import { HandoffPolicyService } from './handoff-policy.service.js';

export interface WritebackExecutorInput extends WritebackPlannerInput {}

export interface WritebackExecutorResult {
  statusUpdated: Record<string, unknown>;
  timelineEventsWritten: string[];
  messageMetadata: {
    shortlist?: Array<Record<string, unknown>>;
    reasonCodes?: string[];
  };
  followupCreated: string | null;
  handoffCreated: string | null;
}

export class WritebackExecutorService {
  constructor(
    private readonly sessionRepo: IAiChatSessionRepository,
    private readonly _profileRepo: IAiUserProfileRepository,
    private readonly timelineRepo: IAiChatTimelineEventRepository,
    private readonly followupRepo: IAiFollowupTriggerRepository,
    private readonly handoffRepo: IAiHandoffRepository,
    private readonly planner: WritebackPlannerService,
    private readonly handoffPolicy: HandoffPolicyService,
  ) {}

  async execute(input: WritebackExecutorInput): Promise<WritebackExecutorResult> {
    void this._profileRepo;
    const plan = this.planner.plan(input);
    const statusUpdated = plan.statusPatch;

    await this.sessionRepo.patchStatus(input.sessionId, statusUpdated);

    const timelineEventsWritten: string[] = [];
    for (const event of plan.timelineEvents) {
      await this.timelineRepo.append(toTimelineEntity(event));
      timelineEventsWritten.push(event.eventType);
    }

    let followupCreated: string | null = null;
    if (plan.followupTrigger) {
      const created = await this.followupRepo.createPendingTrigger(new AiFollowupTrigger({
        id: randomUUID(),
        sessionId: plan.followupTrigger.sessionId,
        patientId: plan.followupTrigger.patientId,
        triggerType: plan.followupTrigger.triggerType,
        reason: plan.followupTrigger.reason,
        channel: plan.followupTrigger.channel,
        payload: plan.followupTrigger.payload,
        dueAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
        createdAt: new Date(),
      }));
      followupCreated = created.id;
    }

    const handoffDecision = this.handoffPolicy.decide({
      riskLevel: input.policyDecision.riskLevel,
      nextAction: input.policyDecision.nextAction,
    });

    let handoffCreated: string | null = null;
    if (handoffDecision.required && handoffDecision.handoffType && handoffDecision.priority && handoffDecision.reasonCode) {
      const created = await this.handoffRepo.save(new AiHandoff({
        id: randomUUID(),
        sessionId: input.sessionDbId,
        patientId: input.patientId,
        handoffType: handoffDecision.handoffType,
        priority: handoffDecision.priority,
        reasonCode: handoffDecision.reasonCode,
        brief: {
          assistantMessageId: input.assistantMessageId,
          reasonCodes: input.policyDecision.reasonCodes ?? [],
        },
        createdAt: new Date(),
      }));
      handoffCreated = created.id;
    }

    return {
      statusUpdated,
      timelineEventsWritten,
      messageMetadata: plan.messageMetadata,
      followupCreated,
      handoffCreated,
    };
  }
}

function toTimelineEntity(event: PlannedTimelineEvent): AiChatTimelineEvent {
  return new AiChatTimelineEvent({
    id: randomUUID(),
    sessionId: event.sessionId,
    patientId: event.patientId,
    eventType: event.eventType,
    summary: event.summary,
    payload: event.payload,
    actor: event.actor,
    confidence: event.confidence,
    createdAt: new Date(),
  });
}
