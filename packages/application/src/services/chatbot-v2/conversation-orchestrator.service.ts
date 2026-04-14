import type {
  ChatbotV2ResourceDescriptor,
  ConversationOrchestratorInput,
  ConversationOrchestrationResult,
  JourneySnapshot,
  ResourceRegistryInput,
} from './types.js';
import { JourneyEngineService } from './journey-engine.service.js';
import { ResourceRegistryService } from './resource-registry.service.js';

export class ConversationOrchestratorService {
  constructor(
    private readonly journeyEngine: JourneyEngineService = new JourneyEngineService(),
    private readonly resourceRegistry: ResourceRegistryService = new ResourceRegistryService(),
  ) {}

  orchestrate(input: ConversationOrchestratorInput): ConversationOrchestrationResult {
    if (!input.classification) {
      throw new Error('classifier output is required');
    }
    const classification = input.classification;

    const includeProgressionFollowUpAccepted = this.shouldAcceptProgressionFollowUp(input, classification);
    const journeyUpdate = this.computeJourneyUpdate(input, classification, includeProgressionFollowUpAccepted);
    const projectedSnapshot = journeyUpdate ?? input.journeySnapshot;
    const projectedRegistryInput = this.toRegistryInput(input, projectedSnapshot);
    const projectedAllowedResources = this.resourceRegistry.listResources(projectedRegistryInput);
    const explicitlyTargetedResources = projectedAllowedResources.filter((resource) =>
      classification.targetResourceTypes.includes(resource.resourceType),
    );
    const targetedResources = explicitlyTargetedResources.length > 0
      ? explicitlyTargetedResources
      : this.resolveImplicitTargetedResources(input.journeySnapshot, classification, projectedAllowedResources);
    const shouldMergeTargetedWithProjected = includeProgressionFollowUpAccepted
      && (
        classification.requestClass === 'faq'
        || classification.requestClass === 'process_explanation'
      );
    const allowedResources = targetedResources.length > 0
      ? (
          shouldMergeTargetedWithProjected
            ? dedupeResources([...targetedResources, ...projectedAllowedResources])
            : dedupeResources(targetedResources)
        )
      : projectedAllowedResources;
    return {
      requestClass: classification.requestClass,
      responseIntent: classification.requestClass,
      allowedResources,
      includeProgressionFollowUpAccepted,
      requiresFaqGrounding: this.requiresFaqGrounding(classification.requestClass),
      journeyUpdate,
    };
  }

  private requiresFaqGrounding(
    requestClass: ConversationOrchestrationResult['requestClass'],
  ): boolean {
    return requestClass === 'faq' || requestClass === 'process_explanation';
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
      classification.requestClass === 'human_help_request'
      && input.journeySnapshot.currentStage !== 'HUMAN_HANDOFF'
    ) {
      return this.journeyEngine.advanceSnapshot(input.journeySnapshot, {
        type: 'ENTER_HUMAN_HANDOFF_PRE',
      });
    }

    if (input.journeySnapshot.currentStage === 'HUMAN_HANDOFF') {
      const isHandoffConfirmation =
        classification.requestClass === 'human_help_request'
        || classification.requestClass === 'progression_request'
        || (
          classification.requestClass === 'resource_request'
          && classification.targetResourceTypes.includes('HUMAN_HANDOFF')
        );

      if (input.journeySnapshot.currentPhase === 'pre' && isHandoffConfirmation) {
        return this.journeyEngine.advanceSnapshot(input.journeySnapshot, {
          type: 'ENTER_HUMAN_HANDOFF_ACTIVE',
        });
      }

      if (input.journeySnapshot.currentPhase === 'active' && isHandoffConfirmation) {
        return this.journeyEngine.advanceSnapshot(input.journeySnapshot, {
          type: 'ENTER_HUMAN_HANDOFF_POST',
        });
      }
    }

    if (
      input.journeySnapshot.currentStage === 'COLLECT_MEDICAL_INPUTS'
      && input.journeySnapshot.currentPhase === 'active'
      && input.truth.medicalInputsSubmitted
    ) {
      return this.journeyEngine.advanceSnapshot(input.journeySnapshot, {
        type: 'ENTER_COLLECT_MEDICAL_INPUTS_POST',
      });
    }

    if (
      input.journeySnapshot.currentStage === 'RECOMMENDATION'
      && input.journeySnapshot.currentPhase === 'active'
      && input.truth.recommendationConfirmed
    ) {
      return this.journeyEngine.advanceSnapshot(input.journeySnapshot, {
        type: 'ENTER_RECOMMENDATION_POST',
      });
    }

    if (
      input.journeySnapshot.currentStage === 'ONLINE_CONSULT'
      && input.journeySnapshot.currentPhase === 'active'
      && input.truth.onlineConsultSubmitted
    ) {
      return this.journeyEngine.advanceSnapshot(input.journeySnapshot, {
        type: 'ENTER_ONLINE_CONSULT_POST',
      });
    }

    if (input.journeySnapshot.currentStage === 'EXPLAIN_PROCESS') {
      if (
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
      ) {
        return this.journeyEngine.advanceSnapshot(input.journeySnapshot, {
          type: 'ENTER_COLLECT_MEDICAL_INPUTS_PRE',
        });
      }
    }

    if (input.journeySnapshot.currentStage === 'COLLECT_MEDICAL_INPUTS') {
      const targetsCurrentCollectStep = classification.targetResourceTypes.some((resourceType) =>
        resourceType === 'MEDICAL_DOC_UPLOAD'
        || resourceType === 'QUESTIONNAIRE',
      );
      if (
        input.journeySnapshot.currentPhase === 'active'
        && (
          (
            classification.requestClass === 'progression_request'
            && !targetsCurrentCollectStep
          )
          || includeProgressionFollowUpAccepted
          || (
            classification.requestClass === 'resource_request'
            && classification.targetResourceTypes.some((resourceType) =>
              resourceType === 'HOSPITAL_RECOMMENDATION'
              || resourceType === 'PACKAGE_RECOMMENDATION'
            )
          )
        )
      ) {
        return this.journeyEngine.advanceSnapshot(input.journeySnapshot, {
          type: 'ENTER_RECOMMENDATION_PRE',
        });
      }

      if (
        input.journeySnapshot.currentPhase === 'pre'
        && (
          classification.requestClass === 'progression_request'
          || (
            classification.requestClass === 'resource_request'
            && classification.targetResourceTypes.some((resourceType) =>
              resourceType === 'MEDICAL_DOC_UPLOAD'
              || resourceType === 'QUESTIONNAIRE'
            )
          )
        )
      ) {
        return this.journeyEngine.advanceSnapshot(input.journeySnapshot, {
          type: 'ENTER_COLLECT_MEDICAL_INPUTS_ACTIVE',
        });
      }

      if (
        input.journeySnapshot.currentPhase === 'post'
        && (
          classification.requestClass === 'progression_request'
          || includeProgressionFollowUpAccepted
          || (
            classification.requestClass === 'resource_request'
            && classification.targetResourceTypes.some((resourceType) =>
              resourceType === 'HOSPITAL_RECOMMENDATION'
              || resourceType === 'PACKAGE_RECOMMENDATION'
            )
          )
        )
      ) {
        return this.journeyEngine.advanceSnapshot(input.journeySnapshot, {
          type: 'ENTER_RECOMMENDATION_PRE',
        });
      }
    }

    if (input.journeySnapshot.currentStage === 'RECOMMENDATION') {
      const targetsCurrentRecommendationStep = classification.targetResourceTypes.some((resourceType) =>
        resourceType === 'HOSPITAL_RECOMMENDATION'
        || resourceType === 'PACKAGE_RECOMMENDATION',
      );
      if (
        input.journeySnapshot.currentPhase === 'active'
        && (
          (
            classification.requestClass === 'progression_request'
            && !targetsCurrentRecommendationStep
          )
          || includeProgressionFollowUpAccepted
          || (
            classification.requestClass === 'resource_request'
            && classification.targetResourceTypes.some((resourceType) =>
              resourceType === 'ONLINE_CONSULT_BOOKING'
            )
          )
        )
      ) {
        return this.journeyEngine.advanceSnapshot(input.journeySnapshot, {
          type: 'ENTER_ONLINE_CONSULT_PRE',
        });
      }

      if (
        input.journeySnapshot.currentPhase === 'pre'
        && (
          classification.requestClass === 'progression_request'
          || (
            classification.requestClass === 'resource_request'
            && classification.targetResourceTypes.some((resourceType) =>
              resourceType === 'HOSPITAL_RECOMMENDATION'
              || resourceType === 'PACKAGE_RECOMMENDATION'
            )
          )
        )
      ) {
        return this.journeyEngine.advanceSnapshot(input.journeySnapshot, {
          type: 'ENTER_RECOMMENDATION_ACTIVE',
        });
      }

      if (
        input.journeySnapshot.currentPhase === 'post'
        && (
          classification.requestClass === 'progression_request'
          || includeProgressionFollowUpAccepted
          || (
            classification.requestClass === 'resource_request'
            && classification.targetResourceTypes.some((resourceType) =>
              resourceType === 'ONLINE_CONSULT_BOOKING'
            )
          )
        )
      ) {
        return this.journeyEngine.advanceSnapshot(input.journeySnapshot, {
          type: 'ENTER_ONLINE_CONSULT_PRE',
        });
      }
    }

    if (
      input.journeySnapshot.currentStage === 'ONLINE_CONSULT'
      && input.journeySnapshot.currentPhase === 'pre'
      && (
        classification.requestClass === 'progression_request'
        || (
          classification.requestClass === 'resource_request'
          && classification.targetResourceTypes.includes('ONLINE_CONSULT_BOOKING')
        )
      )
    ) {
      return this.journeyEngine.advanceSnapshot(input.journeySnapshot, {
        type: 'ENTER_ONLINE_CONSULT_ACTIVE',
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

    return input.journeySnapshot.currentStage !== 'HUMAN_HANDOFF';
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
      },
    };
  }

  private resolveImplicitTargetedResources(
    journeySnapshot: JourneySnapshot,
    classification: {
      requestClass: ConversationOrchestrationResult['requestClass'];
    },
    projectedAllowedResources: ChatbotV2ResourceDescriptor[],
  ): ChatbotV2ResourceDescriptor[] {
    if (classification.requestClass === 'human_help_request') {
      return projectedAllowedResources.filter((resource) => resource.resourceType === 'HUMAN_HANDOFF');
    }

    if (
      journeySnapshot.currentStage === 'HUMAN_HANDOFF'
      && classification.requestClass === 'progression_request'
    ) {
      return projectedAllowedResources.filter((resource) => resource.resourceType === 'HUMAN_HANDOFF');
    }

    return [];
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
