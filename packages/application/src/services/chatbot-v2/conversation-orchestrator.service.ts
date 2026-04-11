import type {
  ChatbotV2ResourceDescriptor,
  ConversationOrchestratorInput,
  ConversationOrchestrationResult,
  JourneySnapshot,
  ResourceRegistryInput,
} from './types.js';
import { JourneyEngineService } from './journey-engine.service.js';
import { RequestClassifierService } from './request-classifier.service.js';
import { ResourceRegistryService } from './resource-registry.service.js';

export class ConversationOrchestratorService {
  constructor(
    private readonly classifier: RequestClassifierService = new RequestClassifierService(),
    private readonly journeyEngine: JourneyEngineService = new JourneyEngineService(),
    private readonly resourceRegistry: ResourceRegistryService = new ResourceRegistryService(),
  ) {}

  orchestrate(input: ConversationOrchestratorInput): ConversationOrchestrationResult {
    const classification = input.classification ?? this.classifier.classify({
      recentMessages: [{
        role: 'USER',
        content: input.userMessage ?? '',
      }],
      conversationSummary: '',
      journeySnapshot: input.journeySnapshot,
      allowedResourceHints: [],
      userMessage: input.userMessage ?? '',
      resolvedIntent: input.resolvedIntent,
    });

    const currentRegistryInput = this.toRegistryInput(input, input.journeySnapshot);
    const currentAllowedResources = this.resourceRegistry.listResources(currentRegistryInput);
    const includeProgressionFollowUpAccepted = this.shouldAcceptProgressionFollowUp(input, classification);
    const journeyUpdate = this.computeJourneyUpdate(input, classification, includeProgressionFollowUpAccepted);
    const projectedSnapshot = journeyUpdate ?? input.journeySnapshot;
    const projectedRegistryInput = this.toRegistryInput(input, projectedSnapshot);
    const projectedAllowedResources = this.resourceRegistry.listResources(projectedRegistryInput);
    const targetedResources = projectedAllowedResources.filter((resource) =>
      classification.targetResourceTypes.includes(resource.resourceType),
    );
    const allowedResources = targetedResources.length > 0
      ? dedupeResources(targetedResources)
      : projectedAllowedResources;
    const resourceUpdates = this.computeResourceUpdates({
      hasJourneyUpdate: journeyUpdate != null,
      targetedResources: allowedResources,
      currentAllowedResources,
      projectedAllowedResources,
      hasTargetedResources: targetedResources.length > 0,
    });

    return {
      requestClass: classification.requestClass,
      responseIntent: classification.requestClass,
      allowedResources,
      includeProgressionFollowUpAccepted,
      journeyUpdate,
      resourceUpdates,
    };
  }

  private computeJourneyUpdate(
    input: ConversationOrchestratorInput,
    classification: {
      requestClass: ConversationOrchestrationResult['requestClass'];
      targetResourceTypes: string[];
    },
    includeProgressionFollowUpAccepted: boolean,
  ): JourneySnapshot | undefined {
    if (
      (
        classification.requestClass === 'progression_request'
        || includeProgressionFollowUpAccepted
        || (
          classification.requestClass === 'resource_request'
          && classification.targetResourceTypes.some((resourceType) =>
            resourceType === 'MEDICAL_DOC_UPLOAD'
            || resourceType === 'QUESTIONNAIRE'
            || resourceType === 'HOSPITAL_RECOMMENDATION'
            || resourceType === 'PACKAGE_RECOMMENDATION'
          )
        )
      )
      && input.journeySnapshot.currentStage === 'EXPLAIN_PROCESS'
    ) {
      return this.journeyEngine.advanceSnapshot(input.journeySnapshot, {
        type: 'START_MEDICAL_INPUTS',
      });
    }

    if (
      classification.requestClass === 'human_help_request'
      && input.journeySnapshot.currentStage !== 'HUMAN_HANDOFF'
    ) {
      return this.journeyEngine.advanceSnapshot(input.journeySnapshot, {
        type: 'REQUEST_HUMAN_HANDOFF',
      });
    }

    return undefined;
  }

  private shouldAcceptProgressionFollowUp(
    input: ConversationOrchestratorInput,
    classification: {
      requestClass: ConversationOrchestrationResult['requestClass'];
      includeProgressionFollowUp?: boolean;
    },
  ): boolean {
    if (!classification.includeProgressionFollowUp) {
      return false;
    }

    if (
      classification.requestClass !== 'faq'
      && classification.requestClass !== 'process_explanation'
    ) {
      return false;
    }

    return input.journeySnapshot.currentStage === 'EXPLAIN_PROCESS';
  }

  private toRegistryInput(
    input: ConversationOrchestratorInput,
    journeySnapshot: JourneySnapshot,
  ): ResourceRegistryInput {
    return {
      scopeId: input.scopeId,
      journeySnapshot: normalizeSnapshotForResources(journeySnapshot),
      truth: {
        medicalInputsSubmitted: input.truth.medicalInputsSubmitted,
        recommendationConfirmed: input.truth.recommendationConfirmed,
        onlineConsultSubmitted: input.truth.onlineConsultSubmitted,
        humanHandoffSubmitted: input.truth.humanHandoffSubmitted,
      },
    };
  }

  private computeResourceUpdates(input: {
    hasJourneyUpdate: boolean;
    targetedResources: ChatbotV2ResourceDescriptor[];
    currentAllowedResources: ChatbotV2ResourceDescriptor[];
    projectedAllowedResources: ChatbotV2ResourceDescriptor[];
    hasTargetedResources: boolean;
  }): ChatbotV2ResourceDescriptor[] | undefined {
    if (!input.hasJourneyUpdate) {
      return undefined;
    }

    if (input.hasTargetedResources) {
      return input.targetedResources;
    }

    const currentIds = new Set(input.currentAllowedResources.map((resource) => resource.resourceId));
    const updates = input.projectedAllowedResources.filter((resource) => !currentIds.has(resource.resourceId));
    return updates.length > 0 ? updates : undefined;
  }
}

function normalizeSnapshotForResources(snapshot: JourneySnapshot): JourneySnapshot {
  if (snapshot.currentPhase !== 'pre') {
    return snapshot;
  }

  // Pre-phase transitions still need the next-stage resources to be orchestrated.
  return {
    currentStage: snapshot.currentStage,
    currentPhase: 'active',
  };
}

function dedupeResources(resources: ChatbotV2ResourceDescriptor[]): ChatbotV2ResourceDescriptor[] {
  const byId = new Map<string, ChatbotV2ResourceDescriptor>();
  for (const resource of resources) {
    byId.set(resource.resourceId, resource);
  }

  return [...byId.values()];
}
