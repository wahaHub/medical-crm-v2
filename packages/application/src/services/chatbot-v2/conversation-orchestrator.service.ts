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
    const journeyUpdate = this.computeJourneyUpdate(input, classification);
    const responseIntent = this.computeResponseIntent(input, classification);
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
      responseIntent,
      allowedResources,
      includeProgressionFollowUpAccepted,
      requiresFaqGrounding: this.requiresFaqGrounding(responseIntent),
      journeyUpdate,
    };
  }

  orchestratePostTurn(input: {
    scopeId: string;
    journeySnapshot: JourneySnapshot;
    truth: ConversationOrchestratorInput['truth'];
    assistantNextAction?: string | null;
    assistantInternalNextAction?: string | null;
  }): Pick<ConversationOrchestrationResult, 'allowedResources' | 'journeyUpdate'> {
    const journeyUpdate = this.computePostTurnJourneyUpdate(input);
    const projectedSnapshot = journeyUpdate ?? input.journeySnapshot;
    const projectedRegistryInput = this.toRegistryInput(input, projectedSnapshot);
    return {
      journeyUpdate,
      allowedResources: this.resourceRegistry.listResources(projectedRegistryInput),
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
      if (
        input.journeySnapshot.currentPhase === 'pre'
        && this.isExplicitHandoffAgreement(classification)
      ) {
        return this.journeyEngine.advanceSnapshot(input.journeySnapshot, {
          type: 'ENTER_HUMAN_HANDOFF_ACTIVE',
        });
      }

      return undefined;
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
      if (input.journeySnapshot.currentPhase === 'pre') {
        if (this.isExplicitExplainAgreement(classification)) {
          return this.journeyEngine.advanceSnapshot(input.journeySnapshot, {
            type: 'ENTER_EXPLAIN_PROCESS_ACTIVE',
          });
        }

        return undefined;
      }

      return undefined;
    }

    if (input.journeySnapshot.currentStage === 'COLLECT_MEDICAL_INPUTS') {
      const targetsCurrentCollectStep = this.targetsCollectMedicalInputs(classification.targetResourceTypes);
      if (
        input.journeySnapshot.currentPhase === 'pre'
        && this.isExplicitStageAgreement(classification, targetsCurrentCollectStep)
      ) {
        return this.journeyEngine.advanceSnapshot(input.journeySnapshot, {
          type: 'ENTER_COLLECT_MEDICAL_INPUTS_ACTIVE',
        });
      }

      if (
        input.journeySnapshot.currentPhase === 'active'
        && this.shouldDismissCollectMedicalInputs(classification, targetsCurrentCollectStep)
      ) {
        return this.journeyEngine.advanceSnapshot(input.journeySnapshot, {
          type: 'ENTER_COLLECT_MEDICAL_INPUTS_POST',
        });
      }

      return undefined;
    }

    if (input.journeySnapshot.currentStage === 'RECOMMENDATION') {
      const targetsCurrentRecommendationStep = this.targetsRecommendation(classification.targetResourceTypes);
      if (
        input.journeySnapshot.currentPhase === 'pre'
        && this.isExplicitStageAgreement(classification, targetsCurrentRecommendationStep)
      ) {
        return this.journeyEngine.advanceSnapshot(input.journeySnapshot, {
          type: 'ENTER_RECOMMENDATION_ACTIVE',
        });
      }

      if (
        input.journeySnapshot.currentPhase === 'active'
        && this.shouldDismissRecommendation(classification, targetsCurrentRecommendationStep)
      ) {
        return this.journeyEngine.advanceSnapshot(input.journeySnapshot, {
          type: 'ENTER_RECOMMENDATION_POST',
        });
      }

      return undefined;
    }

    if (
      input.journeySnapshot.currentStage === 'ONLINE_CONSULT'
    ) {
      if (
        input.journeySnapshot.currentPhase === 'pre'
        && this.isExplicitStageAgreement(
          classification,
          classification.requestClass === 'resource_request'
            && classification.targetResourceTypes.includes('ONLINE_CONSULT_BOOKING'),
        )
      ) {
        return this.journeyEngine.advanceSnapshot(input.journeySnapshot, {
          type: 'ENTER_ONLINE_CONSULT_ACTIVE',
        });
      }

      return undefined;
    }

    return undefined;
  }

  private computeResponseIntent(
    input: ConversationOrchestratorInput,
    classification: {
      requestClass: ConversationOrchestrationResult['requestClass'];
      targetResourceTypes?: string[];
    },
  ): ConversationOrchestrationResult['responseIntent'] {
    if (
      input.journeySnapshot.currentStage === 'EXPLAIN_PROCESS'
      && input.journeySnapshot.currentPhase === 'pre'
      && this.isExplicitExplainAgreement({
        requestClass: classification.requestClass,
        targetResourceTypes: classification.targetResourceTypes ?? [],
      })
    ) {
      return 'process_explanation';
    }

    if (
      input.journeySnapshot.currentStage === 'EXPLAIN_PROCESS'
      && input.journeySnapshot.currentPhase === 'active'
      && classification.requestClass !== 'human_help_request'
    ) {
      return 'process_explanation';
    }

    if (
      classification.requestClass === 'process_explanation'
      && input.journeySnapshot.currentStage !== 'EXPLAIN_PROCESS'
    ) {
      return 'faq';
    }

    return classification.requestClass;
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

  private computePostTurnJourneyUpdate(input: {
    journeySnapshot: JourneySnapshot;
    truth: ConversationOrchestratorInput['truth'];
    assistantNextAction?: string | null;
    assistantInternalNextAction?: string | null;
  }): JourneySnapshot | undefined {
    if (
      input.journeySnapshot.currentStage === 'EXPLAIN_PROCESS'
      && input.journeySnapshot.currentPhase === 'active'
    ) {
      return this.journeyEngine.advanceSnapshot(input.journeySnapshot, {
        type: 'ENTER_COLLECT_MEDICAL_INPUTS_PRE',
      });
    }

    if (
      input.journeySnapshot.currentStage === 'COLLECT_MEDICAL_INPUTS'
      && input.journeySnapshot.currentPhase === 'post'
    ) {
      return this.journeyEngine.advanceSnapshot(input.journeySnapshot, {
        type: 'ENTER_RECOMMENDATION_PRE',
      });
    }

    if (
      input.journeySnapshot.currentStage === 'RECOMMENDATION'
      && input.journeySnapshot.currentPhase === 'post'
    ) {
      return this.journeyEngine.advanceSnapshot(input.journeySnapshot, {
        type: 'ENTER_ONLINE_CONSULT_PRE',
      });
    }

    const normalizedAction = input.assistantInternalNextAction ?? input.assistantNextAction ?? null;
    if (
      input.journeySnapshot.currentStage === 'HUMAN_HANDOFF'
      && input.journeySnapshot.currentPhase === 'active'
      && normalizedAction === 'HUMAN_HANDOFF'
    ) {
      return this.journeyEngine.advanceSnapshot(input.journeySnapshot, {
        type: 'ENTER_HUMAN_HANDOFF_POST',
      });
    }

    return undefined;
  }

  private isExplicitExplainAgreement(classification: {
    requestClass: ConversationOrchestrationResult['requestClass'];
    targetResourceTypes: string[];
  }): boolean {
    // In EXPLAIN_PROCESS.pre, asking about the process is not the same as
    // agreeing to move from the invitation into the single active explain turn.
    // Treat only bare "continue / okay / go ahead" style progression as consent.
    return classification.requestClass === 'progression_request'
      && classification.targetResourceTypes.length === 0;
  }

  private isExplicitHandoffAgreement(classification: {
    requestClass: ConversationOrchestrationResult['requestClass'];
    targetResourceTypes: string[];
  }): boolean {
    return classification.requestClass === 'human_help_request'
      || classification.requestClass === 'progression_request'
      || (
        classification.requestClass === 'resource_request'
        && classification.targetResourceTypes.includes('HUMAN_HANDOFF')
      );
  }

  private isExplicitStageAgreement(
    classification: {
      requestClass: ConversationOrchestrationResult['requestClass'];
    },
    targetsCurrentStageResource: boolean,
  ): boolean {
    return classification.requestClass === 'progression_request'
      || (
        classification.requestClass === 'resource_request'
        && targetsCurrentStageResource
      );
  }

  private shouldDismissCollectMedicalInputs(
    classification: {
      requestClass: ConversationOrchestrationResult['requestClass'];
      targetResourceTypes: string[];
    },
    targetsCurrentCollectStep: boolean,
  ): boolean {
    return (
      classification.requestClass === 'progression_request'
      && !targetsCurrentCollectStep
    ) || (
      classification.requestClass === 'resource_request'
      && this.targetsRecommendation(classification.targetResourceTypes)
    );
  }

  private shouldDismissRecommendation(
    classification: {
      requestClass: ConversationOrchestrationResult['requestClass'];
      targetResourceTypes: string[];
    },
    targetsCurrentRecommendationStep: boolean,
  ): boolean {
    return (
      classification.requestClass === 'progression_request'
      && !targetsCurrentRecommendationStep
    ) || (
      classification.requestClass === 'resource_request'
      && classification.targetResourceTypes.includes('ONLINE_CONSULT_BOOKING')
    );
  }

  private targetsCollectMedicalInputs(targetResourceTypes: string[]): boolean {
    return targetResourceTypes.some((resourceType) =>
      resourceType === 'MEDICAL_DOC_UPLOAD'
      || resourceType === 'QUESTIONNAIRE',
    );
  }

  private targetsRecommendation(targetResourceTypes: string[]): boolean {
    return targetResourceTypes.some((resourceType) =>
      resourceType === 'HOSPITAL_RECOMMENDATION'
      || resourceType === 'PACKAGE_RECOMMENDATION',
    );
  }

  private toRegistryInput(
    input: Pick<ConversationOrchestratorInput, 'scopeId' | 'journeySnapshot' | 'truth'>,
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
